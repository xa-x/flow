"use client";

import { useCallback, useEffect, useState } from "react";

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

function fmtCost(micro: number) {
  if (!micro) return "—";
  const usd = micro / 1e6;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
function fmtDur(ms?: number | null) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
function ago(t: string | number) {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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

  const load = useCallback(async () => {
    if (!graphId) return setRuns([]);
    try {
      const res = await fetch(`/api/runs?graphId=${graphId}&limit=15`);
      const j = await res.json();
      setRuns(Array.isArray(j?.runs) ? j.runs : []);
    } catch {
      /* offline */
    }
  }, [graphId]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const expand = async (runId: string) => {
    if (open === runId) return setOpen(null);
    setOpen(runId);
    if (!nodes[runId]) {
      try {
        const res = await fetch(`/api/runs?runId=${runId}&nodes=1`);
        const j = await res.json();
        setNodes((n) => ({ ...n, [runId]: Array.isArray(j?.nodes) ? j.nodes : [] }));
      } catch {
        /* ignore */
      }
    }
  };

  if (!graphId)
    return (
      <p className="px-3 py-2 text-[11.5px] text-faint">
        Save the workbook to collect run history.
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
                    : "bg-accent"
              }`}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-wide text-ink/80">
              {r.trigger === "node" ? "single node" : "full run"} ·{" "}
              {r.totalTokens.toLocaleString()} tok
            </span>
            <span className="shrink-0 font-mono text-[9.5px] text-faint">
              {fmtCost(r.totalCostUsd)} · {fmtDur(r.durationMs)} · {ago(r.startedAt)}
            </span>
          </button>
          {open === r.id && (
            <div className="border-b border-line/60 bg-sunken/40 px-3 py-2">
              {r.error && (
                <p className="mb-1 text-[10.5px] leading-snug text-[#eb9082]">{r.error}</p>
              )}
              {(nodes[r.id] ?? []).length ? (
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
                      <tr key={n.id} className={n.status === "error" ? "text-err" : ""}>
                        <td className="max-w-40 truncate py-px" title={n.model ?? ""}>
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
