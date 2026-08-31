import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";

export const runtime = "nodejs";

export async function PUT(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const body = await req.json().catch(() => ({}));
    const theme =
      body.theme === "light" || body.theme === "dark" || body.theme === "system"
        ? body.theme
        : "system";
    await db.update(users).set({ theme }).where(eq(users.id, actor.user.id));
    return NextResponse.json({ theme });
  } catch (e) {
    return fail(e);
  }
}
