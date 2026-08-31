import { NextRequest, NextResponse } from "next/server";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { loadOrgSettings, publicProviderFlags, saveOrgCredential } from "@/lib/vault";
import { envProviderFlags } from "@/lib/providers";
import type { ProviderConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const settings = await loadOrgSettings(actor.org.id);
    return NextResponse.json({
      vault: publicProviderFlags(settings),
      envProviders: envProviderFlags(),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const providers = (body.providers ?? {}) as Record<string, ProviderConfig>;
    for (const [id, cfg] of Object.entries(providers)) {
      if (!cfg || typeof cfg !== "object") continue;
      if (!cfg.apiKey && !cfg.baseUrl) continue;
      await saveOrgCredential(actor.org.id, id, {
        apiKey: typeof cfg.apiKey === "string" ? cfg.apiKey : "",
        baseUrl: typeof cfg.baseUrl === "string" ? cfg.baseUrl : "",
      });
    }
    const settings = await loadOrgSettings(actor.org.id);
    return NextResponse.json({ vault: publicProviderFlags(settings) });
  } catch (e) {
    return fail(e);
  }
}
