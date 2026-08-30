"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nodeDef } from "@/lib/nodes";
import {
  applyGraphOps,
  type AssistantMention,
  type AssistantMessage,
  type GraphOp,
} from "@/lib/assistant";
import type { GraphDoc, RunSettings } from "@/lib/types";
import { toast } from "./Toast";

interface ChatRow extends AssistantMessage {
  id: string;
}

export function AssistantPanel({
  graphId,
  graph,
  settings,
  onApply,
  onClose,
}: {
  graphId: string;
  graph: GraphDoc;
  settings?: RunSettings;
  onApply: (next: GraphDoc) => void;
  onClose: () => void;
}) {
  const storageKey = `flowbook.assistant.${graphId}`;
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<AssistantMention[]>([]);
  const [busy, setBusy] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatRow[];
      if (Array.isArray(parsed)) setRows(parsed);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(rows));
  }, [rows, storageKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [rows, busy]);

  const candidates = useMemo(() => {
    const q = mentionQ.toLowerCase();
    return graph.nodes
      .map((n) => ({
        id: n.id,
        label: n.data.label || nodeDef(n.data.kind)?.label || n.data.kind,
        kind: n.data.kind,
        color: nodeDef(n.data.kind)?.color ?? "#8a8a8a",
      }))
      .filter(
        (n) =>
          !mentions.some((m) => m.id === n.id) &&
          (!q ||
            n.label.toLowerCase().includes(q) ||
            n.kind.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [graph.nodes, mentionQ, mentions]);

  const pickMention = (n: AssistantMention) => {
    setMentions((xs) => [...xs, n]);
    setDraft((t) => t.replace(/(^|\s)@[^\s]*$/, "$1"));
    setMentionOpen(false);
    setMentionQ("");
    inputRef.current?.focus();
  };

  const onDraft = (value: string) => {
    setDraft(value);
    const at = value.match(/(^|\s)@([^\s]*)$/);
    if (at) {
      setMentionOpen(true);
      setMentionQ(at[2] ?? "");
    } else {
      setMentionOpen(false);
      setMentionQ("");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text && !mentions.length) return;
    if (busy) return;
    const user: ChatRow = {
      id: `u${Date.now().toString(36)}`,
      role: "user",
      content: text || "Update the mentioned nodes.",
      mentions: mentions.length ? mentions : undefined,
    };
    const nextRows = [...rows, user];
    setRows(nextRows);
    setDraft("");
    setMentions([]);
    setMentionOpen(false);
    setBusy(true);

    const assistantId = `a${Date.now().toString(36)}`;
    setRows((xs) => [
      ...xs,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextRows.map(({ role, content, mentions: m }) => ({
            role,
            content,
            mentions: m,
          })),
          graph,
          settings,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err.slice(0, 180) || `Assistant failed (${res.status})`);
      }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type: string; text?: string; ops?: GraphOp[]; error?: string };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "delta" && ev.text) {
            reply += ev.text;
            setRows((xs) =>
              xs.map((r) =>
                r.id === assistantId ? { ...r, content: reply } : r,
              ),
            );
          } else if (ev.type === "ops" && ev.ops?.length) {
            onApply(applyGraphOps(graph, ev.ops));
            toast(
              ev.ops.length === 1
                ? "Updated the canvas."
                : `Applied ${ev.ops.length} canvas changes.`,
              "ok",
            );
          } else if (ev.type === "error") {
            throw new Error(ev.error || "Assistant failed");
          }
        }
      }
      if (!reply) {
        setRows((xs) =>
          xs.map((r) =>
            r.id === assistantId
              ? { ...r, content: "Done — I updated the canvas." }
              : r,
          ),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Assistant failed";
      toast(msg, "error");
      setRows((xs) =>
        xs.map((r) =>
          r.id === assistantId
            ? { ...r, content: r.content || `Couldn’t apply that: ${msg}` }
            : r,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="fb-pop absolute inset-y-3 right-3 z-20 flex w-[360px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-card/95 shadow-2xl shadow-black/50 backdrop-blur">
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
            Assistant
          </p>
          <p className="text-[13px] font-medium text-ink">Build with chat</p>
        </div>
        <button
          onClick={onClose}
          title="Close assistant"
          className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/5 hover:text-ink"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
            <path
              d="M1.5 1.5 6.5 6.5M6.5 1.5 1.5 6.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
        {!rows.length && (
          <div className="rounded-lg border border-dashed border-line px-3 py-4 text-[12.5px] leading-relaxed text-muted">
            Describe a pipeline and I’ll place the nodes. Type{" "}
            <span className="font-mono text-ink">@</span> to mention a node and
            edit it.
          </div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className={`max-w-[92%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
              r.role === "user"
                ? "ml-auto bg-white text-[#111]"
                : "bg-sunken text-ink"
            }`}
          >
            {r.mentions?.length ? (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {r.mentions.map((m) => (
                  <span
                    key={m.id}
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                      r.role === "user"
                        ? "bg-black/10 text-[#111]"
                        : "bg-white/8 text-muted"
                    }`}
                  >
                    @{m.label}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap">
              {r.content || (busy && r.role === "assistant" ? "…" : "")}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-2.5">
        {mentions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {mentions.map((m) => (
              <button
                key={m.id}
                onClick={() =>
                  setMentions((xs) => xs.filter((x) => x.id !== m.id))
                }
                className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink"
                title="Remove mention"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: nodeDef(m.kind)?.color ?? "#8a8a8a" }}
                />
                @{m.label}
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          {mentionOpen && candidates.length > 0 && (
            <div className="absolute inset-x-0 bottom-full z-10 mb-1 overflow-hidden rounded-lg border border-line bg-card shadow-xl">
              {candidates.map((n) => (
                <button
                  key={n.id}
                  onClick={() => pickMention(n)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.05]"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: n.color }}
                  />
                  <span className="truncate text-[12px] text-ink">{n.label}</span>
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-faint">
                    {n.kind}
                  </span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
              if (e.key === "Escape") setMentionOpen(false);
            }}
            placeholder="Build a flow…  @ to mention a node"
            rows={3}
            disabled={busy}
            className="w-full resize-none rounded-lg border border-line bg-sunken px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-line2 disabled:opacity-60"
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
            Enter to send
          </span>
          <button
            onClick={() => void send()}
            disabled={busy || (!draft.trim() && !mentions.length)}
            className="fb-btn-primary rounded-full px-3 py-1 text-[12px] font-medium disabled:opacity-40"
          >
            {busy ? "Working…" : "Send"}
          </button>
        </div>
      </div>
    </aside>
  );
}
