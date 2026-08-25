import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Health check for the background-process watchdog. */
export async function GET() {
  return NextResponse.json({ ok: true, app: "flowbook" });
}
