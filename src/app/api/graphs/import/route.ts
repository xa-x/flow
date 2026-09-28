import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { isPortable, remapPortable } from "@/lib/portable";
import { materializePortableSkills } from "@/lib/skills";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    if (!isPortable(body) && !isPortable(body.workbook)) {
      return NextResponse.json({ error: "flowbook workbook JSON required" }, { status: 400 });
    }
    const pack = isPortable(body) ? body : body.workbook;
    await materializePortableSkills(actor.org.id, actor.user.id, pack.skills);
    const doc = remapPortable(pack);
    const id = newId();
    const [row] = await db
      .insert(graphs)
      .values({
        id,
        orgId: actor.org.id,
        ownerId: actor.user.id,
        title: pack.title || "Imported",
        graph: doc,
      })
      .returning();
    return NextResponse.json({ graph: row }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
