export type NodeOutput =
  | { type: "text"; text: string }
  | { type: "image"; artifactId?: string; url?: string }
  | { type: "audio"; artifactId?: string; url?: string }
  | { type: "video"; artifactId?: string; url?: string };

export type ProviderId = string; // "openrouter" | "pyok" | any custom gateway id

/** Per-provider credentials, stored in the client's Settings. */
export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
}

export interface RunSettings {
  providers: Record<ProviderId, ProviderConfig>;
}

/** Which provider/model a node runs with (persisted per node). */
export interface ModelRef {
  provider: ProviderId;
  model: string;
}

/** React Flow node.data payload — shared by canvas and engine. */
export interface NodeData {
  [key: string]: unknown;
  kind: string; // node type key
  label?: string;
  text?: string; // text/note node body
  prompt?: string; // llm/image/video instruction
  model?: string; // model id
  provider?: ProviderId; // provider id (registry)
  voice?: string; // tts voice — omit for model default
  size?: string; // image/video WxH, e.g. 1024x1024
  aspectRatio?: string; // e.g. 16:9
  duration?: number; // video seconds
  resolution?: string; // video WxH, e.g. 1920x1080
  temperature?: number;
  artifactId?: string; // uploaded media
  skillId?: string; // Agent Skill slug or org skill id
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

export type RunStatus =
  | "idle"
  | "queued"
  | "running"
  | "done"
  | "error"
  /** deliberately not run — nothing consumes it, or its upstream broke */
  | "skipped";

/** React Flow node.data as seen by the canvas (adds runtime decoration). */
export type FlowNodeData = NodeData & {
  runStatus?: RunStatus;
  runError?: string;
  /** live token stream while an LLM node runs */
  streamingText?: string;
  /** last run usage for this node */
  runUsage?: UsageInfo;
};

export interface UsageInfo {
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number; // dollars
  model?: string;
}

export type RunEvent =
  | { type: "run"; runId: string; status: "started"; ts: number }
  | {
      type: "node";
      nodeId: string;
      status: "queued" | "running" | "done" | "error" | "skipped";
      outputs?: NodeOutput[];
      error?: string;
      usage?: UsageInfo;
      ts: number;
    }
  | {
      type: "delta"; // live token stream for a node
      nodeId: string;
      text: string;
      ts: number;
    }
  | {
      type: "run";
      runId: string;
      status: "done" | "error" | "cancelled" | "timed_out";
      error?: string;
      usage?: { totalCostUsd?: number; totalTokens?: number; durationMs?: number };
      ts: number;
    };

export type ConsoleEvent = {
  seq: number;
  type: string;
  level: string;
  nodeId?: string | null;
  payload: Record<string, unknown>;
  ts: number;
};
