import { z } from "zod";
import { NODE_TYPES, matchPorts, nodeDef } from "./nodes";
import { placeAddedNodes } from "./layout";
import type { GraphDoc } from "./types";

export const graphOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_node"),
    id: z.string().min(1).max(40).optional(),
    kind: z.string(),
    label: z.string().optional(),
    text: z.string().optional(),
    prompt: z.string().optional(),
    model: z.string().optional(),
    voice: z.string().optional(),
    size: z.string().optional(),
    aspectRatio: z.string().optional(),
    duration: z.number().optional(),
    resolution: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  z.object({
    op: z.literal("update_node"),
    id: z.string(),
    label: z.string().optional(),
    text: z.string().optional(),
    prompt: z.string().optional(),
    model: z.string().optional(),
    voice: z.string().optional(),
    size: z.string().optional(),
    aspectRatio: z.string().optional(),
    duration: z.number().optional(),
    resolution: z.string().optional(),
  }),
  z.object({
    op: z.literal("remove_node"),
    id: z.string(),
  }),
  z.object({
    op: z.literal("connect"),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
  }),
  z.object({
    op: z.literal("disconnect"),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
  }),
]);

export const assistantOutputSchema = z.object({
  reply: z.string(),
  ops: z.array(graphOpSchema),
});

export type GraphOp = z.infer<typeof graphOpSchema>;
export type AssistantOutput = z.infer<typeof assistantOutputSchema>;

export interface AssistantMention {
  id: string;
  label: string;
  kind: string;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  mentions?: AssistantMention[];
}

export function nodeCatalogPrompt() {
  return NODE_TYPES.map((d) => {
    const ins = d.inputs.map((p) => `${p.id}:${p.type}`).join(", ") || "none";
    const outs = d.outputs.map((p) => `${p.id}:${p.type}`).join(", ") || "none";
    const models = d.models?.map((m) => m.id).join(", ");
    return `- ${d.type} ("${d.label}"): ${d.description}. inputs=[${ins}] outputs=[${outs}]${models ? ` models=[${models}]` : ""}`;
  }).join("\n");
}

function nid() {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function applyGraphOps(doc: GraphDoc, ops: GraphOp[]): GraphDoc {
  const nodes = doc.nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    data: { ...n.data },
  }));
  let edges = doc.edges.map((e) => ({ ...e }));
  const aliases = new Map<string, string>();

  const resolve = (ref: string) => {
    const key = ref.replace(/^@/, "").trim();
    if (aliases.has(key)) return aliases.get(key)!;
    if (aliases.has(key.toLowerCase())) return aliases.get(key.toLowerCase())!;
    if (nodes.some((n) => n.id === key)) return key;
    const needle = key.toLowerCase();
    const byLabel = nodes.find((n) => {
      const label = (n.data.label ?? nodeDef(n.data.kind)?.label ?? "").toLowerCase();
      return label === needle;
    });
    if (byLabel) return byLabel.id;
    const byKind = nodes.filter(
      (n) => n.data.kind === key || n.data.kind.toLowerCase() === needle,
    );
    if (byKind.length === 1) return byKind[0].id;
    return key;
  };

  let added = 0;
  const addedIds: string[] = [];
  const maxX = nodes.reduce((m, n) => Math.max(m, n.position.x), 40);

  for (const op of ops) {
    if (op.op === "add_node") {
      const def = nodeDef(op.kind);
      if (!def) continue;
      let id = (op.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
      if (!id || nodes.some((n) => n.id === id)) id = nid();
      if (op.id) aliases.set(op.id, id);
      aliases.set((op.label ?? def.label).toLowerCase(), id);
      nodes.push({
        id,
        type: "flow",
        position: {
          x: op.x ?? maxX + 280 + added * 36,
          y: op.y ?? 120 + added * 170,
        },
        data: {
          kind: op.kind,
          label: op.label ?? def.label,
          text: op.text,
          prompt: op.prompt,
          model: op.model ?? def.models?.[0]?.id,
          voice: op.voice,
          size: op.size,
          aspectRatio: op.aspectRatio,
          duration: op.duration,
          resolution: op.resolution,
        },
      });
      addedIds.push(id);
      added += 1;
    } else if (op.op === "update_node") {
      const id = resolve(op.id);
      const n = nodes.find((x) => x.id === id);
      if (!n) continue;
      if (op.label !== undefined) n.data.label = op.label;
      if (op.text !== undefined) n.data.text = op.text;
      if (op.prompt !== undefined) n.data.prompt = op.prompt;
      if (op.model !== undefined) n.data.model = op.model;
      if (op.voice !== undefined) n.data.voice = op.voice;
      if (op.size !== undefined) n.data.size = op.size;
      if (op.aspectRatio !== undefined) n.data.aspectRatio = op.aspectRatio;
      if (op.duration !== undefined) n.data.duration = op.duration;
      if (op.resolution !== undefined) n.data.resolution = op.resolution;
    } else if (op.op === "remove_node") {
      const id = resolve(op.id);
      const idx = nodes.findIndex((n) => n.id === id);
      if (idx < 0) continue;
      nodes.splice(idx, 1);
      edges = edges.filter((e) => e.source !== id && e.target !== id);
    } else if (op.op === "connect") {
      const source = resolve(op.source);
      const target = resolve(op.target);
      const src = nodes.find((n) => n.id === source);
      const tgt = nodes.find((n) => n.id === target);
      if (!src || !tgt || src.id === tgt.id) continue;
      const ports = matchPorts(
        src.data.kind,
        tgt.data.kind,
        op.sourceHandle,
        op.targetHandle,
      );
      if (!ports) continue;
      const exists = edges.some(
        (e) =>
          e.source === source &&
          e.target === target &&
          (e.sourceHandle ?? ports.sourceHandle) === ports.sourceHandle &&
          (e.targetHandle ?? ports.targetHandle) === ports.targetHandle,
      );
      if (exists) continue;
      edges.push({
        id: `e${nid()}`,
        source,
        target,
        sourceHandle: ports.sourceHandle,
        targetHandle: ports.targetHandle,
      });
    } else if (op.op === "disconnect") {
      const source = resolve(op.source);
      const target = resolve(op.target);
      edges = edges.filter((e) => {
        if (e.source !== source || e.target !== target) return true;
        if (op.sourceHandle && e.sourceHandle !== op.sourceHandle) return true;
        if (op.targetHandle && e.targetHandle !== op.targetHandle) return true;
        return false;
      });
    }
  }

  let next: GraphDoc = { nodes, edges, viewport: doc.viewport };
  if (addedIds.length) {
    next = placeAddedNodes(next, addedIds);
    next = {
      ...next,
      edges: autoWireNodes(next.nodes, next.edges, addedIds),
    };
  }
  return next;
}

