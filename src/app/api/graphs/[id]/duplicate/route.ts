import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { newId } from "@/lib/ids";
import { toPortable } from "@/lib/portable";
import type { GraphDoc } from "@/lib/types";

export const runtime = "nodejs";

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
    const portable = toPortable(g.graph as GraphDoc, { title: g.title });
    const next = newId();
    const [row] = await db
      .insert(graphs)
      .values({
        id: next,
        orgId: actor.org.id,
        ownerId: actor.user.id,
        title: `${g.title || "Untitled"} copy`,
        graph: { nodes: portable.nodes, edges: portable.edges },
      })
      .returning();
    return NextResponse.json({ graph: row }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
