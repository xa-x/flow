import type { GraphDoc, NodeOutput, RunEvent, RunSettings, UsageInfo } from "./types";
import { runNode, providerFor, modelFor } from "./runners";
import { nodeDef } from "./nodes";
import { db } from "@/db";
import { runs, runNodes } from "@/db/schema";
import { newId } from "./artifacts";

const MAX_CONCURRENCY = 4;

/**
 * Execute a graph in topological order with a small worker pool.
 * Independent nodes run concurrently; upstream outputs are gathered by
 * target handle before a node starts. Every execution is persisted as a
 * `run` row + per-node `run_nodes` rows, and live events (status + token
 * deltas + usage) stream back to the canvas.
 *
 * `only` = run a single node (inputs come from `cached` upstream outputs).
 */
export async function* executeGraph(
  graph: GraphDoc,
  opts: {
    graphId?: string;
    only?: string;
    cached?: Record<string, NodeOutput[]>;
    settings?: RunSettings;
  } = {},
): AsyncGenerator<RunEvent> {
  const runId = newId();
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = graph.edges.filter(
    (e) => nodes.has(e.source) && nodes.has(e.target),
  );

  const outputs = new Map<string, NodeOutput[]>(
    Object.entries(opts.cached ?? {}),
  );

  // adjacency
  const inDeg = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
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
      let outs = outputs.get(e.source) ?? [];
      // A source handle may declare a port type (e.g. Media Out's three
      // passthrough handles) — only forward results matching it.
      const srcNode = nodes.get(e.source);
      const port =
        srcNode &&
        nodeDef(srcNode.data.kind)?.outputs.find((p) => p.id === e.sourceHandle);
      if (port && port.type !== "json")
        outs = outs.filter((o) => o.type === port.type);
      (inputs[key] ??= []).push(...outs);
    }
    return inputs;
  };

  // ---- run persistence (best effort — never block execution) ----
  const totals = { costUsd: 0, tokens: 0 };
  const runStarted = Date.now();
  const persistRun = async (status: string, error?: string) => {
    if (!opts.graphId) return;
    try {
      await db
        .insert(runs)
        .values({
          id: runId,
          graphId: opts.graphId,
          status,
          trigger: opts.only ? "node" : "manual",
          only: opts.only ?? null,
          totalCostUsd: Math.round(totals.costUsd * 1e6), // micro-dollars
          totalTokens: totals.tokens,
          durationMs: Date.now() - runStarted,
          error: error ?? null,
          startedAt: new Date(runStarted),
          finishedAt: new Date(),
        })
        .onConflictDoNothing();
    } catch {
      /* best effort */
    }
  };

  const persistNode = async (
    nodeId: string,
    status: string,
    result?: { outputs?: NodeOutput[]; usage?: UsageInfo },
    error?: string,
    startedAt?: number,
    data?: { kind: string; provider?: string; model?: string },
  ) => {
    if (!opts.graphId) return;
    try {
      await db
        .insert(runNodes)
        .values({
          id: `${runId}:${nodeId}`,
          runId,
          graphId: opts.graphId,
          nodeId,
          status,
          output: result?.outputs ?? null,
          error: error ?? null,
          model: data?.model ?? modelFor(data as never) ?? null,
          provider: data?.provider ?? (data ? providerFor(data as never) : null),
          costUsd: Math.round((result?.usage?.costUsd ?? 0) * 1e6),
          tokensIn: result?.usage?.tokensIn ?? 0,
          tokensOut: result?.usage?.tokensOut ?? 0,
          durationMs: startedAt ? Date.now() - startedAt : null,
          startedAt: startedAt ? new Date(startedAt) : null,
          finishedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: runNodes.id,
          set: {
            status,
            output: result?.outputs ?? null,
            error: error ?? null,
            costUsd: Math.round((result?.usage?.costUsd ?? 0) * 1e6),
            tokensIn: result?.usage?.tokensIn ?? 0,
            tokensOut: result?.usage?.tokensOut ?? 0,
            durationMs: startedAt ? Date.now() - startedAt : null,
            finishedAt: new Date(),
          },
        });
    } catch {
      /* best effort */
    }
  };

  // scheduler (detached)
  const state = { failedAny: false };
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
      const started = Date.now();
      emit({ type: "node", nodeId, status: "running", ts: started });
      await persistNode(nodeId, "running", undefined, undefined, started, node.data);
      try {
        const result = await runNode(nodeId, node.data, gatherInputs(nodeId), {
          settings: opts.settings,
          emit,
          nodeId,
        });
        outputs.set(nodeId, result.outputs);
        totals.costUsd += result.usage?.costUsd ?? 0;
        totals.tokens += (result.usage?.tokensIn ?? 0) + (result.usage?.tokensOut ?? 0);
        emit({
          type: "node",
          nodeId,
          status: "done",
          outputs: result.outputs,
          usage: result.usage,
          ts: Date.now(),
        });
        await persistNode(nodeId, "done", result, undefined, started, node.data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.add(nodeId);
        state.failedAny = true;
        emit({ type: "node", nodeId, status: "error", error: msg, ts: Date.now() });
        await persistNode(nodeId, "error", undefined, msg, started, node.data);
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
              type: "node",
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

  emit({ type: "run", runId, status: "started", ts: Date.now() });

  schedule
    .catch(async (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[engine] scheduler crashed:", e);
      state.failedAny = true;
      await persistRun("error", msg);
    })
    .finally(async () => {
      finished = true;
      const status = state.failedAny ? "error" : "done";
      await persistRun(status);
      emit({
        type: "run",
        runId,
        status,
        usage: {
          totalCostUsd: totals.costUsd,
          totalTokens: totals.tokens,
          durationMs: Date.now() - runStarted,
        },
        ts: Date.now(),
      });
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
