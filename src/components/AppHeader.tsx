"use client";

import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function AppHeader({
  active,
  onSettings,
}: {
  active: "home" | "runs";
  onSettings?: () => void;
}) {
  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-6 border-b border-line/80 px-5">
      <Link href="/" className="shrink-0">
        <Wordmark />
      </Link>
      <nav className="flex items-center gap-1">
        <NavLink href="/" current={active === "home"}>
          Workbooks
        </NavLink>
        <NavLink href="/runs" current={active === "runs"}>
          Runs
        </NavLink>
      </nav>
      {onSettings && (
        <button
          onClick={onSettings}
          title="Settings — provider keys"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/5 hover:text-ink"
        >
          <GearIcon />
        </button>
      )}
    </header>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${
        current
          ? "bg-white/[0.06] text-ink"
          : "text-muted hover:bg-white/[0.04] hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.35 1.55h3.3l.32 1.5c.44.15.85.38 1.2.66l1.5-.42 1.65 2.85-1.22.98c.07.3.1.62.1.95 0 .33-.03.65-.1.95l1.22.98-1.65 2.85-1.5-.42a5.2 5.2 0 0 1-1.2.66l-.32 1.5h-3.3l-.32-1.5a5.2 5.2 0 0 1-1.2-.66l-1.5.42-1.65-2.85 1.22-.98A4.6 4.6 0 0 1 2.85 8c0-.33.03-.65.1-.95l-1.22-.98 1.65-2.85 1.5.42c.35-.28.76-.51 1.2-.66l.32-1.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.85" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
