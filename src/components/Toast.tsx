"use client";

import { useEffect, useState } from "react";

export type ToastKind = "error" | "ok" | "info";

export function toast(message: string, kind: ToastKind = "info") {
  window.dispatchEvent(
    new CustomEvent("flowbook:toast", { detail: { message, kind } }),
  );
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail as {
        message: string;
        kind?: ToastKind;
      };
      if (!message) return;
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { id, message, kind: kind ?? "info" }]);
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
          {t.message}
        </div>
      ))}
    </div>
  );
}
