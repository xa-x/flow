/** Optional media generation params. Empty / Auto means omit — use the model's default. */

export const CUSTOM_PARAM = "__custom__";

export const IMAGE_ASPECTS = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
] as const;

export const IMAGE_SIZES = [
  { value: "1024x1024", label: "1024×1024" },
  { value: "1536x1024", label: "1536×1024" },
  { value: "1024x1536", label: "1024×1536" },
  { value: "2048x2048", label: "2048×2048" },
] as const;

export const VIDEO_ASPECTS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
] as const;

export const VIDEO_RESOLUTIONS = [
  { value: "1280x720", label: "720p · 1280×720" },
  { value: "1920x1080", label: "1080p · 1920×1080" },
  { value: "720x1280", label: "720p · 720×1280" },
  { value: "1080x1920", label: "1080p · 1080×1920" },
] as const;

export const VIDEO_DURATIONS = [
  { value: "4", label: "4s" },
  { value: "5", label: "5s" },
  { value: "6", label: "6s" },
  { value: "8", label: "8s" },
  { value: "10", label: "10s" },
] as const;

export const GENERIC_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
] as const;

const GENERIC_VOICE_SET = new Set<string>(GENERIC_VOICES);

export function isOpenAISpeechModel(modelId?: string) {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return (
    id.startsWith("openai/") ||
    /\bgpt-audio\b/.test(id) ||
    /\btts-1\b/.test(id) ||
    /\bgpt-4o-mini-tts\b/.test(id)
  );
}

export function voiceLabel(id: string) {
  const tail = id.includes(":") ? (id.split(":").pop() ?? id) : id;
  return tail.replace(/[_-]+/g, " ");
}

/** Voices the UI may offer. Empty = Auto + Custom only — never invent OpenAI names. */
export function voiceChoices(modelId?: string, listed?: string[]) {
  const ids = listed?.length
    ? listed
    : isOpenAISpeechModel(modelId)
      ? [...GENERIC_VOICES]
      : [];
  return ids.map((value) => ({ value, label: voiceLabel(value) }));
}

/** Drop a voice the current model cannot use (e.g. nova on Fish Audio). */
export function resolveVoice(
  modelId?: string,
  voice?: string,
  listed?: string[],
): string | undefined {
  const v = voice?.trim();
  if (!v) return;
  if (listed?.length) return listed.includes(v) ? v : undefined;
  if (isOpenAISpeechModel(modelId)) return v;
  if (GENERIC_VOICE_SET.has(v)) return undefined;
  return v;
}

export type SizeSpec = `${number}x${number}`;
export type AspectSpec = `${number}:${number}`;

export function parseSize(raw?: string): SizeSpec | undefined {
  if (!raw?.trim()) return;
  const m = raw.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return;
  return `${w}x${h}`;
}

export function parseAspect(raw?: string): AspectSpec | undefined {
  if (!raw?.trim()) return;
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!m) return;
  return `${Number(m[1])}:${Number(m[2])}`;
}

export function parseDuration(raw?: number | string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return;
  return n;
}

export function requireSize(raw?: string, label = "size"): SizeSpec | undefined {
  if (!raw?.trim()) return;
  const parsed = parseSize(raw);
  if (!parsed) throw new Error(`Invalid ${label} "${raw}". Use WIDTHxHEIGHT, e.g. 1024x1024.`);
  return parsed;
}

export function requireAspect(raw?: string): AspectSpec | undefined {
  if (!raw?.trim()) return;
  const parsed = parseAspect(raw);
  if (!parsed) throw new Error(`Invalid aspect "${raw}". Use W:H, e.g. 16:9.`);
  return parsed;
}

export function requireDuration(raw?: number | string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return;
  const parsed = parseDuration(raw);
  if (!parsed) throw new Error(`Invalid duration "${raw}". Use seconds, e.g. 5.`);
  return parsed;
}
