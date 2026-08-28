"use client";

import { useState } from "react";
import type { RunSettings } from "@/lib/types";
import { PROVIDER_SPECS, providerSpec } from "@/lib/providers";

/**
 * Local provider credentials. Saved to this browser's localStorage and
 * sent along with each run; server .env values remain the fallback.
 */
export function SettingsModal({
  settings,
  env,
  onboarding = false,
  onSave,
  onClose,
}: {
  settings: RunSettings;
  env: Record<string, boolean>;
  onboarding?: boolean;
  onSave: (s: RunSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<RunSettings>(() => ({
    providers: { ...settings.providers },
  }));
  const set = (id: string, patch: Partial<{ baseUrl: string; apiKey: string }>) =>
    setDraft((d) => ({
      providers: {
        ...d.providers,
        [id]: { ...d.providers[id], ...patch },
      },
    }));

  const field =
    "w-full rounded-md border border-line bg-sunken px-2.5 py-2 font-mono text-[11px] text-ink/90 outline-none transition-colors placeholder:text-faint focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="fb-pop w-full max-w-md overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between px-5 pb-3 pt-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">
              {onboarding ? "Welcome to Flowbook" : "Settings"}
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-muted">
              {onboarding
                ? "Add an API key to start running nodes."
                : "Provider credentials used when running nodes."}
            </p>
          </div>
          {!onboarding && (
            <button
              onClick={onClose}
              title="Close"
              className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/5 hover:text-ink"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-auto px-5 pb-1">
          {PROVIDER_SPECS.map((spec) => {
            const cfg = draft.providers[spec.id] ?? {};
            const hasEnv = !!env[spec.id];
            return (
              <div
                key={spec.id}
                className={spec.id === "openrouter" ? "" : "rounded-lg border border-line p-3"}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
                    {spec.label}
                  </span>
                  {spec.id !== "openrouter" && (
                    <span className="rounded-full border border-line2 px-1.5 py-px font-mono text-[8.5px] uppercase tracking-wider text-faint">
                      optional
                    </span>
                  )}
                  {hasEnv && !cfg.apiKey && (
                    <span className="rounded-full border border-ok/40 px-1.5 py-px font-mono text-[8.5px] uppercase tracking-wider text-ok">
                      .env detected
                    </span>
                  )}
                </div>

                {spec.needsBaseUrl && (
                  <label className="mb-2 block">
                    <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                      Base URL
                    </span>
                    <input
                      value={cfg.baseUrl ?? ""}
                      onChange={(e) => set(spec.id, { baseUrl: e.target.value })}
                      placeholder="https://your-host/v1"
                      spellCheck={false}
                      autoComplete="off"
                      className={field}
                    />
                  </label>
                )}

                <label className="block">
                  <span className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                      API key
                    </span>
                  </span>
                  <input
                    type="password"
                    value={cfg.apiKey ?? ""}
                    onChange={(e) => set(spec.id, { apiKey: e.target.value })}
                    placeholder={
                      hasEnv
                        ? "Saved on the server — leave empty to use it"
                        : spec.id === "openrouter"
                          ? "sk-or-v1-…"
                          : "key"
                    }
                    spellCheck={false}
                    autoComplete="off"
                    className={field}
                  />
                </label>
              </div>
            );
          })}

          <p className="text-[10.5px] leading-snug text-faint">
            Keys are stored only in this browser and sent with each run.
            Values from the server&apos;s .env are used when fields stay empty.
          </p>
        </div>

        {/* actions */}
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3">
          {onboarding && (
            <button
              onClick={onClose}
              className="rounded-full px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
            >
              Skip for now
            </button>
          )}
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-full bg-accent px-4 py-1.5 text-[12px] font-medium text-canvas transition-all hover:brightness-110 active:scale-[0.98]"
          >
            {onboarding ? "Save & start" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { providerSpec };
