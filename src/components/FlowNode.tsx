"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeDef, type PortType } from "@/lib/nodes";
import { CUSTOM_MODEL, groupModels } from "@/lib/models";
import { useCatalog } from "@/lib/model-catalog";
import { PROVIDER_SPECS } from "@/lib/providers";

/** Which gateway providers may serve this node kind, with UI labels. */
function providerSpecFor(kind: string): { gateways: string[] } {
  // every provider serves chat; image/video only where the spec says so
  const caps: Record<string, Array<"chat" | "image" | "video">> = {
    llm: ["chat"],
    "image.gen": ["image"],
    tts: [],
    "video.gen": ["video"],
  };
  const need = caps[kind] ?? [];
  return {
    gateways: PROVIDER_SPECS.filter(
      (s) => s.id !== "openrouter" && need.some((c) => s.caps.includes(c)),
    ).map((s) => s.id),
  };
}
const gatewayLabel = (pid: string) =>
  PROVIDER_SPECS.find((s) => s.id === pid)?.label ?? pid;
import { describeOutputs } from "@/lib/render";
import type { FlowNodeData } from "@/lib/types";
import { OutputRenderer } from "./OutputRenderer";

const PORT_COLORS: Record<PortType, string> = {
  text: "#d4b45c",
  image: "#55b48d",
  audio: "#dd8a60",
  video: "#6f9fd9",
  json: "#8b90a0",
};

// Port rows stack from the top of the body on the left edge.
const ROW_H = 24;
const FIRST_ROW = 12;

const patch = (nodeId: string, p: Record<string, unknown>) =>
  window.dispatchEvent(
    new CustomEvent("flowbook:update", { detail: { nodeId, patch: p } }),
  );

