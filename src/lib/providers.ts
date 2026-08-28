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
    id: "pyk",
    label: "PYK Gateway",
    needsBaseUrl: true,
    caps: ["chat", "image"],
  },
];

export const providerSpec = (id: string) => PROVIDER_SPECS.find((p) => p.id === id);

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
 *   pyk        → PYK_BASE_URL + PYK_API_KEY
 * Unknown/custom ids: <ID>_BASE_URL + <ID>_API_KEY (e.g. ZAI_BASE_URL).
 */
export function resolveProvider(
  id: string,
  settings?: RunSettings,
): ResolvedProvider {
  const pid = (id || "openrouter") as ProviderId;
  const spec = providerSpec(pid);
  const envBase = `${pid.toUpperCase()}_BASE_URL`;
  const envKey = `${pid.toUpperCase()}_API_KEY`;

  const s = settings?.providers?.[pid];
  const baseUrl =
    s?.baseUrl || process.env[envBase] || spec?.defaultBaseUrl || "";
  const apiKey = s?.apiKey || process.env[envKey] || "";

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
    const envBase = `${spec.id.toUpperCase()}_BASE_URL`;
    const envKey = `${spec.id.toUpperCase()}_API_KEY`;
    const s = settings?.providers?.[spec.id];
    const hasBase = !!s?.baseUrl || !!process.env[envBase] || !!spec.defaultBaseUrl;
    const hasKey = !!s?.apiKey || !!process.env[envKey];
    if (hasBase || hasKey) out.push(spec.id);
  }
  return out;
}

/** Build a fresh settings object of provider configs (for /api/config). */
export function envProviderFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const spec of PROVIDER_SPECS) {
    const envKey = `${spec.id.toUpperCase()}_API_KEY`;
    out[spec.id] = !!process.env[envKey];
  }
  return out;
}

export type { ProviderConfig };
