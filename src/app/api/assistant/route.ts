import { NextRequest } from "next/server";
import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import {
  nodeCatalogPrompt,
  parseAssistantOutput,
  type AssistantMessage,
} from "@/lib/assistant";
import { resolveProvider } from "@/lib/providers";
import type { GraphDoc, ProviderConfig, RunSettings } from "@/lib/types";
import { requireActor } from "@/lib/auth";
import { loadOrgSettings, mergeSettings } from "@/lib/vault";
import { db } from "@/db";
import { runNodes, runs } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const incoming = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        mentions: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              kind: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
  graphId: z.string().optional(),
  selectedNodeIds: z.array(z.string()).optional(),
  graph: z
    .object({
      nodes: z.array(z.unknown()),
      edges: z.array(z.unknown()),
    })
    .optional(),
  settings: z
    .object({
      providers: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function settingsFrom(body: z.infer<typeof incoming>): RunSettings | undefined {
  const providers: Record<string, ProviderConfig> = {};
  const raw = body.settings?.providers;
  if (raw && typeof raw === "object") {
    for (const [id, cfg] of Object.entries(raw)) {
      if (!cfg || typeof cfg !== "object") continue;
      const c = cfg as Record<string, unknown>;
      const entry: ProviderConfig = {};
      if (typeof c.baseUrl === "string" && c.baseUrl.trim())
        entry.baseUrl = c.baseUrl.trim();
      if (typeof c.apiKey === "string" && c.apiKey.trim())
        entry.apiKey = c.apiKey.trim();
      providers[id] = entry;
    }
  }
  return Object.keys(providers).length ? { providers } : undefined;
}

function graphSummary(graph?: { nodes: unknown[]; edges: unknown[] }) {
  const doc = (graph ?? { nodes: [], edges: [] }) as GraphDoc;
  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc.edges) ? doc.edges : [];
  const nodeLines = nodes.map((n) => {
    const d = n.data ?? { kind: "?" };
    return `- id=${n.id} kind=${d.kind} label="${d.label ?? ""}" text=${JSON.stringify(d.text ?? "")} prompt=${JSON.stringify(d.prompt ?? "")} model=${d.model ?? ""} voice=${d.voice ?? ""} size=${d.size ?? ""} aspect=${d.aspectRatio ?? ""} duration=${d.duration ?? ""} resolution=${d.resolution ?? ""} pos=${n.position.x},${n.position.y}`;
  });
  const edgeLines = edges.map(
    (e) =>
      `- ${e.source}:${e.sourceHandle ?? "out"} -> ${e.target}:${e.targetHandle ?? "in"}`,
  );
  return `NODES (${nodes.length}):\n${nodeLines.join("\n") || "(empty)"}\nEDGES (${edges.length}):\n${edgeLines.join("\n") || "(empty)"}`;
}

function extractJson(text: string): unknown | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractReply(text: string): string {
  const m = text.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return "";
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1];
  }
}

