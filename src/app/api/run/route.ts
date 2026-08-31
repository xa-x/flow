import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { enqueueRun } from "@/lib/runs/enqueue";
import { eventsAfter } from "@/lib/runs/events";
import { ensureJobLoop } from "@/lib/runs/worker";
import { PlanLimitError } from "@/lib/billing";
import type { GraphDoc, NodeOutput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/run — enqueue a durable run and stream NDJSON events
 * (compat wrapper around POST /api/runs + SSE).
 */
export async function POST(req: NextRequest) {
  ensureJobLoop();
  let actor;
  try {
    actor = await requireActor(req);
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "auth" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await req.json();
  const graph = body?.graph as GraphDoc | undefined;
  const graphId: string | undefined =
    typeof body?.graphId === "string" ? body.graphId : undefined;
  if (!graphId && (!graph || !Array.isArray(graph.nodes))) {
    return new Response(JSON.stringify({ error: "graph or graphId required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let runId: string;
  try {
    const enq = await enqueueRun(
      {
        orgId: actor.org.id,
        userId: actor.user.id,
        graphId: graphId ?? "",
        trigger: "manual",
        only: typeof body?.only === "string" ? body.only : undefined,
        from: typeof body?.from === "string" ? body.from : undefined,
        cached: body?.cached as Record<string, NodeOutput[]> | undefined,
        graphOverride: graph,
      },
      actor.org.plan,
    );
    runId = enq.run.id;
  } catch (e) {
    const status = e instanceof PlanLimitError ? 402 : 400;
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "enqueue failed" }),
      { status, headers: { "content-type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let cursor = 0;
      const push = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      push({ type: "run", runId, status: "started", ts: Date.now() });
      try {
        for (let i = 0; i < 1500 && !closed; i++) {
          const rows = await eventsAfter(runId, cursor);
          for (const row of rows) {
            cursor = row.seq;
            const payload = (row.payload ?? {}) as Record<string, unknown>;
            if (payload.type) push(payload);
            else push({ type: row.type, nodeId: row.nodeId, ...payload });
          }
          const [fresh] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
          if (
            fresh &&
            ["done", "error", "cancelled", "timed_out"].includes(fresh.status) &&
            rows.length === 0
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
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
