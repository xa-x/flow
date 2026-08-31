import { NextRequest, NextResponse } from "next/server";
import { attachSession, fail, login } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, user } = await login(String(body.email ?? ""), String(body.password ?? ""));
    const res = NextResponse.json({ userId: user.id, email: user.email });
    return attachSession(res, token);
  } catch (e) {
    return fail(e);
  }
}
