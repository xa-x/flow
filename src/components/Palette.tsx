"use client";

import { nodeDef, type NodeTypeDef } from "@/lib/nodes";

const GROUPS: { key: NodeTypeDef["category"]; label: string }[] = [
  { key: "input", label: "Inputs" },
  { key: "ai", label: "AI" },
  { key: "output", label: "Outputs" },
];

export function Palette({
  onAdd,
  defs,
}: {
  onAdd: (type: string) => void;
  defs: NodeTypeDef[];
}) {
  return (
    <aside className="absolute left-3 top-3 z-10 w-52 select-none rounded-xl border border-[#23262f] bg-[#14161c]/95 p-2.5 shadow-xl backdrop-blur">
      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6d7280]">
        Nodes
      </div>
      <div className="max-h-[70vh] space-y-3 overflow-auto pr-0.5">
        {GROUPS.map((g) => {
          const items = defs.filter((d) => d.category === g.key);
          if (!items.length) return null;
          return (
            <div key={g.key}>
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-[#4d515c]">
                {g.label}
              </div>
              <div className="space-y-1">
                {items.map((d) => (
                  <button
                    key={d.type}
                    onClick={() => onAdd(d.type)}
                    title={d.description}
                    className="group flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-[#2c303b] hover:bg-[#191c24]"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: d.color }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-[#d5d8e0]">
                        {d.label}
                      </span>
                      <span className="block truncate text-[10px] text-[#5f6470]">
                        {d.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export { nodeDef };
