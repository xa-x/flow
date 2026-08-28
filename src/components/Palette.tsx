"use client";

import { useState } from "react";
import type { NodeTypeDef } from "@/lib/nodes";

const GROUPS: { key: NodeTypeDef["category"]; label: string }[] = [
  { key: "input", label: "Inputs" },
  { key: "ai", label: "AI" },
  { key: "output", label: "Outputs" },
];

export const DND_MIME = "application/x-flowbook-node";

export function Palette({
  onAdd,
  defs,
}: {
  onAdd: (type: string) => void;
  defs: NodeTypeDef[];
}) {
  const [open, setOpen] = useState(true);

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="fb-pop absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted shadow-lg backdrop-blur transition-colors hover:border-line2 hover:text-ink"
      >
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Node
      </button>
    );

  return (
    <aside className="absolute left-3 top-3 z-10 w-44 select-none rounded-xl border border-line bg-card/90 py-2 shadow-xl backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between px-2.5 pl-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
          Nodes
        </span>
        <button
          onClick={() => setOpen(false)}
          title="Hide"
          className="flex h-4 w-4 items-center justify-center rounded text-faint transition-colors hover:bg-white/5 hover:text-muted"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
            <path d="M1.5 1.5 6.5 6.5M6.5 1.5 1.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {GROUPS.map((g) => {
        const items = defs.filter((d) => d.category === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className="mb-2 last:mb-0">
            <div className="px-3 pb-0.5 pt-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-faint/70">
              {g.label}
            </div>
            {items.map((d) => (
              <button
                key={d.type}
                onClick={() => onAdd(d.type)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_MIME, d.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                title={d.description}
                className="flex w-full cursor-grab items-center gap-2 px-3 py-[5px] text-left transition-colors hover:bg-white/[0.04] active:cursor-grabbing"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="truncate text-[12px] text-muted transition-colors hover:text-ink">
                  {d.label}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </aside>
  );
}
