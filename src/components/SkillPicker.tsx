"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readJson } from "@/lib/http";
import { toast } from "./Toast";

export interface SkillChoice {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  source?: string;
  registryId?: string | null;
  brief?: string;
  instructions?: string;
  body?: string;
  resolvable?: boolean;
  installs?: number;
  skillId?: string;
  name?: string;
}

function sourceLabel(source?: string) {
  if (source === "builtin") return "Bundled";
  if (source === "registry") return "Installed";
  if (source === "local") return "Yours";
  return "skills.sh";
}

export function SkillPicker({
  value,
  onPick,
  compact,
  draft,
}: {
  value?: string;
  onPick: (skill: SkillChoice | null) => void;
  compact?: boolean;
  /** Prefill "New skill" from the current node text. */
  draft?: { displayName?: string; body?: string };
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [installed, setInstalled] = useState<SkillChoice[]>([]);
  const [remote, setRemote] = useState<SkillChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const startCreate = () => {
    setCreating(true);
    setOpen(true);
    setName(draft?.displayName && draft.displayName !== "Skill" ? draft.displayName : "");
    setDescription("");
    setBody(draft?.body ?? "");
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/skills")
      .then((r) => readJson<{ skills?: SkillChoice[] }>(r))
      .then((j) => {
        if (alive) setInstalled(j.skills ?? []);
      })
      .catch(() => {
        if (alive) setInstalled([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setRemote([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/skills/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => readJson<{ skills?: SkillChoice[] }>(r))
        .then((j) =>
          setRemote(
            (j.skills ?? []).map((s) => ({
              ...s,
              slug: s.skillId || s.slug,
              displayName: s.name || s.displayName || s.skillId || s.slug,
              description: s.description ?? "",
            })),
          ),
        )
        .catch(() => setRemote([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = useMemo(
    () =>
      installed.find((s) => s.slug === value || s.id === value) ?? null,
    [installed, value],
  );

  const localHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return installed;
    return installed.filter(
      (s) =>
        s.displayName.toLowerCase().includes(needle) ||
        s.slug.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle),
    );
  }, [installed, q]);

  const pickInstalled = async (s: SkillChoice) => {
    try {
      const res = await fetch(`/api/skills?id=${encodeURIComponent(s.id)}`);
      const j = await readJson<{ skill?: SkillChoice }>(res);
      onPick(j.skill ?? s);
      setOpen(false);
      setQ("");
    } catch {
      onPick(s);
      setOpen(false);
    }
  };

  const installRemote = async (s: SkillChoice) => {
    if (s.resolvable === false) {
      toast("That skill isn’t hosted on GitHub, so it can’t be installed.", "error");
      return;
    }
    try {
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: s.id,
          skillId: s.slug || s.id.split("/").pop(),
          source: s.source,
          installs: s.installs,
        }),
      });
      const j = await readJson<{ skill?: SkillChoice; error?: string }>(res);
      if (!res.ok || !j.skill) throw new Error(j.error || "Install failed");
      setInstalled((xs) => {
        const next = xs.filter((x) => x.slug !== j.skill!.slug);
        return [...next, j.skill!];
      });
      onPick(j.skill);
      setOpen(false);
      setQ("");
      toast(`Installed ${j.skill.displayName}.`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Install failed", "error");
    }
  };

  const saveLocal = async () => {
    if (saving) return;
    if (!body.trim() && !name.trim()) {
      toast("Give the skill a name or some instructions.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim() || undefined,
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          body: body.trim(),
        }),
      });
      const j = await readJson<{ skill?: SkillChoice; error?: string }>(res);
      if (!res.ok || !j.skill) throw new Error(j.error || "Save failed");
      setInstalled((xs) => {
        const next = xs.filter((x) => x.slug !== j.skill!.slug);
        return [...next, j.skill!];
      });
      onPick(j.skill);
      setCreating(false);
      setOpen(false);
      setQ("");
      toast(`Saved “${j.skill.displayName}”. Pick it on any node.`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={box} className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nodrag flex w-full items-center justify-between gap-2 rounded-md border border-line bg-sunken px-2 py-1.5 text-left text-[11px] text-muted outline-none transition-colors hover:border-line2 focus:border-line2"
      >
        <span className={`truncate ${selected ? "text-ink/85" : ""}`}>
          {selected
            ? selected.displayName
            : compact
              ? "Skill · none"
              : "Pick a skill…"}
        </span>
        <span className="flex items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onPick(null);
              }}
              className="rounded px-1 text-[10px] text-faint hover:bg-white/5 hover:text-ink"
            >
              ×
            </span>
          )}
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
            <path
              d="M1 2.5 4 5.5 7 2.5"
              stroke="currentColor"
              strokeWidth="1.3"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      {open && creating && (
        <div className="fb-pop nodrag nowheel absolute left-0 right-0 z-40 mt-1 rounded-lg border border-line2 bg-card p-2 shadow-xl">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
            New skill
          </p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name — cinematic product"
            className="mb-1 w-full rounded-md border border-line bg-sunken px-2 py-1 text-[11px] text-ink outline-none placeholder:text-faint"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When to use this skill"
            className="mb-1 w-full rounded-md border border-line bg-sunken px-2 py-1 text-[11px] text-ink outline-none placeholder:text-faint"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Instructions the model should follow…"
            className="nowheel mb-2 w-full resize-y rounded-md border border-line bg-sunken px-2 py-1 text-[11px] leading-relaxed text-ink outline-none placeholder:text-faint"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded px-2 py-1 text-[10px] text-faint hover:text-ink"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void saveLocal()}
              disabled={saving}
              className="rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-canvas disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save to library"}
            </button>
          </div>
        </div>
      )}
      {open && !creating && (
        <div className="fb-pop nodrag nowheel absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto rounded-lg border border-line2 bg-card shadow-xl">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search installed or skills.sh…"
            className="sticky top-0 w-full border-b border-line bg-sunken px-2 py-1.5 text-[11px] text-ink outline-none placeholder:text-faint"
          />
          {localHits.length > 0 && (
            <ul className="py-1">
              {localHits.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => void pickInstalled(s)}
                    className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-white/[0.04]"
                  >
                    <span className="text-[11px] text-ink/90">{s.displayName}</span>
                    <span className="line-clamp-2 text-[10px] text-faint">
                      {sourceLabel(s.source)} · {s.description || s.slug}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(q.trim().length >= 2 || loading) && (
            <div className="border-t border-line py-1">
              <p className="px-2 pb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                {loading ? "Searching skills.sh…" : "skills.sh"}
              </p>
              {remote
                .filter((s) => !installed.some((i) => i.slug === s.slug || i.registryId === s.id))
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void installRemote(s)}
                    className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-white/[0.04]"
                  >
                    <span className="text-[11px] text-ink/90">{s.displayName || s.slug}</span>
                    <span className="line-clamp-2 text-[10px] text-faint">
                      {s.resolvable === false ? "Hosted elsewhere · " : "Install · "}
                      {s.source}
                    </span>
                  </button>
                ))}
              {!loading && q.trim().length >= 2 && remote.length === 0 && (
                <p className="px-2 py-1.5 text-[10px] text-faint">No registry matches.</p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={startCreate}
            className="sticky bottom-0 w-full border-t border-line bg-card px-2 py-1.5 text-left text-[11px] text-ink/90 hover:bg-white/[0.04]"
          >
            + New skill
          </button>
        </div>
      )}
    </div>
  );
}
