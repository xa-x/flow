import type { GraphDoc, NodeOutput, RunEvent } from "./types";
import { runNode } from "./runners";
import { db } from "@/db";
import { runs } from "@/db/schema";

const MAX_CONCURRENCY = 4;

/**
 * Execute a graph in topological order with a small worker pool.
 * Independent nodes run concurrently; a node's upstream outputs are
 * gathered by target handle before it starts.
 *
 * `only` = run a single node (inputs come from `cached` upstream outputs).
 * Yields live status events for the canvas.
 */
export async function* executeGraph(
  graph: GraphDoc,
  opts: {
    graphId?: string;
    only?: string;
    cached?: Record<string, NodeOutput[]>;
  } = {},
): AsyncGenerator<RunEvent> {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = graph.edges.filter(
    (e) => nodes.has(e.source) && nodes.has(e.target),
  );

  const outputs = new Map<string, NodeOutput[]>(
    Object.entries(opts.cached ?? {}),
  );

  // adjacency
  const inDeg = new Map<string, number>();
  const incoming = new Map<string, string[]>(); // target -> source ids
  const outgoing = new Map<string, string[]>(); // source -> target ids
  for (const n of graph.nodes) {
    inDeg.set(n.id, 0);
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    incoming.get(e.target)!.push(e.source);
    outgoing.get(e.source)!.push(e.target);
  }

  // event channel
  const queue: RunEvent[] = [];
  let notify: (() => void) | null = null;
  let finished = false;
  const emit = (e: RunEvent) => {
    queue.push(e);
    notify?.();
  };

  const gatherInputs = (nodeId: string) => {
    const inputs: Record<string, NodeOutput[]> = {};
    for (const e of edges) {
      if (e.target !== nodeId) continue;
      const key = e.targetHandle ?? "in";
      (inputs[key] ??= []).push(...(outputs.get(e.source) ?? []));
    }
    return inputs;
  };

  const persist = async (
    nodeId: string,
    status: string,
    output?: NodeOutput[],
    error?: string,
  ) => {
    if (!opts.graphId) return;
    try {
      await db
        .insert(runs)
        .values({
          id: `${opts.graphId}:${nodeId}:${Date.now()}`,
          graphId: opts.graphId,
          nodeId,
          status,
          output: output ?? null,
          error: error ?? null,
          startedAt: new Date(),
          finishedAt: new Date(),
        })
        .onConflictDoNothing();
    } catch {
      /* best effort */
    }
  };

  // scheduler (detached)
  const schedule = (async () => {
    const failed = new Set<string>();
    const settled = new Set<string>();
    const pending: string[] = [];

    const released = new Set<string>();
    const release = (id: string) => {
      if (released.has(id)) return;
      released.add(id);
      for (const t of outgoing.get(id) ?? []) {
        const d = (inDeg.get(t) ?? 1) - 1;
        inDeg.set(t, d);
        if (d === 0) pending.push(t);
      }
    };

    if (opts.only) {
      pending.push(opts.only);
    } else {
      for (const n of graph.nodes)
        if ((inDeg.get(n.id) ?? 0) === 0) pending.push(n.id);
    }

    const runOne = async (nodeId: string) => {
      const node = nodes.get(nodeId);
      if (!node) return;
      emit({ nodeId, status: "running", ts: Date.now() });
      await persist(nodeId, "running");
      try {
        const result = await runNode(nodeId, node.data, gatherInputs(nodeId));
        outputs.set(nodeId, result);
        emit({ nodeId, status: "done", outputs: result, ts: Date.now() });
        await persist(nodeId, "done", result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.add(nodeId);
        emit({ nodeId, status: "error", error: msg, ts: Date.now() });
        await persist(nodeId, "error", undefined, msg);
      } finally {
        settled.add(nodeId);
        release(nodeId);
      }
    };

    const executing = new Set<Promise<void>>();
    while (pending.length || executing.size) {
      while (pending.length && executing.size < MAX_CONCURRENCY) {
        const id = pending.shift()!;
        if (settled.has(id)) continue;
        // skip nodes whose upstream failed (only in full-run mode)
        if (!opts.only) {
          const up = incoming.get(id) ?? [];
          if (up.some((s) => failed.has(s))) {
            settled.add(id);
            emit({
              nodeId: id,
              status: "error",
              error: "skipped: upstream failed",
              ts: Date.now(),
            });
            release(id);
            continue;
          }
        }
        const p = runOne(id).finally(() => executing.delete(p));
        executing.add(p);
      }
      if (executing.size) await Promise.race(executing);
    }
  })();

  schedule.catch((e) => console.error("[engine] scheduler crashed:", e)).finally(() => {
    finished = true;
    notify?.();
  });

  // stream events as they happen
  while (!finished || queue.length) {
    if (!queue.length) {
      await new Promise<void>((r) => (notify = r));
      notify = null;
      continue;
    }
    yield queue.shift()!;
  }
}