function extractOps(text: string): unknown[] {
  const idx = text.search(/"ops"\s*:\s*\[/);
  if (idx < 0) return [];
  const start = text.indexOf("[", idx);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const arr = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function toModelMessages(messages: AssistantMessage[]) {
  return messages.map((m) => {
    let content = m.content;
    if (m.mentions?.length) {
      const tags = m.mentions
        .map((n) => `@${n.label} [id=${n.id} kind=${n.kind}]`)
        .join(", ");
      content = `${content}\n\nMentioned nodes: ${tags}`;
    }
    return { role: m.role, content };
  });
}

/**
 * POST /api/assistant
 * Streams NDJSON: delta / ops / done / error
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof incoming>;
  try {
    body = incoming.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "invalid request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let actor;
  try {
    actor = await requireActor(req);
  } catch {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const vault = await loadOrgSettings(actor.org.id);
  const settings = mergeSettings(vault, settingsFrom(body));

  let runContext = "(no recent run)";
  if (body.graphId) {
    const [last] = await db
      .select()
      .from(runs)
      .where(eq(runs.graphId, body.graphId))
      .orderBy(desc(runs.startedAt))
      .limit(1);
    if (last && last.orgId === actor.org.id) {
      const nodes = await db.select().from(runNodes).where(eq(runNodes.runId, last.id));
      runContext = `Last run ${last.id} status=${last.status} trigger=${last.trigger} error=${last.error ?? ""}\n${nodes
        .map(
          (n) =>
            `- node=${n.nodeId} status=${n.status} err=${n.error ?? ""} model=${n.model ?? ""}`,
        )
        .join("\n")}`;
    }
  }
  const selected = (body.selectedNodeIds ?? []).join(", ") || "(none)";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        let p;
        try {
          p = resolveProvider("openrouter", settings);
        } catch {
          p = resolveProvider("pyok", settings);
        }
        const system = `You are Flowbook's canvas assistant. You build and edit node workflows.

Available node kinds:
${nodeCatalogPrompt()}

Current graph:
${graphSummary(body.graph)}

Selected nodes: ${selected}

Latest run:
${runContext}

Rules:
- Reply in the user's language.
- Use ops to create or edit the graph. Prefer add_node + connect over describing steps the user must do by hand.
- ALWAYS emit a connect op between every pair of nodes that should pass data. A pipeline with no edges will not run.
- Use the exact handle ids from the catalog. If unsure, omit sourceHandle/targetHandle — the canvas will pick a type-compatible pair (image→image, video→video, text→prompt).
- Never connect an image or video port to a text/prompt handle.
- Typical pipelines:
  Image (image.in) → AI Image (image.gen, image→image) → Media Out (out.media, out→in)
  Image (image.in) → AI Video (video.gen, out→image) → Media Out (out.media, out→video)
  Text → AI Text (llm, out→in) → Output (out.text)
- Edit the existing workbook in place. Do not rebuild from scratch unless the user asks.
- When the user @mentions a node, update that node (or nodes connected to it) instead of rebuilding the whole graph.
- Prefer update_node over remove_node + add_node.
- Use last-run errors to decide what to fix.
- For image-edit workflows: Image (image.in) → AI Image (image.gen, connect image to the "image"/Reference handle, prompt to "prompt") → Media Out (out.media).
- Use stable short ids on add_node (e.g. "prompt1", "img1") and reference those same ids in connect/update/remove.
- Use the correct handle ids from the catalog. Connect matching types only (text→text, image→image).
- Media params (size, aspectRatio, duration, resolution, voice) are optional. Omit them unless the user asks — models have different supported values. Never invent a voice or size.
- Keep reply concise.
- Respond with one JSON object only, no markdown:
  { "reply": "short message to the user", "ops": [ ... ] }`;

        const chatModel =
          p.id === "openrouter"
            ? "google/gemini-2.5-flash"
            : "stealth/ox-alpha";
        const result = streamText({
          model: p.gw.chat(chatModel) as LanguageModel,
          system,
          messages: toModelMessages(body.messages),
        });

        let raw = "";
        let lastReply = "";
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            raw += part.text;
            const reply = extractReply(raw);
            if (reply.length > lastReply.length) {
              push({ type: "delta", text: reply.slice(lastReply.length) });
              lastReply = reply;
            }
          } else if (part.type === "error") {
            const err = part.error;
            throw err instanceof Error ? err : new Error(String(err));
          }
        }
        if (!raw.trim()) {
          raw = (await result.text) ?? "";
        }

        const parsed =
          parseAssistantOutput(extractJson(raw)) ??
          parseAssistantOutput({
            reply: extractReply(raw) || lastReply,
            ops: extractOps(raw),
          });
        if (parsed) {
          if (parsed.reply.length > lastReply.length) {
            push({
              type: "delta",
              text: parsed.reply.slice(lastReply.length),
            });
          } else if (!lastReply && parsed.reply) {
            push({ type: "delta", text: parsed.reply });
          }
          push({ type: "ops", ops: parsed.ops });
        } else if (lastReply) {
          push({ type: "ops", ops: [] });
        } else if (raw.trim()) {
          push({ type: "delta", text: raw.trim() });
          push({ type: "ops", ops: [] });
        } else {
          throw new Error("The assistant returned an empty response.");
        }
        push({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push({ type: "error", error: msg });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}
