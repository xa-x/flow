import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { graphs, templates } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { newId } from "@/lib/ids";
import { isPortable, remapPortable } from "@/lib/portable";
import { materializePortableSkills } from "@/lib/skills";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { slug } = await params;
    const [row] = await db.select().from(templates).where(eq(templates.slug, slug)).limit(1);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!isPortable(row.workbook)) {
      return NextResponse.json({ error: "Template is not a valid workbook" }, { status: 500 });
    }
    await materializePortableSkills(actor.org.id, actor.user.id, row.workbook.skills);
    const doc = remapPortable(row.workbook);
    const id = newId();
    const [graph] = await db
      .insert(graphs)
      .values({
        id,
        orgId: actor.org.id,
        ownerId: actor.user.id,
        title: row.title,
        graph: doc,
      })
      .returning();
    await db
      .update(templates)
      .set({ cloneCount: sql`${templates.cloneCount} + 1` })
      .where(eq(templates.id, row.id));
    return NextResponse.json({ graph }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
