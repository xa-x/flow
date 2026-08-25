import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { newId } from "@/lib/artifacts";

const ACCEPTED_KEYS = ["title", "graph"] as const;

export async function GET() {
  const rows = await db.select().from(graphs).orderBy(desc(graphs.updatedAt));
  return NextResponse.json({ graphs: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = newId();
  const [row] = await db
    .insert(graphs)
    .values({
      id,
      title:
        typeof body?.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 120)
          : "Untitled",
      graph: body?.graph ?? { nodes: [], edges: [] },
    })
    .returning();
  return NextResponse.json({ graph: row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ACCEPTED_KEYS) if (k in body) patch[k] = body[k];
  const [row] = await db
    .update(graphs)
    .set(patch as never)
    .where(eq(graphs.id, body.id))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ graph: row });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(graphs).where(eq(graphs.id, id));
  return NextResponse.json({ ok: true });
}
