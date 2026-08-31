import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, shares } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = req.nextUrl.searchParams.get("share");
    const [row] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (token) {
      const [share] = await db.select().from(shares).where(eq(shares.token, token)).limit(1);
      if (!share || share.graphId !== id) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      if (share.expiresAt && share.expiresAt < new Date()) {
        return NextResponse.json({ error: "share expired" }, { status: 410 });
      }
      return NextResponse.json({
        graph: row,
        permission: share.permission,
        shared: true,
      });
    }
    const actor = await requireActor(req);
    if (row.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ graph: row, permission: actor.membership.role });
  } catch (e) {
    return fail(e);
  }
}
