"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ago } from "@/lib/format";
import { readJson } from "@/lib/http";
import { useSettings } from "@/lib/use-settings";
import { AppHeader } from "./AppHeader";
import { SettingsModal } from "./SettingsModal";
import { toast } from "./Toast";

export interface TemplateMeta {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  cloneCount: number;
  featured: boolean;
  createdAt?: string | number;
}

export function TemplateGallery() {
  const router = useRouter();
  const settings = useSettings();
  const [items, setItems] = useState<TemplateMeta[] | null>(null);
  const [q, setQ] = useState("");
  const [cloning, setCloning] = useState<string | null>(null);

  const load = useCallback(async (query = "") => {
    try {
      const res = await fetch(
        `/api/templates${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      );
      const j = await readJson<{ templates?: TemplateMeta[] }>(res);
      setItems(j.templates ?? []);
    } catch {
      toast("Couldn’t load templates.", "error");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const clone = async (slug: string) => {
    if (cloning) return;
    setCloning(slug);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(slug)}/clone`, {
        method: "POST",
      });
      const j = await readJson<{ graph?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.graph?.id) throw new Error(j.error || "Clone failed");
      router.push(`/w/${j.graph.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t clone template.", "error");
      setCloning(null);
    }
  };

  return (
    <div className="fb-atmosphere relative flex min-h-dvh flex-col">
      <div className="fb-grain" aria-hidden />
      <AppHeader
        active="templates"
        onSettings={() => settings.setShowSettings(true)}
      />
      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              Gallery
            </p>
            <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight text-ink">
              Templates
            </h1>
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-muted">
              Published workbooks anyone can clone. Skills travel with the
              snapshot; uploaded media does not.
            </p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates…"
            className="w-56 rounded-full border border-line bg-card px-4 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line2"
          />
        </div>

        {items === null && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl border border-line bg-card/60"
              />
            ))}
          </div>
        )}

        {items && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line2 bg-card/40 px-6 py-16 text-center">
            <p className="text-[15px] font-medium text-ink">No templates yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Open a workbook and use Publish to share it here.
            </p>
          </div>
        )}

        {items && items.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <li key={t.id}>
                <article className="rounded-2xl border border-line bg-card/80 p-4">
                  <Link href={`/templates/${t.slug}`} className="block">
                    <h2 className="text-[15px] font-medium text-ink">{t.title}</h2>
                    <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-muted">
                      {t.description || "No description."}
                    </p>
                  </Link>
                  {t.tags.length > 0 && (
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                      {t.tags.join(" · ")}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-faint">
                      {t.cloneCount} clones
                      {t.createdAt ? ` · ${ago(t.createdAt)}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => void clone(t.slug)}
                      disabled={!!cloning}
                      className="fb-btn-primary rounded-full px-3 py-1 text-[12px] font-medium disabled:opacity-50"
                    >
                      {cloning === t.slug ? "Cloning…" : "Use"}
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>
      {(settings.showSettings || settings.needsOnboard) && (
        <SettingsModal
          settings={settings.settings}
          env={settings.env}
          onboarding={settings.needsOnboard && !settings.showSettings}
          onSave={settings.persist}
          onClose={settings.dismissOnboard}
        />
      )}
    </div>
  );
}
