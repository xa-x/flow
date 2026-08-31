import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { runNodes, runs } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    const { id } = await params;
    const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!run || run.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const nodes = await db.select().from(runNodes).where(eq(runNodes.runId, id));
    return NextResponse.json({ run, nodes });
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
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!run || run.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (body.status === "cancelled" || body.cancel) {
      await db
        .update(runs)
        .set({
          cancelRequested: 1,
          status: run.status === "queued" ? "cancelled" : run.status,
        })
        .where(eq(runs.id, id));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unsupported patch" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
