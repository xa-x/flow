export default function Loading() {
  return (
    <div className="fb-atmosphere flex min-h-dvh items-center justify-center">
      <div className="flex items-center gap-3 text-muted">
        <span className="fb-eq text-accent" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
          Loading
        </span>
      </div>
    </div>
  );
}
