"use client";

import { useState } from "react";
import { readJson } from "@/lib/http";
import { toast } from "./Toast";

export function PublishTemplate({
  graphId,
  title,
  onClose,
}: {
  graphId: string;
  title: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(title);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          graphId,
          title: name,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      const j = await readJson<{
        template?: { slug: string };
        error?: string;
      }>(res);
      if (!res.ok || !j.template) throw new Error(j.error || "Publish failed");
      const url = `${window.location.origin}/templates/${j.template.slug}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast("Published to the template gallery. Link copied.", "ok");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Publish failed", "error");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="fb-pop w-full max-w-md rounded-2xl border border-line2 bg-card p-5 shadow-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
          Templates
        </p>
        <h2 className="mt-1 text-[18px] font-semibold text-ink">
          Publish workbook
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Anyone in this deployment can browse and clone it. Uploaded media is
          stripped; skills travel with the snapshot.
        </p>
        <label className="mt-4 block text-[11px] text-muted">
          Title
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-sunken px-2 py-1.5 text-[13px] text-ink outline-none focus:border-line2"
          />
        </label>
        <label className="mt-3 block text-[11px] text-muted">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-y rounded-md border border-line bg-sunken px-2 py-1.5 text-[13px] text-ink outline-none focus:border-line2"
          />
        </label>
        <label className="mt-3 block text-[11px] text-muted">
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="image, product, starter"
            className="mt-1 w-full rounded-md border border-line bg-sunken px-2 py-1.5 text-[13px] text-ink outline-none focus:border-line2"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={busy}
            className="fb-btn-primary rounded-full px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
          >
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
