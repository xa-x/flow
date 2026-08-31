import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { listVersions, restoreVersion, snapshotWorkbook } from "@/lib/versions";
import { planOf } from "@/lib/billing";
import type { GraphDoc } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    const { id } = await params;
    const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!g || g.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ versions: await listVersions(id) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!planOf(actor.org.plan).versions) {
      return NextResponse.json({ error: "Versions are available on Pro and Team." }, { status: 402 });
    }
    const { id } = await params;
    const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
    if (!g || g.orgId !== actor.org.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    if (typeof body.restore === "string") {
      const graph = await restoreVersion(actor.org.id, id, body.restore);
      if (!graph) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ graph });
    }
    const versionId = await snapshotWorkbook(
      actor.org.id,
      id,
      g.graph as GraphDoc,
      typeof body.label === "string" ? body.label : "manual",
      actor.user.id,
    );
    return NextResponse.json({ id: versionId }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
