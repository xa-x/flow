export const BRIEF_CAP = 800;
export const SKILL_BODY_CAP = 80_000;

export interface ParsedSkill {
  name: string;
  description: string;
  displayName?: string;
  body: string;
}

export interface ResolvedSkill {
  slug: string;
  displayName: string;
  description: string;
  instructions: string;
  brief: string;
}

export function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function titleize(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

function unquote(value: string) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/** Minimal YAML frontmatter — scalars, quoted strings, `>` / `|` blocks. */
export function parseYamlish(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = src.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1];
    const rest = m[2];
    if (rest === ">" || rest === "|") {
      const folded = rest === ">";
      i += 1;
      const block: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        const indented = next.startsWith("  ") || next.startsWith("\t");
        if (!indented && next.trim() !== "") break;
        if (next.trim() === "" && block.length === 0) {
          i += 1;
          continue;
        }
        block.push(next.replace(/^( {2}|\t)/, ""));
        i += 1;
      }
      out[key] = folded
        ? block.join(" ").replace(/\s+/g, " ").trim()
        : block.join("\n").trim();
      continue;
    }
    out[key] = unquote(rest);
    i += 1;
  }
  return out;
}

export function parseSkillMd(raw: string): ParsedSkill {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    return { name: "", description: "", body: text.trim() };
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) {
    return { name: "", description: "", body: text.trim() };
  }
  const fm = text.slice(3, end).replace(/^\r?\n/, "");
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const fields = parseYamlish(fm);
  return {
    name: slugify(String(fields.name ?? "")),
    description: String(fields.description ?? "").trim(),
    displayName: fields.displayName
      ? String(fields.displayName).trim()
      : undefined,
    body: body.trim().slice(0, SKILL_BODY_CAP),
  };
}

function extractSection(markdown: string, heading: string) {
  const re = new RegExp(
    `^#{1,3}\\s+${heading}\\s*$`,
    "im",
  );
  const start = markdown.search(re);
  if (start < 0) return "";
  const after = markdown.slice(start);
  const nl = after.indexOf("\n");
  const rest = nl >= 0 ? after.slice(nl + 1) : "";
  const next = rest.search(/^#{1,3}\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

export function resolveSkill(parsed: ParsedSkill): ResolvedSkill {
  const slug = parsed.name || slugify(parsed.displayName ?? "skill");
  const displayName = parsed.displayName || titleize(slug) || "Skill";
  const instructions = (parsed.body || parsed.description).trim();
  const prompting =
    extractSection(parsed.body, "Prompting") ||
    extractSection(parsed.body, "Prompt") ||
    "";
  let brief = [parsed.description, prompting].filter(Boolean).join("\n\n");
  if (!brief) brief = instructions;
  if (brief.length > BRIEF_CAP) {
    brief = `${brief.slice(0, BRIEF_CAP - 1).trimEnd()}…`;
  }
  return {
    slug,
    displayName,
    description: parsed.description,
    instructions,
    brief,
  };
}

export function parseAndResolve(raw: string): ResolvedSkill {
  return resolveSkill(parseSkillMd(raw));
}
