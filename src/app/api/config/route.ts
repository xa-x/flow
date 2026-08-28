import { NextResponse } from "next/server";
import { envProviderFlags } from "@/lib/providers";

export const runtime = "nodejs";

/** GET /api/config — which providers have server-side .env credentials. */
export async function GET() {
  return NextResponse.json({ envProviders: envProviderFlags() });
}
