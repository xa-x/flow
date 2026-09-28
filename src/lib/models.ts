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

/**
 * Vendor slug of a model id. OpenRouter prefixes alias ids with "~"
 * ("~z-ai/glm-flash-latest"), which is the same vendor as "z-ai" and must not
 * open a second group.
 */
export const providerOf = (id: string) =>
  (id.split("/")[0] ?? id).replace(/^~/, "");

export const providerLabel = (p: string) => PROVIDER_LABELS[p] ?? p;

/**
 * Providers label models "Vendor: Model" ("Z.ai: GLM Flash Latest"). Split it
 * so a group header can carry the vendor and each option only the model,
 * rather than repeating the vendor on every row.
 */
export function splitModelLabel(label: string): {
  vendor: string;
  name: string;
} {
  const i = label.indexOf(": ");
  if (i <= 0) return { vendor: "", name: label };
  return { vendor: label.slice(0, i).trim(), name: label.slice(i + 2).trim() };
}

export const modelName = (m: ModelInfo) => splitModelLabel(m.label).name || m.id;

/**
 * Bucket a flat model list into vendor groups, preserving order.
 *
 * Vendor names come from `PROVIDER_LABELS` first, then from the provider's
 * own labels, which keep up with vendors the table has never heard of. Two
 * details make the derived path messy: a slug can carry more than one name
 * ("x-ai" ships both "xAI" and "SpaceXAI"), so it takes the name most of its
 * models agree on; and one vendor can own several slugs ("meta" and
 * "meta-llama"), so buckets are keyed by the resolved name rather than the
 * slug, which would render two identical group headers.
 */
export function groupModels(models: ModelInfo[]): {
  provider: string;
  label: string;
  items: ModelInfo[];
}[] {
  const votes = new Map<string, Map<string, number>>();
  for (const m of models) {
    const vendor = splitModelLabel(m.label).vendor;
    if (!vendor) continue;
    const slug = providerOf(m.id);
    const tally = votes.get(slug) ?? new Map<string, number>();
    tally.set(vendor, (tally.get(vendor) ?? 0) + 1);
    votes.set(slug, tally);
  }
  const labelFor = (id: string) => {
    const slug = providerOf(id);
    if (PROVIDER_LABELS[slug]) return PROVIDER_LABELS[slug];
    const ranked = [...(votes.get(slug) ?? [])].sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] ?? slug;
  };

  const order: string[] = [];
  const buckets = new Map<string, { provider: string; items: ModelInfo[] }>();
  for (const m of models) {
    const label = labelFor(m.id);
    let hit = buckets.get(label);
    if (!hit) {
      hit = { provider: providerOf(m.id), items: [] };
      buckets.set(label, hit);
      order.push(label);
    }
    hit.items.push(m);
  }
  return order.map((label) => ({ label, ...buckets.get(label)! }));
}
