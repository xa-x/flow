import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { skills, type SkillRow } from "@/db/schema";
import { newId } from "../ids";
import { builtinBySlug, builtinMdBySlug, BUILTIN_SKILLS } from "./builtin";
import {
  parseAndResolve,
  parseSkillMd,
  resolveSkill,
  slugify,
  type ResolvedSkill,
} from "./format";

export type SkillSource = "builtin" | "registry" | "local";

export interface SkillSummary {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  source: SkillSource;
  registryId?: string | null;
  installs?: number;
  brief: string;
}

export interface SkillRecord extends SkillSummary {
  body: string;
  instructions: string;
}

function asRecord(row: SkillRow): SkillRecord {
  const resolved = resolveSkill({
    name: row.slug,
    description: row.description,
    displayName: row.displayName,
    body: row.body,
  });
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    source: (row.source as SkillSource) || "local",
    registryId: row.registryId,
    installs: row.installs,
    brief: resolved.brief,
    body: row.body,
    instructions: resolved.instructions,
  };
}

function builtinRecord(resolved: ResolvedSkill): SkillRecord {
  const md = builtinMdBySlug(resolved.slug) ?? resolved.instructions;
  return {
    id: `builtin:${resolved.slug}`,
    slug: resolved.slug,
    displayName: resolved.displayName,
    description: resolved.description,
    source: "builtin",
    registryId: null,
    installs: 0,
    brief: resolved.brief,
    body: md,
    instructions: resolved.instructions,
  };
}

export function summarizeSkill(skill: SkillRecord): SkillSummary {
  const { body: _b, instructions: _i, ...rest } = skill;
  return rest;
}

export async function listSkills(orgId: string): Promise<SkillSummary[]> {
  const rows = orgId
    ? await db.select().from(skills).where(eq(skills.orgId, orgId))
    : [];
  const seen = new Set<string>();
  const out: SkillSummary[] = [];
  for (const row of rows) {
    seen.add(row.slug);
    out.push(summarizeSkill(asRecord(row)));
  }
  for (const b of BUILTIN_SKILLS) {
    if (seen.has(b.slug)) continue;
    out.push(summarizeSkill(builtinRecord(b)));
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getSkill(
  orgId: string,
  skillId: string,
): Promise<SkillRecord | null> {
  if (!skillId) return null;
  const key = skillId.startsWith("builtin:") ? skillId.slice(8) : skillId;
  if (orgId) {
    const rows = await db.select().from(skills).where(eq(skills.orgId, orgId));
    const hit = rows.find(
      (r) => r.id === skillId || r.slug === key || r.registryId === skillId,
    );
    if (hit) return asRecord(hit);
  }
  const builtin = builtinBySlug(key);
  return builtin ? builtinRecord(builtin) : null;
}

export async function createLocalSkill(
  orgId: string,
  userId: string,
  input: { name?: string; displayName?: string; description?: string; body: string },
) {
  if (!input.body.trim() && !input.name) {
    throw Object.assign(new Error("Skill body required"), { status: 400 });
  }
  const parsed = parseSkillMd(
    input.body.includes("---")
      ? input.body
      : `---\nname: ${input.name ?? "custom-skill"}\ndescription: ${input.description ?? ""}\n---\n\n${input.body}`,
  );
  const resolved = resolveSkill({
    ...parsed,
    name: slugify(input.name || parsed.name || "custom-skill"),
    displayName: input.displayName || parsed.displayName,
    description: input.description ?? parsed.description,
  });
  return upsertSkill({
    orgId,
    userId,
    source: "local",
    slug: resolved.slug,
    displayName: resolved.displayName,
    description: resolved.description,
    body: parsed.body || input.body,
  });
}

export async function upsertSkill(input: {
  orgId: string;
  userId?: string;
  source: SkillSource;
  slug: string;
  displayName: string;
  description: string;
  body: string;
  registryId?: string | null;
  installs?: number;
}): Promise<SkillRecord> {
  const slug = slugify(input.slug);
  if (!slug) throw Object.assign(new Error("Skill name required"), { status: 400 });
  const [existing] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.orgId, input.orgId), eq(skills.slug, slug)))
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(skills)
      .set({
        source: input.source,
        registryId: input.registryId ?? existing.registryId,
        displayName: input.displayName,
        description: input.description,
        body: input.body,
        installs: input.installs ?? existing.installs,
        updatedAt: new Date(),
      })
      .where(eq(skills.id, existing.id))
      .returning();
    return asRecord(row);
  }
  const [row] = await db
    .insert(skills)
    .values({
      id: newId(),
      orgId: input.orgId,
      source: input.source,
      registryId: input.registryId ?? null,
      slug,
      displayName: input.displayName,
      description: input.description,
      body: input.body,
      installs: input.installs ?? 0,
      createdBy: input.userId,
    })
    .returning();
  return asRecord(row);
}

export async function deleteSkill(orgId: string, id: string) {
  const [row] = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
  if (!row || row.orgId !== orgId) {
    throw Object.assign(new Error("Skill not found"), { status: 404 });
  }
  if (row.source === "builtin") {
    throw Object.assign(new Error("Cannot delete a bundled skill"), { status: 400 });
  }
  await db.delete(skills).where(eq(skills.id, id));
}

export async function collectSkillsForDoc(
  orgId: string,
  skillIds: string[],
): Promise<
  { slug: string; displayName: string; description: string; body: string }[]
> {
  const unique = [...new Set(skillIds.filter(Boolean))];
  const out: { slug: string; displayName: string; description: string; body: string }[] =
    [];
  const seen = new Set<string>();
  for (const id of unique) {
    const skill = await getSkill(orgId, id);
    if (!skill || seen.has(skill.slug)) continue;
    seen.add(skill.slug);
    out.push({
      slug: skill.slug,
      displayName: skill.displayName,
      description: skill.description,
      body: skill.body,
    });
  }
  return out;
}

export async function materializePortableSkills(
  orgId: string,
  userId: string,
  incoming:
    | { slug: string; displayName: string; description: string; body: string }[]
    | undefined,
) {
  if (!incoming?.length) return;
  for (const skill of incoming) {
    if (builtinBySlug(skill.slug)) continue;
    const resolved = parseAndResolve(
      skill.body.includes("---")
        ? skill.body
        : `---\nname: ${skill.slug}\ndescription: ${skill.description}\n---\n\n${skill.body}`,
    );
    await upsertSkill({
      orgId,
      userId,
      source: "local",
      slug: skill.slug || resolved.slug,
      displayName: skill.displayName || resolved.displayName,
      description: skill.description || resolved.description,
      body: skill.body || resolved.instructions,
    });
  }
}
