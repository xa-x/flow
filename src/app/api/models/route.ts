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

/** OpenRouter tags text-to-speech as "speech". */
const MODALITY_ALIASES: Record<string, ModelModality> = { speech: "audio" };

/** The output modality strings a provider declared, if it declared any. */
function declaredOutputs(raw: Record<string, unknown>): string[] {
  const arch = raw.architecture as
    | { output_modalities?: unknown; modality?: unknown }
    | undefined;
  const listed = Array.isArray(arch?.output_modalities)
    ? arch.output_modalities
    : [];
  const fromArch = listed.filter((m): m is string => typeof m === "string");
  if (fromArch.length) return fromArch;

  // Older shape: "text+image->text".
  const modality = typeof arch?.modality === "string" ? arch.modality : "";
  const outSide = modality.split("->")[1] ?? "";
  return outSide
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * What a model emits. The provider's own declaration always wins; the
 * id/label heuristic is a fallback for providers that declare nothing.
 *
 * Returns empty when everything declared is something no node can consume —
 * embeddings, transcription, rerank. Those must not fall through to the
 * heuristic, which defaults to "text" and would file all ~60 of OpenRouter's
 * into the AI Text picker.
 */
function outputsOf(
  raw: Record<string, unknown>,
  id: string,
  label: string,
): ModelModality[] {
  const declared = declaredOutputs(raw);
  if (!declared.length) return inferOutputs(id, label);
  const mapped = declared
    .map((m) => m.toLowerCase())
    .map((m) => MODALITY_ALIASES[m] ?? m)
    .filter((m): m is ModelModality => MODALITIES.has(m as ModelModality));
  return [...new Set(mapped)];
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
      // OpenRouter serves its catalog publicly, so the picker can be filled
      // before a key is set. Gateways always need one.
      if (!base || (!key && spec.id !== "openrouter")) return [spec.id, []] as const;

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
            headers: key ? { Authorization: `Bearer ${key}` } : undefined,
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
          // nothing to wire a rerank or embedding model into
          .filter((m) => m.outputs.length)
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
