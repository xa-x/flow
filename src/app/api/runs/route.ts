import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { graphs, runs, runNodes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/runs?limit=20                  — recent runs across workbooks
 * GET /api/runs?graphId=…&limit=20        — recent runs for one workbook
 * GET /api/runs?runId=…&nodes=1           — one run + its node rows
 */
export async function GET(req: NextRequest) {
  const graphId = req.nextUrl.searchParams.get("graphId");
  const runId = req.nextUrl.searchParams.get("runId");
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20,
    100,
  );

  if (runId) {
    const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
    const nodes = await db
      .select()
      .from(runNodes)
      .where(eq(runNodes.runId, runId));
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
  const base = db.select(cols).from(runs).leftJoin(graphs, eq(runs.graphId, graphs.id));
  const rows = await (graphId
    ? base.where(eq(runs.graphId, graphId))
    : base
  )
    .orderBy(desc(runs.startedAt))
    .limit(limit);

  return NextResponse.json({ runs: rows });
}
