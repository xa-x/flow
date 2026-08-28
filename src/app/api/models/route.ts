import { NextRequest, NextResponse } from "next/server";
import type { ProviderConfig, RunSettings } from "@/lib/types";
import { PROVIDER_SPECS } from "@/lib/providers";

export const runtime = "nodejs";

interface ModelInfo {
  id: string;
  label: string;
}

/**
 * POST /api/models
 * Body: { settings?: { providers: { id: { baseUrl?, apiKey? } } } }
 * Returns every configured provider's model list via its standard
 * OpenAI-compatible `GET /models` endpoint. Per-provider failures yield
 * empty lists — never block the other providers.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = body?.settings?.providers;
  const clientProviders: Record<string, ProviderConfig> = {};
  if (raw && typeof raw === "object") {
    for (const [id, cfg] of Object.entries(raw as Record<string, unknown>)) {
      if (!cfg || typeof cfg !== "object") continue;
      const c = cfg as Record<string, unknown>;
      const entry: ProviderConfig = {};
      if (typeof c.baseUrl === "string" && c.baseUrl.trim())
        entry.baseUrl = c.baseUrl.trim();
      if (typeof c.apiKey === "string" && c.apiKey.trim())
        entry.apiKey = c.apiKey.trim();
      clientProviders[id] = entry;
    }
  }

  const settings: RunSettings = { providers: clientProviders };

  const results = await Promise.all(
    PROVIDER_SPECS.map(async (spec) => {
      const s = settings.providers[spec.id];
      const envBase = `${spec.id.toUpperCase()}_BASE_URL`;
      const envKey = `${spec.id.toUpperCase()}_API_KEY`;
      const base =
        s?.baseUrl || process.env[envBase] || spec.defaultBaseUrl || "";
      const key = s?.apiKey || process.env[envKey] || "";
      if (!base || !key) return [spec.id, []] as const;

      try {
        const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return [spec.id, []] as const;
        const j = await res.json();
        const list: ModelInfo[] = (j?.data ?? j?.models ?? [])
          .filter((m: { id?: string }) => typeof m?.id === "string")
          .map((m: { id: string; name?: string; display_name?: string }) => ({
            id: m.id,
            label: m.display_name ?? m.name ?? m.id,
          }))
          .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));
        return [spec.id, list] as const;
      } catch {
        return [spec.id, []] as const;
      }
    }),
  );

  return NextResponse.json({
    models: Object.fromEntries(results),
    updatedAt: Date.now(),
  });
}
