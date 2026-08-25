export type NodeOutput =
  | { type: "text"; text: string }
  | { type: "image"; artifactId?: string; url?: string }
  | { type: "audio"; artifactId?: string; url?: string }
  | { type: "video"; artifactId?: string; url?: string };

/** React Flow node.data payload — shared by canvas and engine. */
export interface NodeData {
  [key: string]: unknown;
  kind: string; // node type key
  label?: string;
  text?: string; // text/note node body
  prompt?: string; // llm/image/video instruction
  model?: string; // OpenRouter model id
  voice?: string; // tts voice
  artifactId?: string; // uploaded media
  // runtime decoration (not persisted into node defs):
  status?: "idle" | "queued" | "running" | "done" | "error";
  error?: string;
  outputs?: NodeOutput[];
}

export interface GraphDoc {
  nodes: {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: NodeData;
  }[];
  edges: {
    id: string;
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface RunEvent {
  nodeId: string;
  status: "queued" | "running" | "done" | "error";
  outputs?: NodeOutput[];
  error?: string;
  ts: number;
}
