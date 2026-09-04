import type { GraphDoc } from "./types";

const COL_W = 340;
const ORIGIN_X = 72;
const ORIGIN_Y = 64;
const GAP_Y = 48;

function estimatedHeight(kind: string) {
  if (kind.startsWith("out.")) return 420;
  if (kind === "llm" || kind.endsWith(".gen") || kind === "tts") return 340;
  if (kind.endsWith(".in")) return 260;
  return 220;
}

/**
 * Left-to-right layered layout from the graph's edges.
 * Independent branches stack vertically in the same column.
 */
export function layoutGraph(doc: GraphDoc): GraphDoc {
  const nodes = doc.nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    data: { ...n.data },
  }));
  if (!nodes.length) return { ...doc, nodes };

  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const e of doc.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    incoming.get(e.target)!.push(e.source);
  }

  const rank = new Map<string, number>();
  const visit = (id: string, seeing: Set<string>): number => {
    const hit = rank.get(id);
    if (hit != null) return hit;
    if (seeing.has(id)) return 0;
    seeing.add(id);
    const preds = incoming.get(id) ?? [];
    const r = preds.length
      ? Math.max(...preds.map((p) => visit(p, seeing))) + 1
      : 0;
    seeing.delete(id);
    rank.set(id, r);
    return r;
  };
  for (const n of nodes) visit(n.id, new Set());

  const groups = new Map<number, typeof nodes>();
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0;
    const list = groups.get(r) ?? [];
    list.push(n);
    groups.set(r, list);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const r of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(r)!;
    group.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    let y = ORIGIN_Y;
    for (const n of group) {
      const node = byId.get(n.id)!;
      node.position = { x: ORIGIN_X + r * COL_W, y };
      y += estimatedHeight(n.data.kind) + GAP_Y;
    }
  }

  return { ...doc, nodes, edges: doc.edges, viewport: doc.viewport };
}

/** Place newly added nodes in a horizontal chain to the right of existing ones. */
export function placeAddedNodes(
  doc: GraphDoc,
  newIds: string[],
): GraphDoc {
  if (!newIds.length) return doc;
  const existing = doc.nodes.filter((n) => !newIds.includes(n.id));
  const maxX = existing.reduce((m, n) => Math.max(m, n.position.x), 40);
  const y =
    existing.reduce((s, n) => s + n.position.y, 0) / Math.max(existing.length, 1) ||
    120;
  const want = new Set(newIds);
  const nodes = doc.nodes.map((n) => {
    if (!want.has(n.id)) return n;
    const i = newIds.indexOf(n.id);
    return {
      ...n,
      position: { x: maxX + COL_W + i * COL_W, y },
    };
  });
  return { ...doc, nodes };
}
