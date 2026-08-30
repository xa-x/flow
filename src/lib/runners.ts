import { generateImage, streamText, experimental_generateVideo } from "ai";
import type { LanguageModel, ImageModel } from "ai";
import type {
  NodeData,
  NodeOutput,
  RunEvent,
  RunSettings,
  UsageInfo,
} from "./types";
import { nodeDef } from "./nodes";
import { readArtifactBytes, saveArtifact, shrinkReferenceImage } from "./artifacts";
import { ensurePlayableAudio } from "./audio";
import { resolveProvider, providerSpec, canonicalProviderId } from "./providers";
import {
  requireAspect,
  requireDuration,
  requireSize,
  resolveVoice,
} from "./media-params";

/**
 * Node runners — every AI call goes through the provider registry
 * (AI SDK model instances), with per-node usage/cost tracking.
 */

export const DEFAULT_PROVIDER = "openrouter";

const DEFAULTS: Record<string, { provider: string; model: string }> = {
  llm: { provider: "openrouter", model: "stealth/ox-alpha" },
  "image.gen": {
    provider: "openrouter",
    model: "bytedance-seed/seedream-5-0-lite",
  },
  tts: { provider: "openrouter", model: "openai/gpt-audio-mini" },
  "video.gen": { provider: "openrouter", model: "bytedance/seedance-2.5" },
};

export const modelFor = (d: NodeData) =>
  d.model || DEFAULTS[d.kind]?.model || "";

export const providerFor = (d: NodeData) =>
  canonicalProviderId(d.provider || DEFAULTS[d.kind]?.provider || DEFAULT_PROVIDER);

/** Collect text-ish inputs (strings) into prompt parts. */
function textInputs(inputs: Record<string, NodeOutput[]>) {
  for (const key of ["in", "prompt", "text"] as const) {
    const list = inputs[key];
    if (list?.some((o) => o.type === "text" && o.text.trim())) return list;
  }
  return [];
}

function promptFrom(inputs: Record<string, NodeOutput[]>, data: NodeData) {
  const incoming = textInputs(inputs)
    .filter((o): o is { type: "text"; text: string } => o.type === "text")
    .map((o) => o.text)
    .join("\n\n");
  if (data.kind === "tts") return data.prompt?.trim() || incoming;
  const parts: string[] = [];
  if (data.prompt?.trim()) parts.push(data.prompt.trim());
  if (incoming) parts.push(incoming);
  return parts.join("\n\n");
}

export interface RunCtx {
  settings?: RunSettings;
  emit: (e: RunEvent) => void;
  nodeId: string;
}

export interface NodeResult {
  outputs: NodeOutput[];
  usage?: UsageInfo;
}

