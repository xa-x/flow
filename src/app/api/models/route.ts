import { NextRequest, NextResponse } from "next/server";
import type { ProviderConfig, RunSettings } from "@/lib/types";
import { PROVIDER_SPECS, providerCreds } from "@/lib/providers";
import {
  inferOutputs,
  type ModelInfo,
  type ModelModality,
} from "@/lib/models";

export const runtime = "nodejs";

const MODALITIES = new Set<ModelModality>(["text", "image", "audio", "video"]);

/** OpenRouter now tags TTS as "speech" and STT as "transcription". */
function normalizeModality(raw: unknown): ModelModality | null {
  if (typeof raw !== "string") return null;
  const key = raw.toLowerCase();
  if (key === "speech") return "audio";
  if (key === "transcription" || key === "embeddings") return null;
  if (MODALITIES.has(key as ModelModality)) return key as ModelModality;
  return null;
}

function outputsOf(raw: Record<string, unknown>, id: string, label: string): ModelModality[] {
  const arch = raw.architecture;
  const listed = Array.isArray((arch as { output_modalities?: unknown })?.output_modalities)
    ? ((arch as { output_modalities: unknown[] }).output_modalities)
    : [];
  const fromArch = listed
    .map(normalizeModality)
    .filter((x): x is ModelModality => x !== null);
  if (fromArch.length) return [...new Set(fromArch)];

  const modality =
    typeof (arch as { modality?: unknown })?.modality === "string"
      ? (arch as { modality: string }).modality
      : "";
  const outSide = (modality.split("->")[1] ?? "").toLowerCase();
  const fromModality = [
    outSide.includes("speech") || outSide.includes("audio") ? "audio" : null,
    outSide.includes("video") ? "video" : null,
    outSide.includes("image") ? "image" : null,
    outSide.includes("text") ? "text" : null,
  ].filter((x): x is ModelModality => x !== null);
  if (fromModality.length) return [...new Set(fromModality)];

  return inferOutputs(id, label);
}

function voicesOf(raw: Record<string, unknown>): string[] | undefined {
  const listed = raw.supported_voices;
  if (!Array.isArray(listed) || !listed.length) return;
  const voices = listed.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return voices.length ? voices : undefined;
}

/**
 * POST /api/models
 * Body: { settings?: { providers: { id: { baseUrl?, apiKey? } } } }
 * Returns every configured provider's model list via its standard
 * OpenAI-compatible `GET /models` endpoint. OpenRouter is fetched with
 * output_modalities=all (their default is text-only).
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
      const { baseUrl: base, apiKey: key } = providerCreds(spec.id, settings);
      if (!base || !key) return [spec.id, []] as const;

      try {
        const root = base.replace(/\/$/, "");
        const start =
          spec.id === "openrouter"
            ? `${root}/models?output_modalities=all`
            : `${root}/models`;
        const rows: Record<string, unknown>[] = [];
        let next: string | null = start;
        for (let page = 0; page < 6 && next; page++) {
          const href = next.startsWith("http") ? next : `${root}${next}`;
          const res = await fetch(href, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) break;
          const text = await res.text();
          if (!text.trim()) break;
          const j = JSON.parse(text) as {
            data?: unknown[];
            models?: unknown[];
            links?: { next?: string | null };
          };
          const chunk = (j.data ?? j.models ?? []) as Record<string, unknown>[];
          rows.push(...chunk);
          next = typeof j.links?.next === "string" ? j.links.next : null;
        }
        const list: ModelInfo[] = rows
          .filter((m) => typeof m?.id === "string")
          .map((m) => {
            const id = m.id as string;
            const label =
              (typeof m.display_name === "string" && m.display_name) ||
              (typeof m.name === "string" && m.name) ||
              id;
            return {
              id,
              label,
              outputs: outputsOf(m, id, label),
              voices: voicesOf(m),
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id));
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
