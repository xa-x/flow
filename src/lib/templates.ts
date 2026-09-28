import { slugify } from "./skills/format";
import { newId } from "./ids";

export const TITLE_CAP = 80;
export const DESC_CAP = 280;
export const TAG_CAP = 24;
export const TAG_LIMIT = 8;

export function normalizeTitle(raw: unknown) {
  const title = typeof raw === "string" ? raw.trim().slice(0, TITLE_CAP) : "";
  return title || "Untitled template";
}

export function normalizeDescription(raw: unknown) {
  return typeof raw === "string" ? raw.trim().slice(0, DESC_CAP) : "";
}

export function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const tag = String(item).trim().toLowerCase().slice(0, TAG_CAP);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= TAG_LIMIT) break;
  }
  return out;
}

export function templateSlug(title: string) {
  const base = slugify(title) || "template";
  return `${base}-${newId(6)}`;
}

export function publicTemplate(row: {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: unknown;
  cloneCount: number;
  featured: number;
  publishedBy?: string | null;
  createdAt: Date | number;
  updatedAt?: Date | number;
  workbook?: unknown;
}) {
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === "string")
    : [];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    tags,
    cloneCount: row.cloneCount,
    featured: row.featured === 1,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}
