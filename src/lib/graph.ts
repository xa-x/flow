/** Graph helpers safe for the browser — no Node built-ins. */

import type { GraphDoc, NodeData, NodeOutput, UsageInfo } from "./types";
import { nodeDef, portAccepts } from "./nodes";

/** This node plus everything reachable downstream. */
export function downstreamIds(
  start: string,
  edges: { source: string; target: string }[],
): string[] {
  const out = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const id = q.shift()!;
    for (const e of edges) {
      if (e.source === id && !out.has(e.target)) {
        out.add(e.target);
        q.push(e.target);
      }
    }
  }
  return [...out];
}

type Wire = {
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
};

/**
 * The ports an edge end may be using. A named handle wins; a missing or stale
 * handle id falls back to every port, so a mislabelled edge is still treated
 * as connected rather than silently costing the user a skipped generation.
 */
function portsFor(kind: string, handle: string | null | undefined, dir: "in" | "out") {
  const all = (dir === "in" ? nodeDef(kind)?.inputs : nodeDef(kind)?.outputs) ?? [];
  const named = handle ? all.find((p) => p.id === handle) : undefined;
  return named ? [named] : all;
}

/**
 * Generative nodes whose result nothing can consume. Only output nodes render
 * results, so an AI node is inert unless it feeds an output node — directly,
 * or through other AI nodes that are themselves consumed. Running one costs a
 * paid API call and shows nothing, so a full run skips it.
 */
export function inertNodeIds(
  nodes: { id: string; data: { kind: string } }[],
  edges: Wire[],
): Set<string> {
  const kinds = new Map(nodes.map((n) => [n.id, n.data.kind]));
  const generative = new Set(
    nodes.filter((n) => nodeDef(n.data.kind)?.category === "ai").map((n) => n.id),
  );
  if (!generative.size) return new Set();

  // Only edges whose two ends carry the same payload type deliver anything.
  const consumers = new Map<string, string[]>();
  for (const e of edges) {
    const srcKind = kinds.get(e.source);
    const tgtKind = kinds.get(e.target);
    if (!srcKind || !tgtKind) continue;
    const ins = portsFor(tgtKind, e.targetHandle, "in");
    const live = portsFor(srcKind, e.sourceHandle, "out").some((o) =>
      ins.some((i) => portAccepts(i.type, o.type)),
    );
    if (!live) continue;
    const list = consumers.get(e.source) ?? [];
    list.push(e.target);
    consumers.set(e.source, list);
  }

  // Anything non-generative is free to run, so it counts as a consumer. Grow
  // the useful set backwards until it settles: AI → AI → Output keeps all three.
  const useful = new Set(
    nodes.filter((n) => !generative.has(n.id)).map((n) => n.id),
  );
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of generative) {
      if (useful.has(id)) continue;
      if ((consumers.get(id) ?? []).some((t) => useful.has(t))) {
        useful.add(id);
        changed = true;
      }
    }
  }
  return new Set([...generative].filter((id) => !useful.has(id)));
}

export function mergeNodeRuntime(
  data: NodeData,
  patch: {
    outputs?: NodeOutput[];
    runStatus?: string;
    runError?: string | null;
    runUsage?: UsageInfo;
  },
): NodeData {
  return {
    ...data,
    ...(patch.outputs ? { outputs: patch.outputs } : {}),
    ...(patch.runStatus ? { runStatus: patch.runStatus } : {}),
    ...(patch.runError !== undefined ? { runError: patch.runError ?? undefined } : {}),
    ...(patch.runUsage ? { runUsage: patch.runUsage } : {}),
  };
}

/**
 * Keep server-written run outputs when a client save arrives without them
 * (browser closed mid-run, or autosave raced the worker).
 */
export function mergeGraphRuntime(incoming: GraphDoc, stored: GraphDoc): GraphDoc {
  const prev = new Map(stored.nodes.map((n) => [n.id, n]));
  return {
    ...incoming,
    nodes: incoming.nodes.map((n) => {
      const old = prev.get(n.id);
      if (!old) return n;
      const incomingHas = (n.data.outputs?.length ?? 0) > 0;
      const storedHas = (old.data.outputs?.length ?? 0) > 0;
      if (incomingHas || !storedHas) return n;
      return {
        ...n,
        data: mergeNodeRuntime(n.data, {
          outputs: old.data.outputs,
          runStatus: (n.data.runStatus as string | undefined) ?? (old.data.runStatus as string | undefined),
          runError: (n.data.runError as string | undefined) ?? (old.data.runError as string | undefined),
          runUsage: (n.data.runUsage as UsageInfo | undefined) ?? (old.data.runUsage as UsageInfo | undefined),
        }),
      };
    }),
  };
}
