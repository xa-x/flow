import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canAdmin } from "@/lib/tenant";
import { hashToken } from "@/lib/crypto";
import { newId, newToken } from "@/lib/ids";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.orgId, actor.org.id));
    return NextResponse.json({
      keys: rows.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canAdmin(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const raw = `fb_${newToken(24)}`;
    const [row] = await db
      .insert(apiKeys)
      .values({
        id: newId(),
        orgId: actor.org.id,
        userId: actor.user.id,
        name: typeof body.name === "string" ? body.name : "API key",
        tokenHash: hashToken(raw),
        prefix: raw.slice(0, 10),
        scopes: typeof body.scopes === "string" ? body.scopes : "run,read,mcp",
      })
      .returning();
    return NextResponse.json({ id: row.id, token: raw, prefix: row.prefix }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canAdmin(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    if (!row || row.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
