import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, schedules } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { planOf } from "@/lib/billing";
import { nextCron } from "@/lib/cron";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    const { id } = await params;
    const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!g || g.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const rows = await db.select().from(schedules).where(eq(schedules.graphId, id));
    return NextResponse.json({ schedules: rows });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!planOf(actor.org.plan).schedules) {
      return NextResponse.json({ error: "Schedules are available on Pro and Team." }, { status: 402 });
    }
    const { id } = await params;
    const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!g || g.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    const cronExpr = String(body.cronExpr ?? "").trim();
    const nextRunAt = nextCron(cronExpr);
    await db
      .update(graphs)
      .set({ publishedGraph: g.graph, updatedAt: new Date() })
      .where(eq(graphs.id, id));
    const [row] = await db
      .insert(schedules)
      .values({
        id: newId(),
        orgId: actor.org.id,
        graphId: id,
        cronExpr,
        timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
        enabled: body.enabled === false ? 0 : 1,
        inputs: body.inputs ?? null,
        nextRunAt,
      })
      .returning();
    return NextResponse.json({ schedule: row }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    if (typeof body.id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const [row] = await db.select().from(schedules).where(eq(schedules.id, body.id)).limit(1);
    const { id } = await params;
    if (!row || row.orgId !== actor.org.id || row.graphId !== id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled ? 1 : 0;
    if (typeof body.cronExpr === "string") {
      patch.cronExpr = body.cronExpr;
      patch.nextRunAt = nextCron(body.cronExpr);
    }
    const [updated] = await db
      .update(schedules)
      .set(patch as never)
      .where(eq(schedules.id, row.id))
      .returning();
    return NextResponse.json({ schedule: updated });
  } catch (e) {
    return fail(e);
  }
}
