/**
 * Model catalog helpers — keeps per-node model lists organized by provider
 * and supports custom / gateway models (e.g. PYOK, "pyok/<model>").
 */

export type ModelModality = "text" | "image" | "audio" | "video";
export type NodeModelKind = "chat" | "image" | "audio" | "video";

export interface ModelInfo {
  id: string;
  label: string;
  /** Output modalities from the provider, when known. */
  outputs?: ModelModality[];
  /** Provider-listed TTS voices. Absent means we don't know — never assume a voice. */
  voices?: string[];
}

export function kindForNode(nodeKind: string): NodeModelKind | null {
  switch (nodeKind) {
    case "llm":
      return "chat";
    case "image.gen":
      return "image";
    case "tts":
      return "audio";
    case "video.gen":
      return "video";
    default:
      return null;
  }
}

const MEDIA_HINT: Record<Exclude<NodeModelKind, "chat">, RegExp> = {
  image: /\b(image|img|flux|seedream|dall-?e|imagen|sdxl|stable-diffusion|recraft|ideogram|gpt-image)\b/i,
  video:
    /\b(video|veo|seedance|kling|runway|sora|luma|wan|hailuo|aleph|happyhorse|gen-4)\b/i,
  audio:
    /\b(tts|speech|voice|lyria|kokoro|orpheus|aura|gpt-audio|audio-mini)\b/i,
};

const NOT_TTS = /\b(whisper|transcri|asr\b|stt\b)\b/i;

export function inferOutputs(id: string, label = ""): ModelModality[] {
  const s = `${id} ${label}`;
  if (MEDIA_HINT.video.test(s) && !/\bupscale\b/i.test(s)) return ["video"];
  if (MEDIA_HINT.audio.test(s) && !NOT_TTS.test(s)) return ["audio"];
  if (MEDIA_HINT.image.test(s) && !MEDIA_HINT.video.test(s)) return ["image"];
  return ["text"];
}

export function modelFits(m: ModelInfo, kind: NodeModelKind): boolean {
  const outs =
    m.outputs && m.outputs.length ? m.outputs : inferOutputs(m.id, m.label);
  if (kind === "image") return outs.includes("image");
  if (kind === "video") return outs.includes("video");
  if (kind === "audio") return outs.includes("audio");
  return outs.includes("text");
}

export function filterModels(
  models: ModelInfo[],
  kind: NodeModelKind,
): ModelInfo[] {
  return models.filter((m) => modelFits(m, kind));
}

export const PROVIDER_LABELS: Record<string, string> = {
  stealth: "Stealth",
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "meta-llama": "Meta",
  "bytedance-seed": "ByteDance Seed",
  bytedance: "ByteDance",
  minimax: "MiniMax",
  kwaivgi: "Kling",
  alibaba: "Alibaba",
  runway: "Runway",
  "x-ai": "xAI",
  "fish-audio": "Fish Audio",
  deepgram: "Deepgram",
  qwen: "Qwen",
  hexgrad: "hexgrad",
  sesame: "Sesame",
  canopylabs: "Canopy Labs",
  heygen: "HeyGen",
  "black-forest-labs": "Black Forest Labs",
};

/** Sentinel option value for the "Custom model…" entry. */
export const CUSTOM_MODEL = "__custom__";

export const providerOf = (id: string) => id.split("/")[0] ?? id;
export const providerLabel = (p: string) => PROVIDER_LABELS[p] ?? p;

/** Bucket a flat model list into provider groups, preserving order. */
export function groupModels(models: ModelInfo[]): {
  provider: string;
  label: string;
  items: ModelInfo[];
}[] {
  const order: string[] = [];
  const buckets = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const p = providerOf(m.id);
    if (!buckets.has(p)) {
      buckets.set(p, []);
      order.push(p);
    }
    buckets.get(p)!.push(m);
  }
  return order.map((provider) => ({
    provider,
    label: providerLabel(provider),
    items: buckets.get(provider)!,
  }));
}
