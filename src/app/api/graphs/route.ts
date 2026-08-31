import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { graphs, runs, schedules } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { newId } from "@/lib/ids";
import { snapshotWorkbook } from "@/lib/versions";
import { toPortable } from "@/lib/portable";
import { ensureJobLoop } from "@/lib/runs/worker";
import type { GraphDoc } from "@/lib/types";

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

export async function GET(req: NextRequest) {
  try {
    ensureJobLoop();
    const actor = await requireActor(req);
    const rows = await db
      .select()
      .from(graphs)
      .where(eq(graphs.orgId, actor.org.id))
      .orderBy(desc(graphs.updatedAt));
    const ids = rows.map((g) => g.id);
    const lastRuns =
      ids.length === 0
        ? []
        : await db
            .select()
            .from(runs)
            .where(and(eq(runs.orgId, actor.org.id), inArray(runs.graphId, ids)))
            .orderBy(desc(runs.startedAt));
    const latest = new Map<string, (typeof lastRuns)[number]>();
    for (const r of lastRuns) if (!latest.has(r.graphId)) latest.set(r.graphId, r);
    const scheds =
      ids.length === 0
        ? []
        : await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.orgId, actor.org.id), inArray(schedules.graphId, ids)));
    const nextSched = new Map<string, Date | null>();
    for (const s of scheds) {
      if (!s.enabled) continue;
      const cur = nextSched.get(s.graphId);
      if (!cur || (s.nextRunAt && s.nextRunAt < cur)) nextSched.set(s.graphId, s.nextRunAt);
    }
    return NextResponse.json({
      graphs: rows.map((g) => {
        const last = latest.get(g.id);
        return {
          id: g.id,
          title: g.title,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          ...summarize(g.graph),
          lastRun: last
            ? {
                id: last.id,
                status: last.status,
                trigger: last.trigger,
                startedAt: last.startedAt,
                error: last.error,
              }
            : null,
          nextRunAt: nextSched.get(g.id) ?? null,
        };
      }),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const id = newId();
    const [row] = await db
      .insert(graphs)
      .values({
        id,
        orgId: actor.org.id,
        ownerId: actor.user.id,
        title:
          typeof body?.title === "string" && body.title.trim()
            ? body.title.trim().slice(0, 120)
            : "Untitled",
        graph: body?.graph ?? { nodes: [], edges: [] },
      })
      .returning();
    return NextResponse.json({ graph: row }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    if (typeof body?.id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const [cur] = await db.select().from(graphs).where(eq(graphs.id, body.id)).limit(1);
    if (!cur || cur.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
      version: (cur.version ?? 1) + 1,
    };
    for (const k of ACCEPTED_KEYS) if (k in body) patch[k] = body[k];
    if (body.publish) patch.publishedGraph = body.graph ?? cur.graph;
    const [row] = await db
      .update(graphs)
      .set(patch as never)
      .where(eq(graphs.id, body.id))
      .returning();
    return NextResponse.json({ graph: row });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const [cur] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!cur || cur.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    await snapshotWorkbook(actor.org.id, id, cur.graph as GraphDoc, "deleted", actor.user.id);
    await db.delete(graphs).where(eq(graphs.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export { toPortable };
