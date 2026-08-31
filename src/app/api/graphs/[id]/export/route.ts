import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { toPortable } from "@/lib/portable";
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
    return NextResponse.json(toPortable(g.graph as GraphDoc, { title: g.title }));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return GET(req, { params });
}
