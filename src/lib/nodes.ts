/**
 * Node type registry — the contract between canvas, engine, and runners.
 * A node type declares its input/output ports (typed), and the engine
 * routes upstream outputs into a node's inputs before running it.
 */

export type PortType = "text" | "image" | "audio" | "video" | "json";

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
}

export interface NodeTypeDef {
  type: string;
  label: string;
  description: string;
  category: "input" | "ai" | "output";
  color: string; // node accent
  inputs: PortDef[];
  outputs: PortDef[];
  /** Model selector choices offered in the node UI. */
  models?: { id: string; label: string }[];
}

export const NODE_TYPES: NodeTypeDef[] = [
  {
    type: "text",
    label: "Text",
    description: "Raw text or paste an article",
    category: "input",
    color: "#8a8a8a",
    inputs: [],
    outputs: [{ id: "out", label: "Text", type: "text" }],
  },
  {
    type: "note",
    label: "Instruction",
    description: "System-style instruction prepended to prompts",
    category: "input",
    color: "#6a6a6a",
    inputs: [],
    outputs: [{ id: "out", label: "Text", type: "text" }],
  },
  {
    type: "skill",
    label: "Skill",
    description:
      "Reusable Agent Skill (SKILL.md). Pick one, then wire it into an AI node's text input — or expand it into a Text → Image chain.",
    category: "input",
    color: "#a78bfa",
    inputs: [],
    outputs: [{ id: "out", label: "Text", type: "text" }],
  },
  {
    type: "image.in",
    label: "Image",
    description: "Upload an image",
    category: "input",
    color: "#8a8a8a",
    inputs: [],
    outputs: [{ id: "out", label: "Image", type: "image" }],
  },
  {
    type: "audio.in",
    label: "Audio",
    description: "Upload an audio file",
    category: "input",
    inputs: [],
    outputs: [{ id: "out", label: "Audio", type: "audio" }],
    color: "#8a8a8a",
  },
  {
    type: "video.in",
    label: "Video",
    description: "Upload a video file",
    category: "input",
    inputs: [],
    outputs: [{ id: "out", label: "Video", type: "video" }],
    color: "#8a8a8a",
  },
  {
    type: "llm",
    label: "AI Text",
    description: "Chat model: summarize, rewrite, translate…",
    category: "ai",
    color: "#3b82f6",
    inputs: [
      { id: "in", label: "Context", type: "text" },
      { id: "image", label: "Image", type: "image" }, // vision
    ],
    outputs: [{ id: "out", label: "Text", type: "text" }],
    models: [
      { id: "stealth/ox-alpha", label: "Ox-Alpha" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
      { id: "openai/gpt-5.2", label: "GPT-5.2" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
  },
  {
    type: "image.gen",
    label: "AI Image",
    description:
      "Generate or edit an image. Connect a reference to keep the subject and change the background. Size and aspect are optional — Auto uses the model default.",
    category: "ai",
    color: "#22c55e",
    inputs: [
      { id: "prompt", label: "Prompt", type: "text" },
      { id: "image", label: "Reference", type: "image" },
    ],
    outputs: [{ id: "out", label: "Image", type: "image" }],
    models: [
      { id: "bytedance-seed/seedream-5-0-lite", label: "Seedream 5 Lite" },
      { id: "black-forest-labs/flux.2-klein-4b", label: "FLUX.2 Klein" },
      { id: "bytedance-seed/seedream-5-0-pro", label: "Seedream 5 Pro" },
      { id: "google/gemini-3.0-pro-image-preview", label: "Gemini Image" },
    ],
  },
  {
    type: "tts",
    label: "AI Speech",
    description:
      "Text to speech. Voice is optional — Auto uses the model default; listed voices come from the model when known.",
    category: "ai",
    color: "#ef4444",
    inputs: [{ id: "text", label: "Text", type: "text" }],
    outputs: [{ id: "out", label: "Audio", type: "audio" }],
    models: [
      { id: "openai/gpt-audio-mini", label: "GPT Audio Mini" },
      { id: "google/gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS" },
      { id: "minimax/speech-2.8-hd", label: "MiniMax Speech 2.8 HD" },
      { id: "x-ai/grok-voice-tts-1.0", label: "Grok Voice TTS" },
    ],
  },
  {
    type: "video.gen",
    label: "AI Video",
    description:
      "Text/image to video. Duration, aspect, and resolution are optional — Auto uses the model default.",
    category: "ai",
    color: "#60a5fa",
    inputs: [
      { id: "prompt", label: "Prompt", type: "text" },
      { id: "image", label: "First frame", type: "image" },
    ],
    outputs: [{ id: "out", label: "Video", type: "video" }],
    models: [
      { id: "bytedance/seedance-2.5", label: "Seedance 2.5" },
      { id: "google/veo-3.1", label: "Veo 3.1" },
      { id: "openai/sora-2-pro", label: "Sora 2 Pro" },
      { id: "kwaivgi/kling-v3.0-pro", label: "Kling v3.0 Pro" },
    ],
  },
  {
    type: "out.text",
    label: "Output",
    description:
      "Renders whatever arrives — pages & apps live, prose, code, JSON, media",
    category: "output",
    color: "#e5e5e5",
    inputs: [{ id: "in", label: "Text", type: "text" }],
    outputs: [{ id: "out", label: "Text", type: "text" }],
  },
  {
    type: "out.media",
    label: "Media Out",
    description: "Final media output — reuse any result as input",
    category: "output",
    inputs: [
      { id: "in", label: "Media", type: "image" },
      { id: "audio", label: "Audio", type: "audio" },
      { id: "video", label: "Video", type: "video" },
    ],
    outputs: [
      { id: "image", label: "Image", type: "image" },
      { id: "audio", label: "Audio", type: "audio" },
      { id: "video", label: "Video", type: "video" },
    ],
    color: "#a3a3a3",
  },
];

export const nodeDef = (t: string) => NODE_TYPES.find((d) => d.type === t);
export const portDef = (t: string, portId: string, dir: "in" | "out") =>
  (dir === "in" ? nodeDef(t)?.inputs : nodeDef(t)?.outputs)?.find(
    (p) => p.id === portId,
  );

/** Image accepts image; media sinks accept anything binary-ish. */
export function portAccepts(sink: PortType, source: PortType): boolean {
  if (sink === source) return true;
  return false;
}

/**
 * Pick compatible source/target handles. Wrong or missing handle ids
 * (the assistant often emits "in"/"out") are remapped to a typed pair.
 */
export function matchPorts(
  srcKind: string,
  tgtKind: string,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): { sourceHandle: string; targetHandle: string } | null {
  const sDef = nodeDef(srcKind);
  const tDef = nodeDef(tgtKind);
  if (!sDef?.outputs.length || !tDef?.inputs.length) return null;
  const srcPorts = sDef.outputs;
  const tgtPorts = tDef.inputs;
  const namedSrc = sourceHandle
    ? srcPorts.find((p) => p.id === sourceHandle)
    : undefined;
  const namedTgt = targetHandle
    ? tgtPorts.find((p) => p.id === targetHandle)
    : undefined;
  if (namedSrc && namedTgt && portAccepts(namedTgt.type, namedSrc.type)) {
    return { sourceHandle: namedSrc.id, targetHandle: namedTgt.id };
  }
  if (namedSrc) {
    const t = tgtPorts.find((p) => portAccepts(p.type, namedSrc.type));
    if (t) return { sourceHandle: namedSrc.id, targetHandle: t.id };
  }
  if (namedTgt) {
    const s = srcPorts.find((p) => portAccepts(namedTgt.type, p.type));
    if (s) return { sourceHandle: s.id, targetHandle: namedTgt.id };
  }
  for (const s of srcPorts) {
    const t = tgtPorts.find((p) => portAccepts(p.type, s.type));
    if (t) return { sourceHandle: s.id, targetHandle: t.id };
  }
  return null;
}
