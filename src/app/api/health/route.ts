import { NextResponse } from "next/server";
import { ensureJobLoop } from "@/lib/runs/worker";

export const dynamic = "force-dynamic";

/** Health check for the background-process watchdog. */
export async function GET() {
  ensureJobLoop();
  return NextResponse.json({ ok: true, app: "flowbook" });
}
