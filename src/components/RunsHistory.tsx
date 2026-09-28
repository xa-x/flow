"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ago, fmtCost, fmtDur } from "@/lib/format";
import { toast } from "./Toast";
import { readJson } from "@/lib/http";
import { AppHeader } from "./AppHeader";
import { useSettings } from "@/lib/use-settings";
import { SettingsModal } from "./SettingsModal";

interface RunRow {
  id: string;
  graphId: string;
  graphTitle?: string | null;
  status: string;
  trigger: string;
  totalCostUsd: number;
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

interface BookOpt {
  id: string;
  title: string;
}

export function RunsHistory() {
  const params = useSearchParams();
  const settings = useSettings();
  const initial = params.get("graphId") ?? "";
  const [filter, setFilter] = useState(initial);
  const [books, setBooks] = useState<BookOpt[]>([]);
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Record<string, RunNodeRow[]>>({});
  const [nodeState, setNodeState] = useState<Record<string, "ok" | "err">>({});

  useEffect(() => {
    fetch("/api/graphs")
      .then((r) => readJson<{ graphs?: BookOpt[] }>(r))
      .then((j) => setBooks(Array.isArray(j?.graphs) ? j.graphs : []))
      .catch(() => setBooks([]));
  }, []);

  const load = useCallback(async () => {
    setRuns(null);
    try {
      const q = filter ? `?graphId=${encodeURIComponent(filter)}&limit=50` : "?limit=50";
      const res = await fetch(`/api/runs${q}`);
      const j = await readJson<{ runs?: RunRow[]; error?: string }>(res);
      if (!res.ok) throw new Error(j.error || "Failed to load runs");
      setRuns(Array.isArray(j?.runs) ? j.runs : []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t load runs.", "error");
      setRuns([]);
    }
  }, [filter]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const expand = async (runId: string) => {
    if (open === runId) return setOpen(null);
    setOpen(runId);
    if (nodes[runId] || nodeState[runId] === "err") return;
    try {
      const res = await fetch(`/api/runs?runId=${runId}&nodes=1`);
      const j = await readJson<{ nodes?: RunNodeRow[] }>(res);
      if (!res.ok) throw new Error();
      setNodes((n) => ({ ...n, [runId]: Array.isArray(j?.nodes) ? j.nodes : [] }));
      setNodeState((s) => ({ ...s, [runId]: "ok" }));
    } catch {
      setNodeState((s) => ({ ...s, [runId]: "err" }));
      setNodes((n) => ({ ...n, [runId]: [] }));
    }
  };

  const labelFor = useMemo(() => {
    const m = new Map(books.map((b) => [b.id, b.title]));
    return (r: RunRow) => r.graphTitle || m.get(r.graphId) || "Untitled";
  }, [books]);

  return (
    <div className="fb-atmosphere relative flex min-h-dvh flex-col">
      <div className="fb-grain" aria-hidden />
      <AppHeader
        active="runs"
        onSettings={() => settings.setShowSettings(true)}
      />

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              History
            </p>
            <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight text-ink">
              Runs
            </h1>
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-muted">
              Cost, tokens, and duration for every graph execution.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
              Workbook
            </span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none focus:border-line2"
            >
              <option value="">All workbooks</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title || "Untitled"}
                </option>
              ))}
            </select>
          </label>
        </div>

        {runs === null && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl border border-line bg-card/60"
              />
            ))}
          </div>
        )}

        {runs && runs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line2 bg-card/40 px-6 py-16 text-center">
            <p className="text-[15px] font-medium text-ink">No runs yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Execute a graph from the canvas to collect history here.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-full border border-line px-4 py-2 text-[13px] text-muted transition-colors hover:border-line2 hover:text-ink"
            >
              Back to workbooks
            </Link>
          </div>
        )}

        {runs && runs.length > 0 && (
          <ul className="overflow-hidden rounded-2xl border border-line bg-card/70">
            {runs.map((r) => (
              <li key={r.id} className="border-b border-line last:border-b-0">
                <button
                  onClick={() => expand(r.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      r.status === "done"
                        ? "bg-ok"
                        : r.status === "error"
                          ? "bg-err"
                          : r.status === "cancelled"
                            ? "bg-faint"
                            : "bg-live"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] text-ink">
                      {labelFor(r)}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">
                      {r.trigger === "node" ? "single node" : "full run"} ·{" "}
                      {r.totalTokens.toLocaleString()} tok · {fmtCost(r.totalCostUsd)} ·{" "}
                      {fmtDur(r.durationMs)}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-faint">
                    {ago(r.startedAt)}
                  </span>
                </button>
                {open === r.id && (
                  <div className="border-t border-line/70 bg-sunken/50 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      {r.error ? (
                        <p className="text-[12px] leading-snug text-err">
                          {r.error}
                        </p>
                      ) : (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-faint">
                          {r.status}
                        </span>
                      )}
                      <Link
                        href={`/w/${r.graphId}`}
                        className="text-[12px] text-live hover:underline"
                      >
                        Open workbook
                      </Link>
                    </div>
                    {nodeState[r.id] === "err" ? (
                      <p className="text-[12px] text-err">
                        Couldn’t load node breakdown.
                      </p>
                    ) : !(nodes[r.id] ?? []).length && nodeState[r.id] !== "ok" ? (
                      <p className="text-[12px] text-faint">Loading…</p>
                    ) : (nodes[r.id] ?? []).length ? (
                      <table className="w-full font-mono text-[11px] text-muted">
                        <thead>
                          <tr className="text-faint">
                            <th className="pb-1 text-left font-normal">node</th>
                            <th className="pb-1 text-right font-normal">tokens</th>
                            <th className="pb-1 text-right font-normal">cost</th>
                            <th className="pb-1 text-right font-normal">time</th>
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
                                className="max-w-56 truncate py-0.5"
                                title={n.model ?? ""}
                              >
                                {n.nodeId}
                                {n.model ? ` · ${n.model}` : ""}
                              </td>
                              <td className="text-right">
                                {n.tokensIn + n.tokensOut > 0
                                  ? (n.tokensIn + n.tokensOut).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="text-right">{fmtCost(n.costUsd)}</td>
                              <td className="text-right">{fmtDur(n.durationMs)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-[12px] text-faint">No node rows.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {(settings.showSettings || settings.needsOnboard) && (
        <SettingsModal
          settings={settings.settings}
          env={settings.env}
          onboarding={settings.needsOnboard && !settings.showSettings}
          onSave={settings.persist}
          onClose={settings.dismissOnboard}
        />
      )}
    </div>
  );
}
