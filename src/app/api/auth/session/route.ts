import { NextRequest, NextResponse } from "next/server";
import { attachSession, createSession, ensureActor, publicActor } from "@/lib/auth";
import { loadOrgSettings, publicProviderFlags } from "@/lib/vault";
import { envProviderFlags } from "@/lib/providers";
import { planOf } from "@/lib/billing";
import { ensureJobLoop } from "@/lib/runs/worker";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  ensureJobLoop();
  const actor = await ensureActor(req);
  const token = actor.via === "local" ? await createSession(actor.user.id) : null;
  const vault = await loadOrgSettings(actor.org.id);
  const res = NextResponse.json({
    ...publicActor(actor),
    plan: planOf(actor.org.plan),
    vault: publicProviderFlags(vault),
    envProviders: envProviderFlags(),
  });
  if (token) attachSession(res, token);
  return res;
}
