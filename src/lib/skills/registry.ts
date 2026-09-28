import { parseAndResolve, parseSkillMd } from "./format";

const SEARCH_URL = "https://www.skills.sh/api/search";
const RAW = "https://raw.githubusercontent.com";
const TIMEOUT_MS = 8000;

export interface RegistryHit {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
  resolvable: boolean;
}

export interface FetchedSkill {
  raw: string;
  source: string;
  skillId: string;
  path: string;
}

const searchCache = new Map<string, { at: number; hits: RegistryHit[] }>();
const CACHE_MS = 60_000;

export function isGithubSource(source: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(source);
}

function candidatePaths(skillId: string) {
  const id = skillId.replace(/^\/+|\/+$/g, "");
  return [
    `${id}/SKILL.md`,
    `skills/${id}/SKILL.md`,
    `.claude/skills/${id}/SKILL.md`,
    `.cursor/skills/${id}/SKILL.md`,
  ];
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw Object.assign(new Error(`Registry search failed (${res.status})`), {
      status: 502,
    });
  }
  return res.json() as Promise<unknown>;
}

export async function searchRegistry(q: string): Promise<RegistryHit[]> {
  const query = q.trim().slice(0, 80);
  if (query.length < 2) return [];
  const hit = searchCache.get(query);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.hits;
  const raw = await getJson(`${SEARCH_URL}?q=${encodeURIComponent(query)}`);
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as { skills?: unknown }).skills)
      ? ((raw as { skills: unknown[] }).skills)
      : [];
  const hits: RegistryHit[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const skillId = typeof o.skillId === "string" ? o.skillId : typeof o.name === "string" ? o.name : "";
    const source = typeof o.source === "string" ? o.source : "";
    if (!id || !skillId || seen.has(id)) continue;
    seen.add(id);
    hits.push({
      id,
      skillId,
      name: typeof o.name === "string" ? o.name : skillId,
      source,
      installs: typeof o.installs === "number" ? o.installs : 0,
      resolvable: isGithubSource(source),
    });
    if (hits.length >= 24) break;
  }
  searchCache.set(query, { at: Date.now(), hits });
  return hits;
}

export async function fetchSkillMd(
  source: string,
  skillId: string,
): Promise<FetchedSkill> {
  if (!isGithubSource(source)) {
    throw Object.assign(
      new Error(
        `Skill source "${source}" is not a GitHub repo, so Flowbook cannot load its SKILL.md.`,
      ),
      { status: 400 },
    );
  }
  let lastStatus = 0;
  for (const path of candidatePaths(skillId)) {
    const url = `${RAW}/${source}/HEAD/${path}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      lastStatus = res.status;
      if (!res.ok) continue;
      const raw = await res.text();
      if (!raw.trim() || raw.startsWith("404")) continue;
      const parsed = parseSkillMd(raw);
      if (!parsed.body && !parsed.description) continue;
      parseAndResolve(raw);
      return { raw, source, skillId, path };
    } catch {
      /* try next path */
    }
  }
  throw Object.assign(
    new Error(
      lastStatus
        ? `Could not find SKILL.md for ${source}/${skillId} (${lastStatus}).`
        : `Could not load SKILL.md for ${source}/${skillId}.`,
    ),
    { status: 404 },
  );
}
