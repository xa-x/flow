export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2" title="Flowbook">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="3.5" cy="8" r="2.2" fill="#3b82f6" />
        <circle cx="12.5" cy="3.5" r="2.2" fill="#22c55e" />
        <circle cx="12.5" cy="12.5" r="2.2" fill="#ef4444" />
        <path
          d="M5.6 7 10.4 4.4M5.6 9l4.8 2.6"
          stroke="#555555"
          strokeWidth="1.1"
        />
      </svg>
      {!compact && (
        <span className="text-[13px] font-semibold tracking-wide text-ink">
          Flowbook
        </span>
      )}
    </span>
  );
}
