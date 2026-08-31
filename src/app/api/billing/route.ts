import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { runs, usageLedger } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { monthStart, PLANS, planOf } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const plan = planOf(actor.org.plan);
    const since = new Date(monthStart());
    const [runCount] = await db
      .select({ n: sql<number>`count(*)` })
      .from(runs)
      .where(and(eq(runs.orgId, actor.org.id), gte(runs.createdAt, since)));
    const [spend] = await db
      .select({
        usd: sql<number>`coalesce(sum(${usageLedger.amountUsd}), 0)`,
        tokens: sql<number>`coalesce(sum(${usageLedger.tokens}), 0)`,
      })
      .from(usageLedger)
      .where(and(eq(usageLedger.orgId, actor.org.id), gte(usageLedger.createdAt, since)));
    return NextResponse.json({
      plan,
      plans: Object.values(PLANS),
      usage: {
        runs: Number(runCount?.n ?? 0),
        runLimit: plan.monthlyRuns,
        amountUsd: Number(spend?.usd ?? 0),
        tokens: Number(spend?.tokens ?? 0),
        creditAllowanceUsd: plan.monthlyCreditsUsd,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
