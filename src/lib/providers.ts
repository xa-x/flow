/**
 * Provider registry — AI SDK style. Providers are OpenAI-compatible
 * gateways (or OpenRouter itself) resolved by id; each contributes a
 * createOpenRouter()-shaped instance so every capability (chat, image,
 * video, /models) works uniformly across all of them.
 */

import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import type { ProviderId, ProviderConfig, RunSettings } from "./types";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  /** needs a base URL besides the key (custom gateways) */
  needsBaseUrl?: boolean;
  /** capabilities served through the AI SDK provider instance */
  caps: ("chat" | "image" | "video")[];
  defaultBaseUrl?: string;
}

export const PROVIDER_SPECS: ProviderSpec[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    caps: ["chat", "image", "video"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "pyok",
    label: "PYOK",
    needsBaseUrl: true,
    caps: ["chat", "image"],
  },
];

/** Older id `pyk` still resolves to PYOK. */
const PROVIDER_ALIASES: Record<string, string> = { pyk: "pyok" };

export const canonicalProviderId = (id: string) =>
  PROVIDER_ALIASES[id] ?? id;

export const providerSpec = (id: string) =>
  PROVIDER_SPECS.find((p) => p.id === canonicalProviderId(id));

export function envValue(id: string, suffix: "BASE_URL" | "API_KEY"): string {
  const canon = canonicalProviderId(id);
  const keys = [`${canon.toUpperCase()}_${suffix}`];
  if (canon === "pyok") keys.push(`PYK_${suffix}`);
  if (id !== canon) keys.push(`${id.toUpperCase()}_${suffix}`);
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return "";
}

export interface ResolvedProvider {
  id: ProviderId;
  gw: OpenRouterProvider;
  apiKey: string;
  baseUrl: string;
}

const cache = new Map<string, ResolvedProvider>();

/**
 * Resolve a provider from client-sent settings with server .env fallback:
 *   openrouter → OPENROUTER_API_KEY
 *   pyok       → PYOK_BASE_URL + PYOK_API_KEY (PYK_* still accepted)
 * Unknown/custom ids: <ID>_BASE_URL + <ID>_API_KEY (e.g. ZAI_BASE_URL).
 */
export function resolveProvider(
  id: string,
  settings?: RunSettings,
): ResolvedProvider {
  const pid = canonicalProviderId(id || "openrouter") as ProviderId;
  const spec = providerSpec(pid);

  const s =
    settings?.providers?.[pid] ??
    (pid === "pyok" ? settings?.providers?.pyk : undefined);
  const baseUrl = s?.baseUrl || envValue(id, "BASE_URL") || spec?.defaultBaseUrl || "";
  const apiKey = s?.apiKey || envValue(id, "API_KEY") || "";

  if (!apiKey)
    throw new Error(
      `Provider "${pid}" is not configured — add its API key in Settings (⚙︎).`,
    );
  if (spec?.needsBaseUrl && !baseUrl)
    throw new Error(
      `Provider "${pid}" needs a base URL — set it in Settings (⚙︎).`,
    );

  const k = `${pid}|${baseUrl}|${apiKey}`;
  let hit = cache.get(k);
  if (!hit) {
    hit = {
      id: pid,
      gw: createOpenRouter({ apiKey, baseURL: baseUrl || undefined }),
      apiKey,
      baseUrl: baseUrl || spec?.defaultBaseUrl || "https://openrouter.ai/api/v1",
    };
    cache.set(k, hit);
  }
  return hit;
}

/** Which providers have usable credentials (client settings or .env). */
export function configuredProviders(settings?: RunSettings): ProviderId[] {
  const out: ProviderId[] = [];
  for (const spec of PROVIDER_SPECS) {
    const s =
      settings?.providers?.[spec.id] ??
      (spec.id === "pyok" ? settings?.providers?.pyk : undefined);
    const hasBase =
      !!s?.baseUrl || !!envValue(spec.id, "BASE_URL") || !!spec.defaultBaseUrl;
    const hasKey = !!s?.apiKey || !!envValue(spec.id, "API_KEY");
    if (hasBase || hasKey) out.push(spec.id);
  }
  return out;
}

/** Build a fresh settings object of provider configs (for /api/config). */
export function envProviderFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const spec of PROVIDER_SPECS) {
    out[spec.id] = !!envValue(spec.id, "API_KEY");
  }
  return out;
}

export function providerCreds(id: string, settings?: RunSettings) {
  const pid = canonicalProviderId(id);
  const spec = providerSpec(pid);
  const s =
    settings?.providers?.[pid] ??
    (pid === "pyok" ? settings?.providers?.pyk : undefined);
  return {
    id: pid,
    spec,
    baseUrl: s?.baseUrl || envValue(id, "BASE_URL") || spec?.defaultBaseUrl || "",
    apiKey: s?.apiKey || envValue(id, "API_KEY") || "",
  };
}

export type { ProviderConfig };
