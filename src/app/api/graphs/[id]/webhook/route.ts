import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, webhookEndpoints } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { planOf } from "@/lib/billing";
import { newId, newToken } from "@/lib/ids";

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
    const rows = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.graphId, id));
    return NextResponse.json({
      webhooks: rows.map((w) => ({
        id: w.id,
        token: w.token,
        secret: w.secret,
        url: `/api/webhooks/${w.token}`,
        enabled: !!w.enabled,
      })),
    });
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
    if (!planOf(actor.org.plan).webhooks) {
      return NextResponse.json({ error: "Webhooks are available on Pro and Team." }, { status: 402 });
    }
    const { id } = await params;
    const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!g || g.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const token = newToken(16);
    const secret = newToken(20);
    await db
      .update(graphs)
      .set({ publishedGraph: g.graph, updatedAt: new Date() })
      .where(eq(graphs.id, id));
    const [row] = await db
      .insert(webhookEndpoints)
      .values({
        id: newId(),
        orgId: actor.org.id,
        graphId: id,
        token,
        secret,
      })
      .returning();
    return NextResponse.json(
      { id: row.id, token, secret, url: `/api/webhooks/${token}` },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    const hookId = req.nextUrl.searchParams.get("id");
    const { id } = await params;
    if (!hookId) return NextResponse.json({ error: "id required" }, { status: 400 });
    const [row] = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, hookId))
      .limit(1);
    if (!row || row.orgId !== actor.org.id || row.graphId !== id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, hookId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