export function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const def = nodeDef(d.kind);
  const [upl, setUpl] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const cat = useCatalog();

  if (!def) return null;

  const isMediaIn = ["image.in", "audio.in", "video.in"].includes(d.kind);
  const isSink = d.kind.startsWith("out.");
  const status = d.runStatus ?? "idle";
  const outputs = d.outputs ?? [];
  // live-streamed text (LLM nodes) — shown while running
  const streaming = d.streamingText ?? "";
  const hasContent =
    outputs.some((o) => (o.type === "text" ? !!o.text.trim() : !!o.url)) ||
    (!!streaming && status === "running");
  // changing content replays the arrival animation
  const sig = JSON.stringify(
    outputs.map((o) => (o.type === "text" ? o.text.length : o.url)),
  );

  const upload = async (file: File) => {
    setUpl(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (j.id)
        window.dispatchEvent(
          new CustomEvent("flowbook:set-artifact", {
            detail: { nodeId: id, artifactId: j.id },
          }),
        );
    } finally {
      setUpl(false);
    }
  };

  const copy = async (t: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(t);
      ok = true;
    } catch {
      // fallback for contexts where the async clipboard API is blocked
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <div
      className={`fb-node group ${isSink ? "w-[340px]" : "w-[264px]"} st-${status} ${selected ? "is-selected" : ""}`}
    >
      {status === "running" && <span className="fb-shimmer" />}

      {/* header */}
      <header
        className="flex h-9 items-center gap-2 border-b border-line/70 px-3"
        title="Double-click to run"
      >
        <span
          className="fb-dot h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: def.color }}
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
          {d.label || def.label}
        </span>

        {status !== "running" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("flowbook:run-node", {
                  detail: { nodeId: id },
                }),
              );
            }}
            title="Run this node"
            className="nodrag -mr-0.5 flex h-5 w-5 items-center justify-center rounded text-faint opacity-0 transition-all hover:bg-white/5 hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
              <path d="M1.5 0.8 8.5 5 1.5 9.2Z" fill="currentColor" />
            </svg>
          </button>
        )}

        <StatusMark status={status} />
      </header>

      {/* body */}
      <div
        className="relative px-3 pb-3"
        style={{ paddingTop: def.inputs.length ? FIRST_ROW + def.inputs.length * ROW_H : 12 }}
      >
        {/* input ports */}
        {def.inputs.map((p, i) => {
          const mid = FIRST_ROW + i * ROW_H;
          return (
            <span key={p.id}>
              <Handle
                id={p.id}
                type="target"
                position={Position.Left}
                style={{
                  background: PORT_COLORS[p.type],
                  left: -5,
                  top: mid - 4,
                }}
                title={`${p.label} (${p.type})`}
              />
              <span
                className="pointer-events-none absolute left-4 flex h-4 items-center font-mono text-[9px] uppercase tracking-[0.14em] text-faint"
                style={{ top: mid - 8 }}
              >
                {p.label}
              </span>
            </span>
          );
        })}

        {/* output ports — single is centered; multiple stack like inputs */}
        {def.outputs.map((p, i) => {
          const many = def.outputs.length > 1;
          const mid = many ? FIRST_ROW + i * ROW_H : null;
          return (
            <span key={p.id}>
              <Handle
                id={p.id}
                type="source"
                position={Position.Right}
                style={{
                  background: PORT_COLORS[p.type],
                  right: -5,
                  top: mid !== null ? mid - 4 : "50%",
                  marginTop: mid !== null ? 0 : -4,
                }}
                title={`${p.label} (${p.type})`}
              />
              {many && (
                <span
                  className="pointer-events-none absolute right-4 flex h-4 items-center font-mono text-[9px] uppercase tracking-[0.14em] text-faint"
                  style={{ top: mid! - 8 }}
                >
                  {p.label}
                </span>
              )}
            </span>
          );
        })}

        {/* source editors */}
        {(d.kind === "text" || d.kind === "note") && (
          <textarea
            value={d.text ?? ""}
            onChange={(e) => patch(id, { text: e.target.value })}
            placeholder={
              d.kind === "note" ? "Instruction…" : "Paste text or an article…"
            }
            rows={d.kind === "note" ? 2 : 5}
            className="nodrag nowheel w-full resize-y rounded-md border border-line bg-sunken px-2 py-1.5 text-[12px] leading-relaxed text-ink/85 outline-none transition-colors placeholder:text-faint focus:border-line2"
          />
        )}

        {(d.kind === "llm" || d.kind === "image.gen" || d.kind === "video.gen") && (
          <textarea
            value={d.prompt ?? ""}
            onChange={(e) => patch(id, { prompt: e.target.value })}
            placeholder={
              d.kind === "llm"
                ? "What should the model do with the input?"
                : "Describe what to generate…"
            }
            rows={3}
            className="nodrag nowheel mb-2 w-full resize-y rounded-md border border-line bg-sunken px-2 py-1.5 text-[12px] leading-relaxed text-ink/85 outline-none transition-colors placeholder:text-faint focus:border-line2"
          />
        )}

        {def.models && def.models.length > 0 && (() => {
          // live catalogs per provider (except OpenRouter presets below)
          const spec = providerSpecFor(d.kind);
          const groups: { provider: string; label: string; items: { id: string; label: string }[] }[] =
            [...groupModels(def.models)];
          const gatewayProviders = spec.gateways
            .map((pid) => ({
              pid,
              items: (cat.models[pid] ?? []) as { id: string; label: string }[],
            }))
            .filter((g) => g.items.length > 0);
          for (const g of gatewayProviders)
            groups.push({ provider: g.pid, label: gatewayLabel(g.pid), items: g.items });

          const knownIds = def.models.map((m) => m.id);
          const inGateway = gatewayProviders.some((g) =>
            g.items.some((m) => m.id === d.model),
          );
          // saved gateway model that isn't currently listed (offline?) → editable fallback
          const orphanGateway =
            !!d.provider && d.provider !== "openrouter" && !!d.model && !inGateway;
          const showCustom =
            !inGateway &&
            !orphanGateway &&
            (customModel || (!!d.model && !knownIds.includes(d.model)));

          const pickModel = (value: string) => {
            if (value === CUSTOM_MODEL) {
              setCustomModel(true);
              patch(id, { model: "", provider: "openrouter" });
              return;
            }
            const fromGateway = gatewayProviders.find((g) =>
              g.items.some((m) => m.id === value),
            );
            patch(id, {
              model: value,
              provider: fromGateway ? fromGateway.pid : "openrouter",
            });
          };

          return (
            <>
              {orphanGateway || showCustom ? (
                <div className="relative mb-2">
                  <input
                    value={d.model ?? ""}
                    onChange={(e) => patch(id, { model: e.target.value })}
                    spellCheck={false}
                    placeholder={
                      orphanGateway
                        ? "gateway offline — model id kept"
                        : "provider/model — any OpenRouter id"
                    }
                    title={
                      orphanGateway
                        ? "Saved gateway model — it will run through its provider when reachable"
                        : undefined
                    }
                    className="nodrag w-full rounded-md border border-accent/40 bg-sunken px-2 py-1.5 pr-7 font-mono text-[10.5px] text-ink/85 outline-none transition-colors placeholder:text-faint focus:border-accent"
                  />
                  {!orphanGateway && (
                    <button
                      onClick={() => {
                        setCustomModel(false);
                        patch(id, { model: knownIds[0], provider: "openrouter" });
                      }}
                      title="Back to preset models"
                      className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-faint transition-colors hover:bg-white/5 hover:text-muted"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                        <path d="M1.5 1.5 6.5 6.5M6.5 1.5 1.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={d.model ?? def.models[0].id}
                  onChange={(e) => pickModel(e.target.value)}
                  className="nodrag mb-2 w-full rounded-md border border-line bg-sunken px-2 py-1.5 font-mono text-[10.5px] text-muted outline-none transition-colors focus:border-line2"
                >
                  {groups.map((g) => (
                    <optgroup key={`${g.provider}-${g.label}`} label={g.label}>
                      {g.items.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={CUSTOM_MODEL}>Custom model…</option>
                </select>
              )}
            </>
          );
        })()}

        {/* media input */}
        {isMediaIn && (
          <label
            className={`nodrag flex cursor-pointer items-center justify-center rounded-md border border-dashed bg-sunken px-2 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              upl
                ? "border-accent/50 text-accent"
                : "border-line2 text-muted hover:border-accent/60 hover:text-ink"
            }`}
          >
            {upl ? "Uploading…" : d.artifactId ? "Replace file" : "Choose file"}
            <input
              type="file"
              accept={
                d.kind === "image.in"
                  ? "image/*"
                  : d.kind === "audio.in"
                    ? "audio/*"
                    : "video/*"
              }
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
          </label>
        )}
        {isMediaIn && d.artifactId && !upl && (
          <MediaPreview
            url={`/api/media/${d.artifactId}`}
            kind={d.kind.replace(".in", "")}
          />
        )}

        {/* ---------------------------------------------------------------
            Output. Renders whatever arrived — pages, apps, prose, JSON,
            media — processing nodes stay clean; results live here only.
        ---------------------------------------------------------------- */}
        {isSink &&
          (hasContent ? (
            <div key={sig} className="fb-rise space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                  {status === "running" && streaming
                    ? "streaming…"
                    : describeOutputs(outputs)}
                </span>
                <button
                  onClick={() => copy(outputs.map((o) => (o.type === "text" ? o.text : o.url ?? "")).join("\n\n"))}
                  title="Copy raw output"
                  className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              {status === "running" && streaming ? (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-sunken px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink/80">
                  {streaming}
                  <span className="fb-caret" aria-hidden />
                </pre>
              ) : (
                outputs.map((o, i) =>
                  (o.type === "text" && !o.text.trim()) ||
                  (o.type !== "text" && !o.url) ? null : (
                    <OutputRenderer key={i} output={o} />
                  ),
                )
              )}
            </div>
          ) : status === "running" || status === "queued" ? (
            <div className="flex items-center gap-2 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              <Spinner className="text-accent" />
              Awaiting results…
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center">
              <p className="text-[12px] text-muted">No output yet.</p>
              <p className="mt-0.5 text-[11px] text-faint">
                Connect upstream and run — or chain this node onward.
              </p>
            </div>
          ))}

        {status === "error" && (
          <div className="mt-2 rounded-md border border-err/40 bg-err/10 px-2.5 py-2 text-[11px] leading-snug text-[#eb9082]">
            {d.runError}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusMark({ status }: { status: string }) {
  if (status === "running")
    return <Spinner className="shrink-0 text-accent" />;
  const color =
    status === "done"
      ? "var(--color-ok)"
      : status === "error"
        ? "var(--color-err)"
        : status === "queued"
          ? "var(--color-accent)"
          : "var(--color-line2)";
  return (
    <span
      className="fb-dot h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color }}
      title={status}
    />
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`fb-spin shrink-0 ${className}`}
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MediaPreview({ url, kind }: { url: string; kind: string }) {
  if (!url) return null;
  if (kind === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="nowheel mt-2 max-h-56 w-full rounded-md border border-line object-cover"
      />
    );
  if (kind === "audio")
    return <audio controls src={url} className="nodrag mt-2 w-full" />;
  if (kind === "video")
    return (
      <video
        controls
        src={url}
        className="nowheel mt-2 max-h-56 w-full rounded-md border border-line"
      />
    );
  return null;
}