export async function runNode(
  nodeId: string,
  data: NodeData,
  inputs: Record<string, NodeOutput[]>,
  ctx: RunCtx,
): Promise<NodeResult> {
  const settings = ctx.settings;

  switch (data.kind) {
    case "text":
    case "note":
      return { outputs: [{ type: "text", text: data.text ?? "" }] };

    case "image.in":
    case "audio.in":
    case "video.in": {
      if (!data.artifactId) return { outputs: [] };
      const kind = data.kind.split(".")[0] as "image" | "audio" | "video";
      return {
        outputs: [
          { type: kind, artifactId: data.artifactId, url: `/api/media/${data.artifactId}` },
        ],
      };
    }

    case "llm": {
      const prompt = promptFrom(inputs, data);
      if (!prompt.trim()) return { outputs: [] };
      const provider = providerFor(data);
      const model = modelFor(data);
      const p = resolveProvider(provider, settings);
      // vision: attach first upstream image
      const image = (inputs.image ?? []).find((o) => o.type === "image") as
        | { type: "image"; url?: string; artifactId?: string }
        | undefined;

      const content: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: string; mediaType: "image/png" }
      > = [{ type: "text", text: prompt }];
      if (image?.url || image?.artifactId) {
        content.push({
          type: "file",
          data: absoluteUrl(image.url ?? `/api/media/${image.artifactId}`),
          mediaType: "image/png",
        });
      }

      const result = streamText({
        model: p.gw.chat(model) as LanguageModel,
        messages: [{ role: "user", content }],
        temperature: data.temperature,
      });

      // stream deltas to the canvas as they arrive
      for await (const delta of result.textStream) {
        ctx.emit({ type: "delta", nodeId, text: delta, ts: Date.now() });
      }
      const text = await result.text;
      const u = await result.usage;
      const meta = await result.providerMetadata;
      // OpenRouter reports cost via provider metadata (openrouter.usage.cost)
      const orUsage = (
        meta?.openrouter as { usage?: { cost?: number } } | undefined
      )?.usage;
      return {
        outputs: [{ type: "text", text }],
        usage: {
          tokensIn: u?.inputTokens,
          tokensOut: u?.outputTokens,
          costUsd: orUsage?.cost,
          model,
        },
      };
    }

    case "image.gen": {
      const prompt = promptFrom(inputs, data);
      const refs = (inputs.image ?? []).filter(
        (o): o is { type: "image"; url?: string; artifactId?: string } =>
          o.type === "image",
      );
      if (!prompt.trim() && !refs.length) return { outputs: [] };
      const p = resolveProvider(providerFor(data), settings);
      const model = modelFor(data);

      const images: Array<Uint8Array | string> = [];
      for (const ref of refs) {
        const content = await loadImageContent(ref);
        if (content) images.push(content);
      }

      const text =
        prompt ||
        (images.length
          ? "Keep the main subject of the reference image. Replace only the background with a professional complementary scene. Output a finished photograph."
          : "abstract composition");

      const size = requireSize(data.size);
      const aspectRatio = size ? undefined : requireAspect(data.aspectRatio);

      const { image } = await generateImage({
        model: p.gw.imageModel(model) as unknown as ImageModel,
        prompt: images.length ? { text, images } : text,
        maxRetries: 0,
        ...(size ? { size } : {}),
        ...(aspectRatio ? { aspectRatio } : {}),
      });
      const art = await saveArtifact(
        image.uint8Array,
        image.mediaType || "image/png",
        "image",
      );
      return {
        outputs: [
          { type: "image", artifactId: art.id, url: `/api/media/${art.id}` },
        ],
        usage: { model },
      };
    }

    case "tts": {
      const prompt = promptFrom(inputs, data);
      if (!prompt.trim()) return { outputs: [] };
      // The provider instance has no speech model — call the provider's
      // OpenAI-compatible speech endpoint directly.
      const p = resolveProvider(providerFor(data), settings);
      const model = modelFor(data);
      const voice = resolveVoice(model, data.voice);
      const res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${p.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt.slice(0, 4000),
          response_format: "mp3",
          ...(voice ? { voice } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(
          `TTS failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
        );
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const mime = res.headers.get("content-type") || "audio/mpeg";
      if (mime.includes("json") || mime.includes("application/json"))
        throw new Error("TTS returned JSON, expected audio");
      const playable = ensurePlayableAudio(buf, mime);
      const art = await saveArtifact(playable.data, playable.mime, "audio");
      return {
        outputs: [
          { type: "audio", artifactId: art.id, url: `/api/media/${art.id}` },
        ],
        usage: { model },
      };
    }

    case "video.gen": {
      const prompt = promptFrom(inputs, data);
      const firstFrame = (inputs.image ?? []).find(
        (o) => o.type === "image",
      ) as { type: "image"; artifactId?: string; url?: string } | undefined;
      if (!prompt.trim() && !firstFrame) return { outputs: [] };

      const provider = providerFor(data);
      const spec = providerSpec(provider);
      if (spec && !spec.caps.includes("video"))
        throw new Error(
          `Provider "${provider}" does not serve video models — use OpenRouter.`,
        );

      const p = resolveProvider(provider, settings);
      const model = modelFor(data);
      const frameImages = firstFrame
        ? [
            {
              image: absoluteUrl(
                firstFrame.url ?? `/api/media/${firstFrame.artifactId}`,
              ),
              frameType: "first_frame" as const,
            },
          ]
        : undefined;

      const aspectRatio = requireAspect(data.aspectRatio);
      const resolution = requireSize(data.resolution, "resolution");
      const duration = requireDuration(data.duration);

      const { videos } = await experimental_generateVideo({
        model: p.gw.videoModel(model),
        prompt: prompt || "",
        frameImages,
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(resolution ? { resolution } : {}),
        ...(duration ? { duration } : {}),
        download: async ({ url }) => {
          const r = await fetch(url);
          return {
            data: new Uint8Array(await r.arrayBuffer()),
            mediaType: "video/mp4",
          };
        },
      });
      const v = videos[0];
      if (!v) throw new Error("Video generation returned no videos");
      const art = await saveArtifact(v.uint8Array, "video/mp4", "video");
      return {
        outputs: [
          { type: "video", artifactId: art.id, url: `/api/media/${art.id}` },
        ],
        usage: { model },
      };
    }

    case "out.text": {
      const t = (inputs.in ?? []).find((o) => o.type === "text");
      return { outputs: t ? [t] : [] };
    }

    case "out.media": {
      const outs: NodeOutput[] = [];
      const img = (inputs.in ?? []).find((o) => o.type === "image");
      if (img) outs.push(img);
      const aud = (inputs.audio ?? []).find((o) => o.type === "audio");
      if (aud) outs.push(aud);
      const vid = (inputs.video ?? []).find((o) => o.type === "video");
      if (vid) outs.push(vid);
      return { outputs: outs };
    }

    default:
      return { outputs: [] };
  }
}

function absoluteUrl(p?: string) {
  const path = p ?? "";
  const base = process.env.FLOWBOOK_URL ?? "http://localhost:3000";
  return path.startsWith("http") ? path : `${base}${path}`;
}

async function loadImageContent(img: {
  url?: string;
  artifactId?: string;
}): Promise<Uint8Array | string | null> {
  const id =
    img.artifactId ?? img.url?.match(/\/api\/media\/([^/?#]+)/)?.[1];
  if (id) {
    const hit = await readArtifactBytes(id);
    if (hit) return shrinkReferenceImage(hit.data);
  }
  if (img.url?.startsWith("http")) return img.url;
  if (img.url) return absoluteUrl(img.url);
  return null;
}

export { nodeDef };
