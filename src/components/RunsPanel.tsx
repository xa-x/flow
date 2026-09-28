"use client";

import { useCallback, useEffect, useState } from "react";
import { ago, fmtCost, fmtDur } from "@/lib/format";
import { readJson } from "@/lib/http";

/**
 * Run history panel — recent runs of the current workbook with totals
 * (cost / tokens / duration / status), expandable to per-node rows.
 */

interface RunRow {
  id: string;
  status: string;
  trigger: string;
  totalCostUsd: number; // micro-dollars
  totalTokens: number;
  durationMs: number | null;
  startedAt: string | number;
  error?: string | null;
}

interface RunNodeRow {
  id: string;
  nodeId: string;
  status: string;
  model: string | null;
  provider: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  durationMs: number | null;
  error: string | null;
}

export function RunsPanel({
  graphId,
  refreshKey,
}: {
  graphId: string | null;
  refreshKey: number;
}) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Record<string, RunNodeRow[]>>({});
  const [nodeState, setNodeState] = useState<Record<string, "ok" | "err">>({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!graphId) return setRuns([]);
    try {
      const res = await fetch(`/api/runs?graphId=${graphId}&limit=15`);
      const j = await readJson<{ runs?: RunRow[] }>(res);
      if (!res.ok) throw new Error();
      setFailed(false);
      setRuns(Array.isArray(j?.runs) ? j.runs : []);
    } catch {
      setFailed(true);
      setRuns([]);
    }
  }, [graphId]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const expand = async (runId: string) => {
    if (open === runId) return setOpen(null);
    setOpen(runId);
    if (nodes[runId] || nodeState[runId]) return;
    try {
      const res = await fetch(`/api/runs?runId=${runId}&nodes=1`);
      const j = await readJson<{ nodes?: RunNodeRow[] }>(res);
      if (!res.ok) throw new Error();
      setNodes((n) => ({
        ...n,
        [runId]: Array.isArray(j?.nodes) ? j.nodes : [],
      }));
      setNodeState((s) => ({ ...s, [runId]: "ok" }));
    } catch {
      setNodeState((s) => ({ ...s, [runId]: "err" }));
      setNodes((n) => ({ ...n, [runId]: [] }));
    }
  };

  if (!graphId)
    return (
      <p className="px-3 py-2 text-[11.5px] text-faint">
        Save the workbook to collect run history.
      </p>
    );

  if (failed)
    return (
      <p className="px-3 py-2 text-[11.5px] text-err">
        Couldn’t load run history.
      </p>
    );

  if (!runs.length)
    return (
      <p className="px-3 py-2 text-[11.5px] text-faint">No runs yet.</p>
    );

  return (
    <div className="py-1">
      {runs.map((r) => (
        <div key={r.id}>
          <button
            onClick={() => expand(r.id)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                r.status === "done"
                  ? "bg-ok"
                  : r.status === "error"
                    ? "bg-err"
                    : "bg-live"
              }`}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink/80">
              {r.trigger === "node" ? "single node" : "full run"} ·{" "}
              {r.totalTokens.toLocaleString()} tok
            </span>
            <span className="shrink-0 font-mono text-[9.5px] text-faint">
              {fmtCost(r.totalCostUsd)} · {fmtDur(r.durationMs)} ·{" "}
              {ago(r.startedAt)}
            </span>
          </button>
          {open === r.id && (
            <div className="border-b border-line/60 bg-sunken/40 px-3 py-2">
              {r.error && (
                <p className="mb-1 text-[10.5px] leading-snug text-err">
                  {r.error}
                </p>
              )}
              {nodeState[r.id] === "err" ? (
                <p className="text-[10px] text-err">
                  Couldn’t load node breakdown.
                </p>
              ) : (nodes[r.id] ?? []).length ? (
                <table className="w-full font-mono text-[9.5px] text-muted">
                  <thead>
                    <tr className="text-faint">
                      <th className="text-left font-normal">node</th>
                      <th className="text-right font-normal">tokens</th>
                      <th className="text-right font-normal">cost</th>
                      <th className="text-right font-normal">time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(nodes[r.id] ?? []).map((n) => (
                      <tr
                        key={n.id}
                        className={
                          n.status === "error"
                            ? "text-err"
                            : n.status === "skipped"
                              ? "text-faint"
                              : ""
                        }
                      >
                        <td
                          className="max-w-40 truncate py-px"
                          title={n.model ?? ""}
                        >
                          {n.nodeId}
                          {n.model ? ` · ${n.model}` : ""}
                        </td>
                        <td className="text-right">
                          {n.tokensIn + n.tokensOut > 0
                            ? `${(n.tokensIn + n.tokensOut).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="text-right">{fmtCost(n.costUsd)}</td>
                        <td className="text-right">{fmtDur(n.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-[10px] text-faint">loading…</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
