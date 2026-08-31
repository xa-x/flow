"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NODE_TYPES } from "@/lib/nodes";
import { ago } from "@/lib/format";
import { emptyGraph, starterGraph } from "@/lib/starter";
import { useSettings } from "@/lib/use-settings";
import { toast } from "./Toast";
import { readJson } from "@/lib/http";
import { AppHeader } from "./AppHeader";
import { SettingsModal } from "./SettingsModal";

export interface BookMeta {
  id: string;
  title: string;
  updatedAt?: string | number;
  createdAt?: string | number;
  nodeCount?: number;
  edgeCount?: number;
  kinds?: string[];
  lastRun?: {
    id: string;
    status: string;
    trigger: string;
    startedAt?: string | number;
    error?: string | null;
  } | null;
  nextRunAt?: string | number | null;
}

export function HomeGallery() {
  const router = useRouter();
  const settings = useSettings();
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [creating, setCreating] = useState<"blank" | "ai" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/graphs");
      const j = await readJson<{ graphs?: BookMeta[] }>(res);
      setBooks(Array.isArray(j?.graphs) ? j.graphs : []);
    } catch {
      toast("Couldn’t load workbooks.", "error");
      setBooks([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const create = async (mode: "blank" | "ai" = "blank") => {
    if (creating) return;
    setCreating(mode);
    try {
      const res = await fetch("/api/graphs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: mode === "ai" ? "New flow" : "Untitled",
          graph: mode === "ai" ? emptyGraph() : starterGraph(),
        }),
      });
      const j = await readJson<{ graph?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.graph?.id) throw new Error(j.error || "Create failed");
      router.push(mode === "ai" ? `/w/${j.graph.id}?assistant=1` : `/w/${j.graph.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t create workbook.", "error");
      setCreating(null);
    }
  };

  const rename = async (id: string, title: string) => {
    try {
      const res = await fetch("/api/graphs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, title }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setBooks((xs) =>
        (xs ?? []).map((b) => (b.id === id ? { ...b, title } : b)),
      );
    } catch {
      toast("Couldn’t rename workbook.", "error");
    }
  };

  const duplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/graphs/${id}/duplicate`, { method: "POST" });
      const j = await readJson<{ graph?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.graph?.id) throw new Error(j.error || "Duplicate failed");
      router.push(`/w/${j.graph.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t duplicate.", "error");
    }
  };

  const importFile = async (file: File) => {
    try {
      const pack = JSON.parse(await file.text());
      const res = await fetch("/api/graphs/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pack),
      });
      const j = await readJson<{ graph?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.graph?.id) throw new Error(j.error || "Import failed");
      router.push(`/w/${j.graph.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t import workbook.", "error");
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/graphs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setBooks((xs) => (xs ?? []).filter((b) => b.id !== id));
      toast("Workbook deleted.", "ok");
    } catch {
      toast("Couldn’t delete workbook.", "error");
    }
  };

  return (
    <div className="fb-atmosphere relative flex min-h-dvh flex-col">
      <div className="fb-grain" aria-hidden />
      <AppHeader
        active="home"
        onSettings={() => settings.setShowSettings(true)}
      />

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              Library
            </p>
            <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight text-ink">
              Workbooks
            </h1>
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-muted">
              Node pipelines for text, image, audio, and video. Build by hand
              or describe the flow to the assistant.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="rounded-full border border-line bg-card px-4 py-2 text-[13px] font-medium text-ink transition-all hover:border-line2">
              Import
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => create("ai")}
              disabled={!!creating}
              className="rounded-full border border-line bg-card px-4 py-2 text-[13px] font-medium text-ink transition-all hover:border-line2 hover:bg-white/[0.04] disabled:opacity-50"
            >
              {creating === "ai" ? "Creating…" : "Create with AI"}
            </button>
            <button
              onClick={() => create("blank")}
              disabled={!!creating}
              className="fb-btn-primary rounded-full px-4 py-2 text-[13px] font-medium transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {creating === "blank" ? "Creating…" : "New workbook"}
            </button>
          </div>
        </div>

        {books === null && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl border border-line bg-card/60"
              />
            ))}
          </div>
        )}

        {books && books.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line2 bg-card/40 px-6 py-16 text-center">
            <p className="text-[15px] font-medium text-ink">Nothing here yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Create a workbook to get a starter pipeline on the canvas.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => create("ai")}
                disabled={!!creating}
                className="rounded-full border border-line bg-card px-4 py-2 text-[13px] font-medium text-ink transition-all hover:border-line2 disabled:opacity-50"
              >
                {creating === "ai" ? "Creating…" : "Create with AI"}
              </button>
              <button
                onClick={() => create("blank")}
                disabled={!!creating}
                className="fb-btn-primary rounded-full px-4 py-2 text-[13px] font-medium transition-all hover:brightness-110 disabled:opacity-50"
              >
                {creating === "blank" ? "Creating…" : "New workbook"}
              </button>
            </div>
          </div>
        )}

        {books && books.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <li key={b.id}>
                <BookCard
                  book={b}
                  onRename={rename}
                  onDelete={remove}
                  onDuplicate={duplicate}
                />
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

function statusTone(status?: string) {
  if (status === "done" || status === "succeeded") return "bg-ok";
  if (status === "error" || status === "failed") return "bg-err";
  if (status === "running" || status === "queued") return "bg-live";
  return "bg-faint";
}

function BookCard({
  book,
  onRename,
  onDelete,
  onDuplicate,
}: {
  book: BookMeta;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(book.title);
  const [confirm, setConfirm] = useState(false);

  const commit = () => {
    setEditing(false);
    const next = draft.trim().slice(0, 120) || "Untitled";
    setDraft(next);
    if (next !== book.title) onRename(book.id, next);
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-card/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-line2">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/10 blur-2xl transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(book.title);
                  setEditing(false);
                }
              }}
              className="w-full rounded-md border border-line2 bg-sunken px-2 py-1 text-[14px] font-medium text-ink outline-none"
            />
          ) : (
            <Link
              href={`/w/${book.id}`}
              className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink hover:text-accent"
            >
              {book.title || "Untitled"}
            </Link>
          )}
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              onClick={() => onDuplicate(book.id)}
              title="Duplicate"
              className="rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-faint hover:bg-white/5 hover:text-ink"
            >
              Copy
            </button>
            <button
              onClick={() => {
                setDraft(book.title);
                setEditing(true);
              }}
              title="Rename"
              className="rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-faint hover:bg-white/5 hover:text-ink"
            >
              Rename
            </button>
            <button
              onClick={() => {
                if (!confirm) {
                  setConfirm(true);
                  window.setTimeout(() => setConfirm(false), 2800);
                  return;
                }
                onDelete(book.id);
              }}
              title="Delete workbook"
              className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider hover:bg-white/5 ${
                confirm ? "text-err" : "text-faint hover:text-err"
              }`}
            >
              {confirm ? "Sure?" : "Delete"}
            </button>
          </div>
        </div>

        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          <span
            className={`h-1.5 w-1.5 rounded-full ${statusTone(book.lastRun?.status)}`}
            title={book.lastRun?.status ?? "never run"}
          />
          {book.lastRun
            ? `${book.lastRun.status} · ${ago(book.lastRun.startedAt)}`
            : "never run"}
          {book.nextRunAt ? ` · next ${ago(book.nextRunAt)}` : ""}
          {typeof book.nodeCount === "number" &&
            ` · ${book.nodeCount} node${book.nodeCount === 1 ? "" : "s"}`}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(book.kinds ?? []).slice(0, 6).map((k) => {
            const def = NODE_TYPES.find((d) => d.type === k);
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: def?.color ?? "#5a5a5a" }}
                />
                {def?.label ?? k}
              </span>
            );
          })}
          {!book.kinds?.length && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-faint">
              Empty canvas
            </span>
          )}
        </div>

        <Link
          href={`/w/${book.id}`}
          className="mt-4 inline-flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-live"
        >
          Open canvas
          <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}
