import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, runNodes, runs } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { enqueueRun } from "@/lib/runs/enqueue";
import { PlanLimitError } from "@/lib/billing";
import { ensureJobLoop } from "@/lib/runs/worker";
import type { GraphDoc, NodeOutput } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const graphId = req.nextUrl.searchParams.get("graphId");
    const runId = req.nextUrl.searchParams.get("runId");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20, 100);

    if (runId) {
      const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
      if (!run || run.orgId !== actor.org.id) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      const nodes = await db.select().from(runNodes).where(eq(runNodes.runId, runId));
      return NextResponse.json({ run, nodes });
    }

    const cols = {
      id: runs.id,
      graphId: runs.graphId,
      graphTitle: graphs.title,
      status: runs.status,
      trigger: runs.trigger,
      totalCostUsd: runs.totalCostUsd,
      totalTokens: runs.totalTokens,
      durationMs: runs.durationMs,
      error: runs.error,
      startedAt: runs.startedAt,
      finishedAt: runs.finishedAt,
    };
    const base = db
      .select(cols)
      .from(runs)
      .leftJoin(graphs, eq(runs.graphId, graphs.id))
      .where(eq(runs.orgId, actor.org.id));
    const rows = await (graphId
      ? db
          .select(cols)
          .from(runs)
          .leftJoin(graphs, eq(runs.graphId, graphs.id))
          .where(and(eq(runs.orgId, actor.org.id), eq(runs.graphId, graphId)))
          .orderBy(desc(runs.startedAt))
          .limit(limit)
      : base.orderBy(desc(runs.startedAt)).limit(limit));

    return NextResponse.json({ runs: rows });
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/runs — enqueue a durable run. */
export async function POST(req: NextRequest) {
  try {
    ensureJobLoop();
    const actor = await requireActor(req);
    const body = await req.json().catch(() => ({}));
    const graphId = typeof body.graphId === "string" ? body.graphId : "";
    if (!graphId) return NextResponse.json({ error: "graphId required" }, { status: 400 });
    const { run } = await enqueueRun(
      {
        orgId: actor.org.id,
        userId: actor.user.id,
        graphId,
        trigger: body.trigger === "api" ? "api" : "manual",
        only: typeof body.only === "string" ? body.only : undefined,
        from: typeof body.from === "string" ? body.from : undefined,
        cached: body.cached as Record<string, NodeOutput[]> | undefined,
        graphOverride: body.graph as GraphDoc | undefined,
        idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      },
      actor.org.plan,
    );
    return NextResponse.json({ runId: run.id, status: run.status }, { status: 202 });
  } catch (e) {
    if (e instanceof PlanLimitError) {
      return NextResponse.json({ error: e.message }, { status: 402 });
    }
    return fail(e);
  }
}
