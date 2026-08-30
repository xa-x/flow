import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ graph: row });
}
