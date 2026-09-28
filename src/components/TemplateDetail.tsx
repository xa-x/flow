"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NODE_TYPES } from "@/lib/nodes";
import { readJson } from "@/lib/http";
import { useSettings } from "@/lib/use-settings";
import { AppHeader } from "./AppHeader";
import { SettingsModal } from "./SettingsModal";
import { toast } from "./Toast";
import type { TemplateMeta } from "./TemplateGallery";
import type { PortableWorkbook } from "@/lib/portable";

export function TemplateDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const settings = useSettings();
  const [item, setItem] = useState<
    (TemplateMeta & { workbook?: PortableWorkbook }) | null | undefined
  >(undefined);
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/templates/${encodeURIComponent(slug)}`)
      .then((r) =>
        readJson<{
          template?: TemplateMeta & { workbook?: PortableWorkbook };
        }>(r),
      )
      .then((j) => {
        if (alive) setItem(j.template ?? null);
      })
      .catch(() => {
        if (alive) setItem(null);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  const clone = async () => {
    if (cloning || !item) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(slug)}/clone`, {
        method: "POST",
      });
      const j = await readJson<{ graph?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.graph?.id) throw new Error(j.error || "Clone failed");
      router.push(`/w/${j.graph.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t clone template.", "error");
      setCloning(false);
    }
  };

  const kinds = (item?.workbook?.nodes ?? []).map((n) => n.data.kind);
  const unique = [...new Set(kinds)];

  return (
    <div className="fb-atmosphere relative flex min-h-dvh flex-col">
      <div className="fb-grain" aria-hidden />
      <AppHeader
        active="templates"
        onSettings={() => settings.setShowSettings(true)}
      />
      <main className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        {item === undefined && (
          <div className="h-48 animate-pulse rounded-2xl border border-line bg-card/60" />
        )}
        {item === null && (
          <div className="rounded-2xl border border-dashed border-line2 px-6 py-16 text-center">
            <p className="text-[15px] font-medium text-ink">Template not found</p>
            <Link href="/templates" className="mt-3 inline-block text-[13px] text-muted">
              Back to gallery
            </Link>
          </div>
        )}
        {item && (
          <>
            <Link
              href="/templates"
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint hover:text-ink"
            >
              Templates
            </Link>
            <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-ink">
              {item.title}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {item.description || "No description."}
            </p>
            {item.tags.length > 0 && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                {item.tags.join(" · ")}
              </p>
            )}
            <p className="mt-4 text-[12px] text-faint">
              {item.cloneCount} clones
              {unique.length
                ? ` · ${unique
                    .map((k) => NODE_TYPES.find((d) => d.type === k)?.label ?? k)
                    .join(", ")}`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => void clone()}
              disabled={cloning}
              className="fb-btn-primary mt-6 rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50"
            >
              {cloning ? "Cloning…" : "Use this template"}
            </button>
          </>
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
