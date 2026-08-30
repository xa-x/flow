import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { newId } from "@/lib/artifacts";

export const runtime = "nodejs";

const ACCEPTED_KEYS = ["title", "graph"] as const;

type GraphDocLite = {
  nodes?: { data?: { kind?: string } }[];
  edges?: unknown[];
};

function summarize(graph: unknown) {
  const doc = (graph ?? {}) as GraphDocLite;
  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc.edges) ? doc.edges : [];
  const kinds = [
    ...new Set(
      nodes
        .map((n) => n?.data?.kind)
        .filter((k): k is string => typeof k === "string" && !!k),
    ),
  ];
  return { nodeCount: nodes.length, edgeCount: edges.length, kinds };
}

export async function GET() {
  try {
    const rows = await db.select().from(graphs).orderBy(desc(graphs.updatedAt));
    return NextResponse.json({
      graphs: rows.map((g) => ({
        id: g.id,
        title: g.title,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        ...summarize(g.graph),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list workbooks" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create workbook" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
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
