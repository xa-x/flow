"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { GearIcon } from "./AppHeader";
import { ago } from "@/lib/format";

interface Book {
  id: string;
  title: string;
  updatedAt?: string | number;
}

export function PlayBar({
  title,
  onTitle,
  running,
  onRun,
  onStop,
  onSave,
  saved,
  dirty,
  books,
  activeId,
  onOpen,
  onNew,
  onSettings,
  assistantOpen,
  onAssistant,
}: {
  title: string;
  onTitle: (t: string) => void;
  running: boolean;
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  saved: string | null;
  dirty: boolean;
  books: Book[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
  assistantOpen?: boolean;
  onAssistant?: () => void;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <header className="relative flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card/70 px-3 backdrop-blur-md">
      <Link
        href="/"
        title="All workbooks"
        className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M7.5 2.5 3.5 6l4 3.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <Wordmark compact />
      </Link>

      <div className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          disabled={running}
          title="Workbooks"
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect
              x="1.5"
              y="2"
              width="8"
              height="10"
              rx="1.4"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M11.5 3.2v8.1"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <svg
            width="7"
            height="7"
            viewBox="0 0 8 8"
            aria-hidden
            className={`transition-transform ${menu ? "rotate-180" : ""}`}
          >
            <path
              d="M1 2.5 4 5.5 7 2.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>

        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="fb-pop absolute left-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-line2 bg-card shadow-2xl">
              <div className="border-b border-line bg-sunken px-3 pb-1.5 pt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
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
                  <path
                    d="M5 1v8M1 5h8"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
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

      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          {running
            ? "Running"
            : dirty
              ? "Editing…"
              : saved
                ? `Saved ${saved}`
                : "Saved"}
        </span>
        <Link
          href={activeId ? `/runs?graphId=${activeId}` : "/runs"}
          title="Run history"
          className="hidden h-7 items-center rounded-md px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint transition-colors hover:bg-white/5 hover:text-ink sm:flex"
        >
          Runs
        </Link>
        {onAssistant && (
          <button
            onClick={onAssistant}
            title={assistantOpen ? "Hide assistant" : "Build with AI"}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              assistantOpen
                ? "bg-white/10 text-ink"
                : "text-faint hover:bg-white/5 hover:text-ink"
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-live"
              aria-hidden
            />
            Chat
          </button>
        )}
        <button
          onClick={onSettings}
          disabled={running}
          title="Settings — provider keys"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint transition-colors hover:bg-white/5 hover:text-ink disabled:opacity-40"
        >
          <GearIcon />
          <span className="hidden sm:inline">Settings</span>
        </button>
        <button
          onClick={onSave}
          disabled={running}
          className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          Save
        </button>
        {running ? (
          <button
            onClick={onStop}
            className="flex items-center gap-2 rounded-full border border-live/40 bg-live/10 px-4 py-1.5 text-[12px] font-medium text-live transition-all hover:bg-live/15"
          >
            <span className="fb-eq" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Stop
          </button>
        ) : (
          <button
            onClick={onRun}
            className="fb-btn-primary flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-medium transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
              <path d="M1.5 0.8 8.5 5 1.5 9.2Z" fill="currentColor" />
            </svg>
            Run
          </button>
        )}
      </div>

      {running && <span className="fb-progress" aria-hidden />}
    </header>
  );
}
