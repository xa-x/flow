import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, shares } from "@/db/schema";
import { toPortable } from "@/lib/portable";
import { newId } from "@/lib/ids";
import { requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import type { GraphDoc } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const [share] = await db.select().from(shares).where(eq(shares.token, token)).limit(1);
  if (!share) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: "share expired" }, { status: 410 });
  }
  const [graph] = await db.select().from(graphs).where(eq(graphs.id, share.graphId)).limit(1);
  if (!graph) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    graphId: graph.id,
    title: graph.title,
    permission: share.permission,
    graph: graph.graph,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const [share] = await db.select().from(shares).where(eq(shares.token, token)).limit(1);
  if (!share || (share.permission !== "fork" && share.permission !== "edit")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const actor = await requireActor(req);
  if (!canEdit(actor.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [graph] = await db.select().from(graphs).where(eq(graphs.id, share.graphId)).limit(1);
  if (!graph) return NextResponse.json({ error: "not found" }, { status: 404 });
  const portable = toPortable(graph.graph as GraphDoc, { title: graph.title });
  const id = newId();
  const [row] = await db
    .insert(graphs)
    .values({
      id,
      orgId: actor.org.id,
      ownerId: actor.user.id,
      title: `${graph.title || "Untitled"} copy`,
      graph: { nodes: portable.nodes, edges: portable.edges },
    })
    .returning();
  return NextResponse.json({ graph: row }, { status: 201 });
}
