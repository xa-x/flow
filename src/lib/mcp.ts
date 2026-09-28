import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, runs, runEvents } from "@/db/schema";
import { enqueueRun } from "./runs/enqueue";
import { canEdit } from "./tenant";
import { toPortable } from "./portable";
import { emptyGraph, starterGraph } from "./starter";
import { newId } from "./ids";
import type { Actor } from "./auth";
import type { GraphDoc } from "./types";

const setInputs = z.object({
  graphId: z.string(),
  values: z.record(z.string(), z.unknown()),
});

export const MCP_TOOLS = [
  {
    name: "list_workbooks",
    description: "List workbooks in the current workspace",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_workbook",
    description: "Get a workbook document by id",
    inputSchema: {
      type: "object",
      properties: { graphId: { type: "string" } },
      required: ["graphId"],
    },
  },
  {
    name: "create_workbook",
    description: "Create a workbook. mode=blank|starter",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        mode: { type: "string", enum: ["blank", "starter"] },
      },
    },
  },
  {
    name: "fork_workbook",
    description: "Duplicate a workbook",
    inputSchema: {
      type: "object",
      properties: { graphId: { type: "string" }, title: { type: "string" } },
      required: ["graphId"],
    },
  },
  {
    name: "run_workbook",
    description: "Enqueue a durable run",
    inputSchema: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        from: { type: "string" },
        only: { type: "string" },
      },
      required: ["graphId"],
    },
  },
  {
    name: "cancel_run",
    description: "Cancel a queued or running execution",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
    },
  },
  {
    name: "get_run_status",
    description: "Get run status and recent log lines",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
    },
  },
  {
    name: "set_inputs",
    description: "Set text/prompt fields on input nodes by node id",
    inputSchema: {
      type: "object",
      properties: {
        graphId: { type: "string" },
        values: { type: "object", additionalProperties: true },
      },
      required: ["graphId", "values"],
    },
  },
] as const;

export async function callMcpTool(
  actor: Actor,
  name: string,
  args: Record<string, unknown>,
) {
  const orgId = actor.org.id;
  switch (name) {
    case "list_workbooks": {
      const rows = await db
        .select()
        .from(graphs)
        .where(eq(graphs.orgId, orgId))
        .orderBy(desc(graphs.updatedAt));
      return rows.map((g) => ({ id: g.id, title: g.title, updatedAt: g.updatedAt }));
    }
    case "get_workbook": {
      const id = String(args.graphId ?? "");
      const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
      if (!g || g.orgId !== orgId) throw new Error("Workbook not found");
      return { id: g.id, title: g.title, graph: g.graph };
    }
    case "create_workbook": {
      if (!canEdit(actor.membership.role)) throw new Error("Forbidden");
      const id = newId();
      const mode = args.mode === "blank" ? emptyGraph() : starterGraph();
      await db.insert(graphs).values({
        id,
        orgId,
        ownerId: actor.user.id,
        title: typeof args.title === "string" ? args.title : "Untitled",
        graph: mode,
      });
      return { id };
    }
    case "fork_workbook": {
      if (!canEdit(actor.membership.role)) throw new Error("Forbidden");
      const id = String(args.graphId ?? "");
      const [g] = await db.select().from(graphs).where(eq(graphs.id, id)).limit(1);
      if (!g || g.orgId !== orgId) throw new Error("Workbook not found");
      const next = newId();
      const portable = toPortable(g.graph as GraphDoc, { title: g.title });
      await db.insert(graphs).values({
        id: next,
        orgId,
        ownerId: actor.user.id,
        title:
          typeof args.title === "string"
            ? args.title
            : `${g.title || "Untitled"} copy`,
        graph: { nodes: portable.nodes, edges: portable.edges },
      });
      return { id: next };
    }
    case "run_workbook": {
      const graphId = String(args.graphId ?? "");
      const { run } = await enqueueRun(
        {
          orgId,
          userId: actor.user.id,
          graphId,
          trigger: "mcp",
          from: typeof args.from === "string" ? args.from : undefined,
          only: typeof args.only === "string" ? args.only : undefined,
        },
        actor.org.plan,
      );
      return { runId: run.id, status: run.status };
    }
    case "cancel_run": {
      const runId = String(args.runId ?? "");
      const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
      if (!run || run.orgId !== orgId) throw new Error("Run not found");
      await db
        .update(runs)
        .set({ cancelRequested: 1, status: run.status === "queued" ? "cancelled" : run.status })
        .where(eq(runs.id, runId));
      return { ok: true };
    }
    case "get_run_status": {
      const runId = String(args.runId ?? "");
      const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
      if (!run || run.orgId !== orgId) throw new Error("Run not found");
      const events = await db
        .select()
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(runEvents.seq);
      return {
        id: run.id,
        status: run.status,
        error: run.error,
        durationMs: run.durationMs,
        events: events.slice(-40).map((e) => ({
          seq: e.seq,
          type: e.type,
          nodeId: e.nodeId,
          level: e.level,
        })),
      };
    }
    case "set_inputs": {
      if (!canEdit(actor.membership.role)) throw new Error("Forbidden");
      const parsed = setInputs.parse(args);
      const [g] = await db
        .select()
        .from(graphs)
        .where(eq(graphs.id, parsed.graphId))
        .limit(1);
      if (!g || g.orgId !== orgId) throw new Error("Workbook not found");
      const doc = g.graph as GraphDoc;
      const nodes = doc.nodes.map((n) => {
        const v = parsed.values[n.id];
        if (v === undefined) return n;
        const text = typeof v === "string" ? v : JSON.stringify(v);
        return {
          ...n,
          data: {
            ...n.data,
            ...(n.data.kind === "text" || n.data.kind === "note" || n.data.kind === "skill"
              ? { text }
              : { prompt: text }),
          },
        };
      });
      await db
        .update(graphs)
        .set({ graph: { ...doc, nodes }, updatedAt: new Date() })
        .where(eq(graphs.id, g.id));
      return { ok: true };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
