"use client";

import { useEffect, useRef } from "react";

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
}: {
  lines: ConsoleLine[];
  runId?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className="flex max-h-48 flex-col overflow-hidden rounded-xl border border-line bg-card/95 font-mono text-[10.5px]">
      <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5 text-[9px] uppercase tracking-[0.16em] text-faint">
        <span>Console</span>
        <span>{runId ? runId.slice(0, 8) : "idle"}</span>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-auto px-2.5 py-1.5">
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
    </div>
  );
}
