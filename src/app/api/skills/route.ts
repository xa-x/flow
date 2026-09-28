import { NextRequest, NextResponse } from "next/server";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import {
  createLocalSkill,
  deleteSkill,
  getSkill,
  listSkills,
} from "@/lib/skills";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const skill = await getSkill(actor.org.id, id);
      if (!skill) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ skill });
    }
    const skills = await listSkills(actor.org.id);
    return NextResponse.json({ skills });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const skill = await createLocalSkill(actor.org.id, actor.user.id, {
      name: typeof body.name === "string" ? body.name : undefined,
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      body: typeof body.body === "string" ? body.body : "",
    });
    return NextResponse.json({ skill }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!canEdit(actor.membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await deleteSkill(actor.org.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
