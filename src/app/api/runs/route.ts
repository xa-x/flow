import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { runs, runNodes } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/runs?graphId=…&limit=20        — recent runs (with totals)
 * GET /api/runs?graphId=…&runId=…&nodes=1 — one run + its node rows
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

  if (!graphId)
    return NextResponse.json({ error: "graphId required" }, { status: 400 });

  const rows = await db
    .select()
    .from(runs)
    .where(graphId ? and(eq(runs.graphId, graphId)) : undefined)
    .orderBy(desc(runs.startedAt))
    .limit(limit);

  return NextResponse.json({ runs: rows });
}
