"use client";

import { useState } from "react";

interface Book {
  id: string;
  title: string;
  updatedAt?: string | number;
}

function ago(t?: string | number) {
  if (!t) return "";
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function PlayBar({
  title,
  onTitle,
  running,
  onRun,
  onSave,
  saved,
  dirty,
  books,
  activeId,
  onOpen,
  onNew,
  onSettings,
}: {
  title: string;
  onTitle: (t: string) => void;
  running: boolean;
  onRun: () => void;
  onSave: () => void;
  saved: string | null;
  dirty: boolean;
  books: Book[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card/60 px-4 backdrop-blur">
      {/* wordmark */}
      <div className="flex items-center gap-2" title="Flowbook">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="3.5" cy="8" r="2.2" fill="#e2b344" />
          <circle cx="12.5" cy="3.5" r="2.2" fill="#4a4f5e" />
          <circle cx="12.5" cy="12.5" r="2.2" fill="#4a4f5e" />
          <path d="M5.6 7 10.4 4.4M5.6 9l4.8 2.6" stroke="#3a3f4d" strokeWidth="1.1" />
        </svg>
        <span className="text-[13px] font-semibold tracking-wide text-ink">
          Flowbook
        </span>
      </div>

      {/* workbook menu */}
      <div className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          disabled={running}
          title="Workbooks"
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="1.5" y="2" width="8" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
            <path d="M11.5 3.2v8.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <svg
            width="7"
            height="7"
            viewBox="0 0 8 8"
            aria-hidden
            className={`transition-transform ${menu ? "rotate-180" : ""}`}
          >
            <path d="M1 2.5 4 5.5 7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>

        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="fb-pop absolute left-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-card/95 shadow-2xl backdrop-blur">
              <div className="border-b border-line px-3 pb-1.5 pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
                Workbooks
              </div>
              <div className="max-h-72 overflow-auto py-1">
                {books.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setMenu(false);
                      onOpen(b.id);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.05] ${
                      b.id === activeId ? "bg-white/[0.04]" : ""
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        b.id === activeId ? "bg-accent" : "bg-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink/90">
                      {b.title || "Untitled"}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-faint">
                      {ago(b.updatedAt)}
                    </span>
                  </button>
                ))}
                {!books.length && (
                  <p className="px-3 py-2 text-[11.5px] text-faint">
                    Nothing saved yet.
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setMenu(false);
                  onNew();
                }}
                className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[12px] text-muted transition-colors hover:bg-white/[0.05] hover:text-accent"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                New workbook
              </button>
            </div>
          </>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        spellCheck={false}
        placeholder="Untitled"
        className="w-56 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink/90 outline-none transition-colors hover:border-line focus:border-line2 focus:bg-sunken"
        aria-label="Workbook title"
      />

      <div className="ml-auto flex items-center gap-3.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {running ? "Running" : dirty ? "Editing…" : saved ? `Saved ${saved}` : "Saved"}
        </span>
        <button
          onClick={onSettings}
          disabled={running}
          title="Settings — provider keys"
          className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-40"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="2.1" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M7 1.2v1.6M7 11.2v1.6M12.8 7h-1.6M2.8 7H1.2M11.2 2.8l-1.1 1.1M3.9 10.1l-1.1 1.1M11.2 11.2l-1.1-1.1M3.9 3.9 2.8 2.8"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          onClick={onSave}
          disabled={running}
          className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={onRun}
          disabled={running}
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-medium transition-all ${
            running
              ? "cursor-default bg-accent/15 text-accent"
              : "bg-accent text-canvas hover:brightness-110 active:scale-[0.98]"
          }`}
        >
          {running ? (
            <>
              <span className="fb-eq" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              Running
            </>
          ) : (
            <>
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
                <path d="M1.5 0.8 8.5 5 1.5 9.2Z" fill="currentColor" />
              </svg>
              Run
            </>
          )}
        </button>
      </div>

      {/* signal sweeps under the bar while the graph runs */}
      {running && <span className="fb-progress" aria-hidden />}
    </header>
  );
}
