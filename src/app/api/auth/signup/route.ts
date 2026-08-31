import { NextRequest, NextResponse } from "next/server";
import { attachSession, fail, signup } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, userId, orgId } = await signup(
      String(body.email ?? ""),
      String(body.password ?? ""),
      typeof body.name === "string" ? body.name : undefined,
    );
    const res = NextResponse.json({ userId, orgId }, { status: 201 });
    return attachSession(res, token);
  } catch (e) {
    return fail(e);
  }
}
