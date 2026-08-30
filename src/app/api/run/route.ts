import { NextRequest } from "next/server";
import { executeGraph } from "@/lib/engine";
import type { GraphDoc, NodeOutput, ProviderConfig, RunSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/run
 * { graph: GraphDoc, graphId?, only?, from?, cached?, settings? }
 * Client-local provider credentials ride in settings.providers[id].
 * Streams NDJSON: one RunEvent per line (run/node/delta events).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const graph = body?.graph as GraphDoc | undefined;
  if (!graph || !Array.isArray(graph.nodes)) {
    return new Response(JSON.stringify({ error: "graph required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const only: string | undefined =
    typeof body?.only === "string" ? body.only : undefined;
  const from: string | undefined =
    typeof body?.from === "string" ? body.from : undefined;
  const graphId: string | undefined =
    typeof body?.graphId === "string" ? body.graphId : undefined;
  const cached: Record<string, NodeOutput[]> | undefined = body?.cached;

  // sanitize settings.providers: { id: { baseUrl?, apiKey? } }
  const providers: Record<string, ProviderConfig> = {};
  const raw = body?.settings?.providers;
  if (raw && typeof raw === "object") {
    for (const [id, cfg] of Object.entries(raw as Record<string, unknown>)) {
      if (!cfg || typeof cfg !== "object") continue;
      const c = cfg as Record<string, unknown>;
      const entry: ProviderConfig = {};
      if (typeof c.baseUrl === "string" && c.baseUrl.trim())
        entry.baseUrl = c.baseUrl.trim();
      if (typeof c.apiKey === "string" && c.apiKey.trim())
        entry.apiKey = c.apiKey.trim();
      providers[id] = entry;
    }
  }
  const settings: RunSettings | undefined = Object.keys(providers).length
    ? { providers }
    : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        for await (const ev of executeGraph(graph, { graphId, only, from, cached, settings })) {
          push(ev);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push({ type: "run", status: "error", error: msg, ts: Date.now() });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
