"use client";

import { useEffect, useRef } from "react";
import { fmtUsd } from "@/lib/format";

export interface ConsoleLine {
  seq: number;
  type: string;
  level: string;
  nodeId?: string | null;
  status?: string;
  message?: string;
  ts: number;
}

export function MiniConsole({
  lines,
  runId,
  costUsd,
  collapsed,
  onToggle,
}: {
  lines: ConsoleLine[];
  runId?: string | null;
  costUsd?: number | null;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (collapsed) return;
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length, collapsed]);

  const cost = fmtUsd(costUsd);
  const label = runId ? runId.slice(0, 8) : "idle";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-card/95 font-mono text-[10.5px]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5 text-[9px] uppercase tracking-[0.16em] text-faint">
        <span>Console</span>
        <div className="flex items-center gap-2">
          {cost !== "—" && <span className="normal-case tracking-normal text-muted">{cost}</span>}
          <span>{label}</span>
          {onToggle && (
            <button
              onClick={onToggle}
              title={collapsed ? "Expand console" : "Minimize console"}
              className="flex h-4 w-4 items-center justify-center rounded text-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              {collapsed ? (
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                  <path
                    d="M1.5 5.2 4 2.8 6.5 5.2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                  <path
                    d="M1.5 3 4 5.4 6.5 3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div ref={ref} className="max-h-48 min-h-0 flex-1 overflow-auto px-2.5 py-1.5">
          {!lines.length && <p className="text-faint">Requests will appear here.</p>}
          {lines.map((l) => (
            <div
              key={`${l.seq}-${l.ts}`}
              className={`flex gap-2 py-0.5 ${
                l.level === "error" ? "text-err" : l.status === "running" ? "text-live" : "text-muted"
              }`}
            >
              <span className="shrink-0 text-faint">
                {new Date(l.ts).toLocaleTimeString()}
              </span>
              <span className="shrink-0 uppercase">{l.type}</span>
              <span className="min-w-0 truncate">
                {l.nodeId ?? ""}
                {l.status ? ` ${l.status}` : ""}
                {l.message ? ` ${l.message}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