function tryConnect(
  nodes: GraphDoc["nodes"],
  edges: GraphDoc["edges"],
  source: string,
  target: string,
) {
  if (source === target) return edges;
  const src = nodes.find((n) => n.id === source);
  const tgt = nodes.find((n) => n.id === target);
  if (!src || !tgt) return edges;
  const ports = matchPorts(src.data.kind, tgt.data.kind);
  if (!ports) return edges;
  const exists = edges.some(
    (e) =>
      e.source === source &&
      e.target === target &&
      (e.sourceHandle ?? ports.sourceHandle) === ports.sourceHandle &&
      (e.targetHandle ?? ports.targetHandle) === ports.targetHandle,
  );
  if (exists) return edges;
  return [
    ...edges,
    {
      id: `e${nid()}`,
      source,
      target,
      sourceHandle: ports.sourceHandle,
      targetHandle: ports.targetHandle,
    },
  ];
}

/** Connect newly added nodes to each other and to compatible existing ports. */
export function autoWireNodes(
  nodes: GraphDoc["nodes"],
  edges: GraphDoc["edges"],
  newIds: string[],
): GraphDoc["edges"] {
  let next = edges.map((e) => ({ ...e }));
  for (let i = 0; i < newIds.length - 1; i++) {
    next = tryConnect(nodes, next, newIds[i], newIds[i + 1]);
  }
  for (const id of newIds) {
    const hasIn = next.some((e) => e.target === id);
    if (hasIn) continue;
    const tgt = nodes.find((n) => n.id === id);
    if (!tgt || !nodeDef(tgt.data.kind)?.inputs.length) continue;
    const candidate = [...nodes]
      .reverse()
      .find((n) => n.id !== id && matchPorts(n.data.kind, tgt.data.kind));
    if (candidate) next = tryConnect(nodes, next, candidate.id, id);
  }
  const newSet = new Set(newIds);
  for (const id of newIds) {
    const hasOut = next.some((e) => e.source === id);
    if (hasOut) continue;
    const src = nodes.find((n) => n.id === id);
    if (!src || !nodeDef(src.data.kind)?.outputs.length) continue;
    const sink = nodes.find(
      (n) =>
        !newSet.has(n.id) &&
        n.data.kind.startsWith("out.") &&
        matchPorts(src.data.kind, n.data.kind) &&
        !next.some((e) => e.target === n.id),
    );
    if (sink) next = tryConnect(nodes, next, id, sink.id);
  }
  return next;
}

export function parseAssistantOutput(raw: unknown): AssistantOutput | null {
  const strict = assistantOutputSchema.safeParse(raw);
  if (strict.success) return strict.data;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const reply = typeof obj.reply === "string" ? obj.reply : "";
  const opsRaw = Array.isArray(obj.ops)
    ? obj.ops
    : obj.ops
      ? [obj.ops]
      : [];
  const ops = opsRaw
    .map((item) => graphOpSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => r.data);
  if (!reply && !ops.length) return null;
  return { reply, ops };
}
