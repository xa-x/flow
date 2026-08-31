import { NextRequest, NextResponse } from "next/server";
import { envProviderFlags } from "@/lib/providers";
import { ensureActor } from "@/lib/auth";
import { loadOrgSettings, publicProviderFlags } from "@/lib/vault";
import { planOf } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await ensureActor(req);
  const vault = await loadOrgSettings(actor.org.id);
  return NextResponse.json({
    envProviders: envProviderFlags(),
    vault: publicProviderFlags(vault),
    plan: planOf(actor.org.plan),
    theme: actor.user.theme,
  });
}
