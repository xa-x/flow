"use client";

import { useEffect, useState } from "react";

export type ToastKind = "error" | "ok" | "info";

export function toast(
  message: string,
  kind: ToastKind = "info",
  action?: { label: string; onClick: () => void },
) {
  window.dispatchEvent(
    new CustomEvent("flowbook:toast", { detail: { message, kind, action } }),
  );
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: { label: string; onClick: () => void };
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, kind, action } = (e as CustomEvent).detail as {
        message: string;
        kind?: ToastKind;
        action?: { label: string; onClick: () => void };
      };
      if (!message) return;
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, message, kind: kind ?? "info", action }]);
      window.setTimeout(() => {
        setItems((xs) => xs.filter((t) => t.id !== id));
      }, 4200);
    };
    window.addEventListener("flowbook:toast", onToast);
    return () => window.removeEventListener("flowbook:toast", onToast);
  }, []);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`fb-pop pointer-events-auto rounded-xl border px-3 py-2.5 text-[12.5px] leading-snug shadow-2xl backdrop-blur ${
            t.kind === "error"
              ? "border-err/40 bg-card/95 text-err"
              : t.kind === "ok"
                ? "border-ok/40 bg-card/95 text-ok"
                : "border-line bg-card/95 text-ink"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  setItems((xs) => xs.filter((x) => x.id !== t.id));
                }}
                className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-live"
              >
                {t.action.label}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
