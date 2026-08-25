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
    color: "#8b8f98",
    inputs: [],
    outputs: [{ id: "out", label: "Text", type: "text" }],
  },
  {
    type: "note",
    label: "Instruction",
    description: "System-style instruction prepended to prompts",
    category: "input",
    color: "#6f7787",
    inputs: [],
    outputs: [{ id: "out", label: "Text", type: "text" }],
  },
  {
    type: "image.in",
    label: "Image",
    description: "Upload an image",
    category: "input",
    color: "#8b8f98",
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
    color: "#8b8f98",
  },
  {
    type: "video.in",
    label: "Video",
    description: "Upload a video file",
    category: "input",
    inputs: [],
    outputs: [{ id: "out", label: "Video", type: "video" }],
    color: "#8b8f98",
  },
  {
    type: "llm",
    label: "AI Text",
    description: "Chat model: summarize, rewrite, translate…",
    category: "ai",
    color: "#c9a227",
    inputs: [
      { id: "in", label: "Context", type: "text" },
      { id: "image", label: "Image", type: "image" }, // vision
    ],
    outputs: [{ id: "out", label: "Text", type: "text" }],
    models: [
      { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
      { id: "openai/gpt-5.2", label: "GPT-5.2" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
  },
  {
    type: "image.gen",
    label: "AI Image",
    description: "Text-to-image generation",
    category: "ai",
    color: "#2fb380",
    inputs: [
      { id: "prompt", label: "Prompt", type: "text" },
      { id: "image", label: "Reference", type: "image" },
    ],
    outputs: [{ id: "out", label: "Image", type: "image" }],
    models: [
      { id: "bytedance-seed/seedream-5-0-pro", label: "Seedream 5 Pro" },
      { id: "google/gemini-3.0-pro-image-preview", label: "Gemini Image" },
    ],
  },
  {
    type: "tts",
    label: "AI Speech",
    description: "Text to speech",
    category: "ai",
    color: "#d97b4a",
    inputs: [{ id: "text", label: "Text", type: "text" }],
    outputs: [{ id: "out", label: "Audio", type: "audio" }],
    models: [
      { id: "openai/gpt-audio-mini", label: "GPT Audio Mini" },
      { id: "google/gemini-2.5-flash-preview-tts", label: "Gemini TTS" },
    ],
  },
  {
    type: "video.gen",
    label: "AI Video",
    description: "Text/image to video (async job)",
    category: "ai",
    color: "#4a90d9",
    inputs: [
      { id: "prompt", label: "Prompt", type: "text" },
      { id: "image", label: "First frame", type: "image" },
    ],
    outputs: [{ id: "out", label: "Video", type: "video" }],
    models: [
      { id: "bytedance/seedance-2.0", label: "Seedance 2.0" },
      { id: "google/veo-3.1", label: "Veo 3.1" },
    ],
  },
  {
    type: "out.text",
    label: "Text Out",
    description: "Final text output",
    category: "output",
    color: "#b06fba",
    inputs: [{ id: "in", label: "Text", type: "text" }],
    outputs: [],
  },
  {
    type: "out.media",
    label: "Media Out",
    description: "Final image / audio / video output",
    category: "output",
    inputs: [
      { id: "in", label: "Media", type: "image" },
      { id: "audio", label: "Audio", type: "audio" },
      { id: "video", label: "Video", type: "video" },
    ],
    outputs: [],
    color: "#b06fba",
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
