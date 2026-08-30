import type { ReactNode } from "react";

export function StatusScreen({
  kicker,
  title,
  body,
  action,
}: {
  kicker: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="fb-atmosphere relative flex min-h-dvh items-center justify-center px-6">
      <div className="fb-grain" aria-hidden />
      <div className="relative z-10 w-full max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
          {kicker}
        </p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
