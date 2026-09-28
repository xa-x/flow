import { NextRequest, NextResponse } from "next/server";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { fetchSkillMd, parseAndResolve, upsertSkill } from "@/lib/skills";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const source = typeof body.source === "string" ? body.source : "";
    const skillId = typeof body.skillId === "string" ? body.skillId : "";
    const registryId = typeof body.id === "string" ? body.id : `${source}/${skillId}`;
    const installs = typeof body.installs === "number" ? body.installs : 0;
    if (!source || !skillId) {
      return NextResponse.json({ error: "source and skillId required" }, { status: 400 });
    }
    const fetched = await fetchSkillMd(source, skillId);
    const resolved = parseAndResolve(fetched.raw);
    const skill = await upsertSkill({
      orgId: actor.org.id,
      userId: actor.user.id,
      source: "registry",
      slug: resolved.slug || skillId,
      displayName: resolved.displayName,
      description: resolved.description,
      body: fetched.raw,
      registryId,
      installs,
    });
    return NextResponse.json({ skill }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
