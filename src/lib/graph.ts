/** Graph helpers safe for the browser — no Node built-ins. */

import type { GraphDoc, NodeData, NodeOutput, UsageInfo } from "./types";

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
