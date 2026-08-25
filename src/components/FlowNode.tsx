"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeDef, type PortType } from "@/lib/nodes";
import type { FlowNodeData } from "./Canvas";
import { useState } from "react";

const PORT_COLORS: Record<PortType, string> = {
  text: "#c9a227",
  image: "#2fb380",
  audio: "#d97b4a",
  video: "#4a90d9",
  json: "#8b8f98",
};

const STATUS_DOT: Record<string, string> = {
  idle: "#3a3d47",
  queued: "#c9a227",
  running: "#4a90d9",
  done: "#2fb380",
  error: "#e05252",
};

export function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const def = nodeDef(d.kind);
  const [upl, setUpl] = useState(false);

  if (!def) return null;

  const isMediaIn = ["image.in", "audio.in", "video.in"].includes(d.kind);
  const isSink = d.kind.startsWith("out.");

  const upload = async (file: File) => {
    setUpl(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (j.id) {
        // reach back into the node data via a custom event (parent handles)
        window.dispatchEvent(
          new CustomEvent("flowbook:set-artifact", {
            detail: { nodeId: id, artifactId: j.id, url: j.url },
          }),
        );
      }
    } finally {
      setUpl(false);
    }
  };

  return (
    <div
      className="w-[268px] rounded-lg border bg-[#14161c] shadow-lg transition-shadow"
      style={{
        borderColor: selected ? def.color : "#262932",
        boxShadow: selected ? `0 0 0 1px ${def.color}55, 0 8px 28px -12px ${def.color}44` : undefined,
      }}
    >
      {/* header */}
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{ background: `${def.color}18`, borderBottom: `1px solid ${def.color}33` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: def.color }}
          />
          <span className="text-[13px] font-medium text-[#e8e9ee]">
            {d.label || def.label}
          </span>
        </div>
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: STATUS_DOT[d.runStatus ?? "idle"] }}
          title={d.runStatus ?? "idle"}
        />
      </div>

      <div className="relative px-3 py-2.5">
        {/* input ports */}
        {def.inputs.map((p) => (
          <Handle
            key={p.id}
            id={p.id}
            type="target"
            position={Position.Left}
            style={{
              background: PORT_COLORS[p.type],
              left: -6,
              top: 14 + def.inputs.indexOf(p) * 26,
            }}
            title={`${p.label} (${p.type})`}
          />
        ))}
        {def.inputs.length > 0 && (
          <div className="mb-1.5 flex flex-col gap-[18px] pl-1">
            {def.inputs.map((p) => (
              <span key={p.id} className="text-[10px] uppercase tracking-wide text-[#6d7280]">
                {p.label}
              </span>
            ))}
          </div>
        )}

        {/* body by kind */}
        {d.kind === "text" || d.kind === "note" ? (
          <textarea
            value={d.text ?? ""}
            onChange={(e) =>
              window.dispatchEvent(
                new CustomEvent("flowbook:update", {
                  detail: { nodeId: id, patch: { text: e.target.value } },
                }),
              )
            }
            placeholder={d.kind === "note" ? "Instruction…" : "Paste text or an article…"}
            rows={d.kind === "note" ? 2 : 5}
            className="nodrag w-full resize-y rounded-md border border-[#262932] bg-[#0f1014] px-2 py-1.5 text-[12px] leading-relaxed text-[#c9ccd4] outline-none focus:border-[#3a3f4d]"
          />
        ) : null}

        {(d.kind === "llm" || d.kind === "image.gen" || d.kind === "video.gen") && (
          <textarea
            value={d.prompt ?? ""}
            onChange={(e) =>
              window.dispatchEvent(
                new CustomEvent("flowbook:update", {
                  detail: { nodeId: id, patch: { prompt: e.target.value } },
                }),
              )
            }
            placeholder={
              d.kind === "llm"
                ? "Instruction for the model (context flows in from the left)…"
                : "Describe what to generate…"
            }
            rows={3}
            className="nodrag nowheel mb-2 w-full resize-y rounded-md border border-[#262932] bg-[#0f1014] px-2 py-1.5 text-[12px] leading-relaxed text-[#c9ccd4] outline-none focus:border-[#3a3f4d]"
          />
        )}

        {def.models && def.models.length > 0 && (
          <select
            value={d.model ?? def.models[0].id}
            onChange={(e) =>
              window.dispatchEvent(
                new CustomEvent("flowbook:update", {
                  detail: { nodeId: id, patch: { model: e.target.value } },
                }),
              )
            }
            className="nodrag mb-2 w-full rounded-md border border-[#262932] bg-[#0f1014] px-2 py-1.5 text-[11px] text-[#9aa0ad] outline-none focus:border-[#3a3f4d]"
          >
            {def.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}

        {isMediaIn && (
          <label className="nodrag flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[#2e323d] bg-[#0f1014] px-2 py-3 text-[11px] text-[#6d7280] hover:border-[#3a3f4d]">
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
          <MediaPreview url={`/api/media/${d.artifactId}`} kind={d.kind.replace(".in", "")} />
        )}

        {/* outputs preview */}
        {!isSink && d.outputs && d.outputs.length > 0 && d.runStatus === "done" && (
          <div className="mt-1 space-y-1.5">
            {d.outputs.slice(0, 3).map((o, i) => (
              <OutputChip key={i} o={o} />
            ))}
          </div>
        )}

        {/* sink display */}
        {isSink && d.outputs && d.outputs.length > 0 && (
          <div className="mt-1 space-y-2">
            {d.outputs.map((o, i) =>
              o.type === "text" ? (
                <div
                  key={i}
                  className="max-h-44 overflow-auto rounded-md border border-[#262932] bg-[#0f1014] p-2 text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#c9ccd4]"
                >
                  {o.text}
                </div>
              ) : (
                <MediaPreview key={i} url={o.url ?? ""} kind={o.type} />
              ),
            )}
          </div>
        )}

        {d.runStatus === "error" && (
          <div className="mt-1.5 rounded-md border border-[#5a2626] bg-[#1d1112] px-2 py-1.5 text-[10.5px] leading-snug text-[#e58b8b]">
            {d.runError}
          </div>
        )}

        {/* output ports */}
        {def.outputs.map((p, i) => (
          <Handle
            key={p.id}
            id={p.id}
            type="source"
            position={Position.Right}
            style={{
              background: PORT_COLORS[p.type],
              right: -6,
              top: 14 + i * 26,
            }}
            title={`${p.label} (${p.type})`}
          />
        ))}
      </div>
    </div>
  );
}

function OutputChip({ o }: { o: { type: string; text?: string; url?: string } }) {
  if (o.type === "text")
    return (
      <div className="max-h-28 overflow-hidden rounded-md border border-[#22252e] bg-[#0f1014] px-2 py-1.5 text-[11px] leading-snug text-[#8f95a3]">
        {o.text?.slice(0, 220)}
        {(o.text?.length ?? 0) > 220 ? "…" : ""}
      </div>
    );
  return <MediaPreview url={o.url ?? ""} kind={o.type} />;
}

function MediaPreview({ url, kind }: { url: string; kind: string }) {
  if (!url) return null;
  if (kind === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="mt-1 w-full rounded-md border border-[#262932] object-cover"
      />
    );
  if (kind === "audio")
    return <audio controls src={url} className="mt-1 w-full" />;
  if (kind === "video")
    return (
      <video controls src={url} className="mt-1 w-full rounded-md border border-[#262932]" />
    );
  return null;
}
