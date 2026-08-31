import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { requireActor } from "@/lib/auth";
import { eventsAfter } from "@/lib/runs/events";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await requireActor(req);
  const { id } = await params;
  const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!run || run.orgId !== actor.org.id) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let cursor = after;
      let closed = false;
      const push = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        for (let i = 0; i < 1500 && !closed; i++) {
          const rows = await eventsAfter(id, cursor);
          for (const row of rows) {
            cursor = row.seq;
            push({
              seq: row.seq,
              type: row.type,
              level: row.level,
              nodeId: row.nodeId,
              payload: row.payload,
              ts: row.createdAt instanceof Date ? row.createdAt.getTime() : row.createdAt,
            });
          }
          const [fresh] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
          if (
            fresh &&
            ["done", "error", "cancelled", "timed_out"].includes(fresh.status)
          ) {
            push({ type: "end", status: fresh.status, seq: cursor });
            break;
          }
          await new Promise((r) => setTimeout(r, 400));
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
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
