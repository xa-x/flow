import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { templates } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { publicTemplate } from "@/lib/templates";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const [row] = await db.select().from(templates).where(eq(templates.slug, slug)).limit(1);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      template: {
        ...publicTemplate(row),
        workbook: row.workbook,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const actor = await requireActor(req);
    const { slug } = await params;
    const [row] = await db.select().from(templates).where(eq(templates.slug, slug)).limit(1);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (row.orgId !== actor.org.id || !canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db.delete(templates).where(eq(templates.id, row.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
