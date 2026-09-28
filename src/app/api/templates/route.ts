import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, templates } from "@/db/schema";
import { fail, requireActor } from "@/lib/auth";
import { canEdit } from "@/lib/tenant";
import { newId } from "@/lib/ids";
import { isPortable, skillIdsIn, stripArtifacts, toPortable } from "@/lib/portable";
import { collectSkillsForDoc } from "@/lib/skills";
import {
  normalizeDescription,
  normalizeTags,
  normalizeTitle,
  publicTemplate,
  templateSlug,
} from "@/lib/templates";
import type { GraphDoc } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
    const tag = (req.nextUrl.searchParams.get("tag") ?? "").trim().toLowerCase();
    const rows = await db
      .select()
      .from(templates)
      .orderBy(desc(templates.featured), desc(templates.cloneCount), desc(templates.createdAt));
    const filtered = rows.filter((row) => {
      const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
      if (tag && !tags.includes(tag)) return false;
      if (!q) return true;
      const hay = `${row.title} ${row.description} ${tags.join(" ")}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    return NextResponse.json({
      templates: filtered.map((row) => publicTemplate(row)),
    });
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
    const graphId = typeof body.graphId === "string" ? body.graphId : "";
    const [g] = graphId
      ? await db.select().from(graphs).where(eq(graphs.id, graphId)).limit(1)
      : [];
    if (!g || g.orgId !== actor.org.id) {
      return NextResponse.json({ error: "Workbook not found" }, { status: 404 });
    }
    const doc = g.graph as GraphDoc;
    const skills = await collectSkillsForDoc(actor.org.id, skillIdsIn(doc));
    const pack = stripArtifacts(
      isPortable(body.workbook)
        ? body.workbook
        : toPortable(doc, { title: g.title, skills }),
    );
    const title = normalizeTitle(body.title ?? g.title);
    const [row] = await db
      .insert(templates)
      .values({
        id: newId(),
        orgId: actor.org.id,
        graphId: g.id,
        slug: templateSlug(title),
        title,
        description: normalizeDescription(body.description),
        tags: normalizeTags(body.tags),
        workbook: pack,
        publishedBy: actor.user.id,
      })
      .returning();
    return NextResponse.json({ template: publicTemplate(row) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
