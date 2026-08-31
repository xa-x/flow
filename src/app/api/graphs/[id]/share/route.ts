import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, shares } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
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
    const rows = await db.select().from(shares).where(eq(shares.graphId, id));
    return NextResponse.json({
      shares: rows.map((s) => ({
        id: s.id,
        permission: s.permission,
        token: s.token,
        url: `/s/${s.token}`,
        expiresAt: s.expiresAt,
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
    const { id } = await params;
    const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!g || g.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    const permission =
      body.permission === "fork" || body.permission === "edit" ? body.permission : "view";
    const token = newToken(18);
    const [row] = await db
      .insert(shares)
      .values({
        id: newId(),
        orgId: actor.org.id,
        graphId: id,
        token,
        permission,
      })
      .returning();
    return NextResponse.json(
      { id: row.id, permission, token, url: `/s/${token}` },
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
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const shareId = req.nextUrl.searchParams.get("shareId");
    const { id } = await params;
    if (!shareId) return NextResponse.json({ error: "shareId required" }, { status: 400 });
    const [s] = await db.select().from(shares).where(eq(shares.id, shareId)).limit(1);
    if (!s || s.orgId !== actor.org.id || s.graphId !== id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    await db.delete(shares).where(eq(shares.id, shareId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
