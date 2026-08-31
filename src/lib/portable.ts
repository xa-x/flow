import { nodeDef, portAccepts } from "./nodes";
import type { GraphDoc } from "./types";

export const PORTABLE_KIND = "flowbook/workbook";
export const PORTABLE_VERSION = 1;

export interface PortableWorkbook {
  kind: typeof PORTABLE_KIND;
  version: typeof PORTABLE_VERSION;
  title?: string;
  nodes: GraphDoc["nodes"];
  edges: GraphDoc["edges"];
}

function stripRuntime(data: GraphDoc["nodes"][number]["data"]) {
  const rest = { ...(data as Record<string, unknown>) };
  delete rest.runStatus;
  delete rest.runError;
  delete rest.streamingText;
  delete rest.runUsage;
  delete rest.outputs;
  delete rest.status;
  delete rest.error;
  return rest as GraphDoc["nodes"][number]["data"];
}

export function toPortable(
  doc: GraphDoc,
  opts: { title?: string; nodeIds?: string[] } = {},
): PortableWorkbook {
  const allow = opts.nodeIds ? new Set(opts.nodeIds) : null;
  const nodes = doc.nodes
    .filter((n) => !allow || allow.has(n.id))
    .map((n) => ({
      id: n.id,
      type: n.type || "flow",
      position: { ...n.position },
      data: stripRuntime(n.data),
    }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return {
    kind: PORTABLE_KIND,
    version: PORTABLE_VERSION,
    title: opts.title,
    nodes,
    edges,
  };
}

export function isPortable(raw: unknown): raw is PortableWorkbook {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    o.kind === PORTABLE_KIND &&
    Array.isArray(o.nodes) &&
    Array.isArray(o.edges)
  );
}

export function parsePortable(raw: string): PortableWorkbook | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPortable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function remapPortable(
  pack: PortableWorkbook,
  origin = { x: 40, y: 40 },
): GraphDoc {
  const aliases = new Map<string, string>();
  const stamp = Date.now().toString(36);
  const minX = pack.nodes.reduce((m, n) => Math.min(m, n.position.x), Infinity);
  const minY = pack.nodes.reduce((m, n) => Math.min(m, n.position.y), Infinity);
  const dx = Number.isFinite(minX) ? origin.x - minX : origin.x;
  const dy = Number.isFinite(minY) ? origin.y - minY : origin.y;

  const nodes = pack.nodes.map((n, i) => {
    const id = `n${stamp}${i.toString(36)}`;
    aliases.set(n.id, id);
    const def = nodeDef(n.data.kind);
    return {
      id,
      type: "flow" as const,
      position: { x: n.position.x + dx, y: n.position.y + dy },
      data: {
        ...stripRuntime(n.data),
        kind: n.data.kind,
        label: n.data.label ?? def?.label ?? n.data.kind,
      },
    };
  });

  const edges: GraphDoc["edges"] = [];
  for (const e of pack.edges) {
    const source = aliases.get(e.source);
    const target = aliases.get(e.target);
    if (!source || !target) continue;
    const src = nodes.find((n) => n.id === source);
    const tgt = nodes.find((n) => n.id === target);
    if (!src || !tgt) continue;
    const sDef = nodeDef(src.data.kind);
    const tDef = nodeDef(tgt.data.kind);
    const sourceHandle = e.sourceHandle ?? sDef?.outputs[0]?.id ?? "out";
    const targetHandle = e.targetHandle ?? tDef?.inputs[0]?.id ?? "in";
    const sPort = sDef?.outputs.find((p) => p.id === sourceHandle);
    const tPort = tDef?.inputs.find((p) => p.id === targetHandle);
    if (sPort && tPort && !portAccepts(tPort.type, sPort.type)) continue;
    edges.push({
      id: `e${stamp}${edges.length.toString(36)}`,
      source,
      target,
      sourceHandle,
      targetHandle,
    });
  }

  return { nodes, edges };
}

export function mergePortable(doc: GraphDoc, incoming: GraphDoc): GraphDoc {
  return {
    nodes: [...doc.nodes, ...incoming.nodes],
    edges: [...doc.edges, ...incoming.edges],
    viewport: doc.viewport,
  };
}
