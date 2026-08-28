"use client";

import type { ProviderConfig, RunSettings } from "./types";
import { PROVIDER_SPECS } from "./providers";

/**
 * Provider credentials saved locally in this browser (localStorage).
 * They ride along with every /api/run call; .env values remain the
 * server-side fallback when a field is empty here.
 */

const KEY = "flowbook.settings.v2";

export function defaultSettings(): RunSettings {
  const providers: Record<string, ProviderConfig> = {};
  for (const spec of PROVIDER_SPECS) providers[spec.id] = {};
  return { providers };
}

export function loadSettings(): RunSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as { providers?: Record<string, ProviderConfig> };
    const out = defaultSettings();
    if (parsed.providers && typeof parsed.providers === "object") {
      for (const [id, cfg] of Object.entries(parsed.providers)) {
        if (!cfg || typeof cfg !== "object") continue;
        out.providers[id] = {
          baseUrl: typeof cfg.baseUrl === "string" ? cfg.baseUrl : "",
          apiKey: typeof cfg.apiKey === "string" ? cfg.apiKey : "",
        };
      }
    }
    return out;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: RunSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — settings stay session-only */
  }
}

/** True when at least one provider is usable (client key or .env fallback). */
export function hasUsableProvider(
  s: RunSettings,
  env: Record<string, boolean> = {},
): boolean {
  for (const spec of PROVIDER_SPECS) {
    const c = s.providers[spec.id];
    if (c?.apiKey) return true;
    if (env[spec.id]) return true;
  }
  return false;
}
