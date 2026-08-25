import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, generateImage } from "ai";
import type { NodeData, NodeOutput } from "./types";
import { nodeDef } from "./nodes";
import { saveArtifact } from "./artifacts";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const DEFAULTS: Record<string, string> = {
  llm: "deepseek/deepseek-v4-pro-0813",
  "image.gen": "bytedance-seed/seedream-5-0-pro",
  tts: "openai/gpt-audio-mini",
  "video.gen": "bytedance/seedance-2.0",
};

export const modelFor = (d: NodeData) => d.model || DEFAULTS[d.kind] || "";

/** Collect text-ish inputs (strings) into prompt parts. */
function promptFrom(inputs: Record<string, NodeOutput[]>, data: NodeData) {
  const parts: string[] = [];
  if (data.prompt?.trim()) parts.push(data.prompt.trim());
  const ctx = (inputs.in ?? inputs.prompt ?? inputs.text ?? [])
    .filter((o): o is { type: "text"; text: string } => o.type === "text")
    .map((o) => o.text);
  parts.push(...ctx);
  return parts.join("\n\n");
}

export async function runNode(
  nodeId: string,
  data: NodeData,
  inputs: Record<string, NodeOutput[]>,
): Promise<NodeOutput[]> {
  const model = modelFor(data);

  switch (data.kind) {
    case "text":
    case "note":
      return [{ type: "text", text: data.text ?? "" }];

    case "image.in":
      if (data.artifactId)
        return [{ type: "image", artifactId: data.artifactId, url: `/api/media/${data.artifactId}` }];
      return [];

    case "audio.in":
      if (data.artifactId)
        return [{ type: "audio", artifactId: data.artifactId, url: `/api/media/${data.artifactId}` }];
      return [];

    case "video.in":
      if (data.artifactId)
        return [{ type: "video", artifactId: data.artifactId, url: `/api/media/${data.artifactId}` }];
      return [];

    case "llm": {
      const prompt = promptFrom(inputs, data);
      if (!prompt.trim()) return [];
      // Vision: attach the first upstream image if present.
      const image = (inputs.image ?? []).find((o) => o.type === "image") as
        | { type: "image"; url: string; artifactId?: string }
        | undefined;

      const messages: Parameters<typeof generateText>[0]["messages"] = [
        { role: "user", content: prompt },
      ];
      if (image?.url) {
        messages[0] = {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "file",
              data: absoluteUrl(image.url),
              mediaType: "image/png",
            },
          ],
        };
      }

      const { text } = await generateText({
        model: openrouter.chat(model),
        messages,
      });
      return [{ type: "text", text }];
    }

    case "image.gen": {
      const prompt = promptFrom(inputs, data);
      if (!prompt.trim() && !(inputs.image ?? []).length) return [];
      const { image } = await generateImage({
        model: openrouter.imageModel(model),
        prompt: prompt || "abstract composition",
      });
      const art = await saveArtifact(
        image.uint8Array,
        image.mediaType || "image/png",
        "image",
      );
      return [{ type: "image", artifactId: art.id, url: `/api/media/${art.id}` }];
    }

    case "tts": {
      const prompt = promptFrom(inputs, data);
      if (!prompt.trim()) return [];
      // OpenRouter audio generation endpoint (OpenAI-compatible shape).
      const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: prompt.slice(0, 4000),
          voice: data.voice || "alloy",
        }),
      });
      if (!res.ok) {
        throw new Error(`TTS failed (${res.status}): ${await res.text()}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const mime = res.headers.get("content-type") || "audio/mpeg";
      if (mime.includes("json")) throw new Error("TTS returned JSON, expected audio");
      const art = await saveArtifact(buf, mime, "audio");
      return [{ type: "audio", artifactId: art.id, url: `/api/media/${art.id}` }];
    }

    case "video.gen": {
      const prompt = promptFrom(inputs, data);
      const firstFrame = (inputs.image ?? []).find(
        (o) => o.type === "image",
      ) as { type: "image"; artifactId?: string } | undefined;
      if (!prompt.trim() && !firstFrame) return [];

      const body: Record<string, unknown> = { model, prompt: prompt || "" };
      if (firstFrame?.artifactId) {
        body.frame_images = [
          { image_url: { url: absoluteUrl(`/api/media/${firstFrame.artifactId}`) }, frame_type: "first_frame" },
        ];
      }

      const sub = await fetch("https://openrouter.ai/api/v1/videos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }).then((r) => r.json());

      if (sub.error) throw new Error(String(sub.error.message ?? sub.error));
      const jobId = sub.id ?? sub.data?.id;
      if (!jobId) throw new Error("No job id from video submit");

      // Poll until terminal (video generation is async).
      const deadline = Date.now() + 8 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        const job = await fetch(`https://openrouter.ai/api/v1/videos/${jobId}`, {
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        }).then((r) => r.json());
        const st = job.status ?? job.data?.status;
        if (st === "completed" || st === "succeeded") break;
        if (st === "failed" || st === "cancelled" || st === "expired")
          throw new Error(`Video job ${st}: ${job.error ?? ""}`);
      }

      const vid = await fetch(
        `https://openrouter.ai/api/v1/videos/${jobId}/content?index=0`,
        { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } },
      );
      if (!vid.ok) throw new Error(`Video download failed (${vid.status})`);
      const buf = new Uint8Array(await vid.arrayBuffer());
      const art = await saveArtifact(buf, "video/mp4", "video");
      return [{ type: "video", artifactId: art.id, url: `/api/media/${art.id}` }];
    }

    case "out.text": {
      const t = (inputs.in ?? []).find((o) => o.type === "text");
      return t ? [t] : [];
    }

    case "out.media": {
      const outs: NodeOutput[] = [];
      const img = (inputs.in ?? []).find((o) => o.type === "image");
      if (img) outs.push(img);
      const aud = (inputs.audio ?? []).find((o) => o.type === "audio");
      if (aud) outs.push(aud);
      const vid = (inputs.video ?? []).find((o) => o.type === "video");
      if (vid) outs.push(vid);
      return outs;
    }

    default:
      return [];
  }
}

function absoluteUrl(p: string) {
  const base = process.env.FLOWBOOK_URL ?? "http://localhost:3000";
  return p.startsWith("http") ? p : `${base}${p}`;
}

export { nodeDef };
