"use client";

export function PlayBar({
  title,
  onTitle,
  running,
  onRun,
  onSave,
  saved,
  dirty,
}: {
  title: string;
  onTitle: (t: string) => void;
  running: boolean;
  onRun: () => void;
  onSave: () => void;
  saved: string | null;
  dirty: boolean;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#1d1f27] bg-[#101218] px-4">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="4" cy="8" r="2.4" fill="#c9a227" />
          <circle cx="12" cy="3.5" r="2.4" fill="#2fb380" />
          <circle cx="12" cy="12.5" r="2.4" fill="#4a90d9" />
          <path
            d="M6 7 10 4.5M6 9l4 2.5"
            stroke="#3a3f4d"
            strokeWidth="1.2"
          />
        </svg>
        <span className="text-[13px] font-semibold tracking-wide text-[#e8e9ee]">
          Flowbook
        </span>
      </div>

      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        spellCheck={false}
        className="w-64 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-[#c9ccd4] outline-none transition-colors hover:border-[#262932] focus:border-[#3a3f4d] focus:bg-[#0f1014]"
        aria-label="Workbook title"
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[11px] text-[#5f6470]">
          {running
            ? "Running…"
            : saved
              ? `Saved ${saved}`
              : dirty
                ? "Unsaved"
                : "Saved"}
        </span>
        <button
          onClick={onSave}
          className="rounded-md border border-[#262932] px-2.5 py-1 text-[12px] text-[#9aa0ad] transition-colors hover:border-[#3a3f4d] hover:text-[#c9ccd4]"
        >
          Save
        </button>
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 rounded-md bg-[#c9a227] px-3 py-1 text-[12px] font-medium text-[#14161c] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-[#14161c] border-t-transparent" />
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M1.5 0.8 8.5 5 1.5 9.2Z" fill="currentColor" />
            </svg>
          )}
          Run
        </button>
      </div>
    </header>
  );
}
