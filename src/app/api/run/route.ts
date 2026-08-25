import { NextRequest } from "next/server";
import { executeGraph } from "@/lib/engine";
import type { GraphDoc, NodeOutput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/run
 * { graph: GraphDoc, only?: nodeId, cached?: Record<nodeId, NodeOutput[]> }
 * Streams NDJSON: one RunEvent per line.
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
  const cached: Record<string, NodeOutput[]> | undefined = body?.cached;

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
        for await (const ev of executeGraph(graph, { only, cached })) {
          push(ev);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push({ error: msg, ts: Date.now() });
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
