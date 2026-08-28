/**
 * Dynamic output classification — turns whatever a model responded with
 * into renderable blocks. Nothing is restricted: full HTML documents and
 * apps preview live, markdown renders as prose, JSON gets a viewer, and
 * bare media URLs / data URIs become the matching element.
 */

export type OutputBlock =
  | { kind: "md"; text: string }
  | { kind: "html"; text: string }
  | { kind: "json"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "image" | "audio" | "video"; src: string };

/** Short mono caption for the output meta row, aware of block types. */
export function describeOutputs(
  outputs: { type: string; text?: string; url?: string }[],
): string {
  const texts = outputs.filter((o) => o.type === "text") as {
    text: string;
  }[];
  const mediaCount = outputs.length - texts.length;
  const parts: string[] = [];
  if (texts.length === 1) {
    const kinds = new Set(parseTextOutput(texts[0].text ?? "").map((b) => b.kind));
    const name =
      kinds.has("html")
        ? "Page"
        : kinds.has("json")
          ? "JSON"
          : kinds.has("code")
            ? "Code"
            : kinds.has("image") || kinds.has("audio") || kinds.has("video")
              ? "Embed"
              : "Text";
    parts.push(`${name} · ${(texts[0].text ?? "").length.toLocaleString()} chars`);
  } else if (texts.length > 1) parts.push(`${texts.length} texts`);
  if (mediaCount) parts.push(`${mediaCount} media`);
  return parts.join(" + ") || "Empty";
}


const HTML_LANGS = new Set(["html", "htm", "xhtml", "svg"]);
const looksFullHtml = (t: string) =>
  /<!doctype\s+html/i.test(t) || /<html[\s>]/i.test(t);

export function parseTextOutput(raw: string): OutputBlock[] {
  const t = raw.trim();
  if (!t) return [];

  // a single bare URL pointing at media → embed it directly
  if (/^https?:\/\/\S+$/i.test(t)) {
    const u = t;
    if (/\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?$/i.test(u))
      return [{ kind: "image", src: u }];
    if (/\.(mp4|webm|mov|m4v)(\?\S*)?$/i.test(u))
      return [{ kind: "video", src: u }];
    if (/\.(mp3|wav|ogg|m4a|aac)(\?\S*)?$/i.test(u))
      return [{ kind: "audio", src: u }];
  }
  // standalone data URI
  const data = /^data:(image|audio|video)\/[^\s;,]+/i.exec(t);
  if (data && !t.includes("\n") && t.length < 2_000_000)
    return [{ kind: data[1].toLowerCase() as "image" | "audio" | "video", src: t }];

  // valid JSON document
  if (/^[{[]/.test(t)) {
    try {
      JSON.parse(t);
      return [{ kind: "json", text: t }];
    } catch {
      /* not json — fall through */
    }
  }

  // complete HTML document or SVG root → live preview
  if (looksFullHtml(t) || /^<svg[\s>]/i.test(t)) return [{ kind: "html", text: t }];

  // mixed content: walk fenced code blocks; prose between them is markdown
  const blocks: OutputBlock[] = [];
  const fence = /```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(t))) {
    const before = t.slice(last, m.index);
    if (before.trim()) blocks.push({ kind: "md", text: before });
    const lang = (m[1] || "").toLowerCase();
    const code = m[2];
    if (
      HTML_LANGS.has(lang) ||
      (!lang && (looksFullHtml(code) || /^<svg[\s>]/i.test(code.trimStart())))
    )
      blocks.push({ kind: "html", text: code });
    else blocks.push({ kind: "code", lang, text: code });
    last = fence.lastIndex;
  }
  const tail = t.slice(last);
  if (tail.trim()) blocks.push({ kind: "md", text: tail });

  return blocks.length ? blocks : [{ kind: "md", text: t }];
}

/** Escape for safe interpolation into generated HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal, escape-first markdown → HTML. Input is fully escaped before
 * patterns are applied, so model output can never inject markup beyond
 * the small tag set below (links restricted to http(s)).
 */
export function mdToHtml(md: string): string {
  const lines = esc(md).split(/\r?\n/);
  const inline = (t: string) =>
    t
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );

  let html = "";
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushP = () => {
    if (para.length) html += `<p>${para.join("<br/>")}</p>`;
    para = [];
  };
  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };

  for (const line of lines) {
    const l = line.trim();

    if (!l) {
      flushP();
      closeList();
      continue;
    }
    const h = /^(#{1,5})\s+(.*)$/.exec(l);
    if (h) {
      flushP();
      closeList();
      const n = Math.min(h[1].length + 1, 5); // h1 → h2: card-scale typography
      html += `<h${n}>${inline(h[2])}</h${n}>`;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(l)) {
      flushP();
      closeList();
      html += "<hr/>";
      continue;
    }
    if (/^&gt;\s?/.test(l)) {
      flushP();
      closeList();
      html += `<blockquote>${inline(l.replace(/^&gt;\s?/, ""))}</blockquote>`;
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(l);
    const ol = /^\d+[.)]\s+(.+)$/.exec(l);
    if (ul || ol) {
      flushP();
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        closeList();
        html += `<${want}>`;
        list = want;
      }
      html += `<li>${inline((ul ?? ol)![1])}</li>`;
      continue;
    }
    para.push(inline(l));
  }
  flushP();
  closeList();
  return html;
}
