"use client";

import { useMemo, useState } from "react";
import { mdToHtml, parseTextOutput, type OutputBlock } from "@/lib/render";
import type { NodeOutput } from "@/lib/types";

/**
 * Universal output renderer — renders whatever the model responded with.
 * Full HTML pages/apps preview in a sandboxed iframe; markdown becomes
 * prose; JSON gets a viewer; bare media URLs become elements.
 */
function playableSrc(src: string) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;
  return src.includes("?") ? `${src}&play=1` : `${src}?play=1`;
}

export function OutputRenderer({ output }: { output: NodeOutput }) {
  if (output.type === "text") {
    const blocks = parseTextOutput(output.text ?? "");
    return (
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </div>
    );
  }
  if (output.url) return <MediaEmbed kind={output.type} src={output.url} />;
  return null;
}

function BlockView({ block }: { block: OutputBlock }) {
  switch (block.kind) {
    case "html":
      return <HtmlPreview code={block.text} />;
    case "md":
      return (
        <div
          className="fb-prose nowheel max-h-[420px] overflow-auto rounded-lg border border-line bg-sunken px-3 py-2.5"
          dangerouslySetInnerHTML={{ __html: mdToHtml(block.text) }}
        />
      );
    case "json":
      return <JsonViewer text={block.text} />;
    case "code":
      return <CodeBlock lang={block.lang} text={block.text} />;
    default:
      return <MediaEmbed kind={block.kind} src={block.src} />;
  }
}

/** Live preview of generated pages/apps inside a locked-down iframe. */
function HtmlPreview({ code }: { code: string }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const src = useMemo(() => `data:text/html;charset=utf-8,${encodeURIComponent(code)}`, [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="nowheel overflow-hidden rounded-lg border border-line bg-sunken">
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <div className="flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-[0.14em]">
          {(["preview", "code"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                view === v ? "bg-white/[0.07] text-ink" : "text-faint hover:text-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em]">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="text-faint transition-colors hover:text-live"
          >
            Open ↗
          </a>
          <button onClick={copy} className="text-faint transition-colors hover:text-live">
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>
      {view === "preview" ? (
        <iframe
          className="fb-frame nowheel h-[340px]"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          referrerPolicy="no-referrer"
          srcDoc={code}
          title="Generated page"
        />
      ) : (
        <pre className="max-h-[340px] overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink/85">
          {code}
        </pre>
      )}
    </div>
  );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <div className="nowheel overflow-hidden rounded-lg border border-line bg-sunken">
      <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
          {lang || "code"}
        </span>
        <button onClick={copy} className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-live">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink/85">
        {text}
      </pre>
    </div>
  );
}

function JsonViewer({ text }: { text: string }) {
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }, [text]);
  return (
    <details className="fb-json nowheel overflow-hidden rounded-lg border border-line bg-sunken">
      <summary className="cursor-pointer list-none px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint transition-colors hover:text-muted">
        {"{ }"} JSON · {pretty.split("\n").length.toLocaleString()} lines
      </summary>
      <pre className="max-h-72 overflow-auto border-t border-line px-3 py-2.5 font-mono text-[11px] leading-relaxed text-ink/85">
        {pretty}
      </pre>
    </details>
  );
}

function MediaEmbed({ kind, src }: { kind: string; src: string }) {
  if (kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="fb-media nowheel max-h-56 w-full object-cover" />;
  if (kind === "audio")
    return (
      <audio
        controls
        preload="metadata"
        src={playableSrc(src)}
        className="nodrag mt-1 w-full"
      />
    );
  if (kind === "video")
    return <video controls src={src} className="fb-media nowheel max-h-56 w-full" />;
  return null;
}
