import { NextRequest, NextResponse } from "next/server";
import { fail, requireActor } from "@/lib/auth";
import { searchRegistry } from "@/lib/skills";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireActor(req);
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const skills = await searchRegistry(q);
    return NextResponse.json({ skills });
  } catch (e) {
    return fail(e);
  }
}
