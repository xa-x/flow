import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { graphs, runs, usageLedger } from "@/db/schema";
import { monthStart, planOf, PlanLimitError } from "../billing";
import { enqueueJob } from "../jobs";
import { newId } from "../ids";
import { snapshotWorkbook } from "../versions";
import type { GraphDoc, NodeOutput } from "../types";

export type RunTrigger = "manual" | "node" | "schedule" | "webhook" | "api" | "mcp";

export interface EnqueueInput {
  orgId: string;
  userId?: string;
  graphId: string;
  trigger: RunTrigger;
  only?: string;
  from?: string;
  cached?: Record<string, NodeOutput[]>;
  input?: Record<string, unknown>;
  idempotencyKey?: string;
  graphOverride?: GraphDoc;
  published?: boolean;
}

export async function countMonthlyRuns(orgId: string) {
  const since = new Date(monthStart());
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(runs)
    .where(and(eq(runs.orgId, orgId), gte(runs.createdAt, since)));
  return Number(rows[0]?.n ?? 0);
}

export async function enqueueRun(input: EnqueueInput, planId: string) {
  const plan = planOf(planId);
  if (input.trigger === "schedule" && !plan.schedules) {
    throw new PlanLimitError("Schedules are available on Pro and Team.");
  }
  if (input.trigger === "webhook" && !plan.webhooks) {
    throw new PlanLimitError("Webhooks are available on Pro and Team.");
  }
  if (input.trigger === "mcp" && !plan.mcp) {
    throw new PlanLimitError("MCP is available on Pro and Team.");
  }
  const used = await countMonthlyRuns(input.orgId);
  if (used >= plan.monthlyRuns) {
    throw new PlanLimitError(
      `This workspace reached its ${plan.monthlyRuns} monthly run limit.`,
    );
  }

  if (input.idempotencyKey) {
    const [hit] = await db
      .select()
      .from(runs)
      .where(
        and(eq(runs.orgId, input.orgId), eq(runs.idempotencyKey, input.idempotencyKey)),
      )
      .limit(1);
    if (hit) return { run: hit, reused: true };
  }

  if (!input.graphId) {
    throw Object.assign(new Error("graphId required"), { status: 400 });
  }
  const [graph] = await db
    .select()
    .from(graphs)
    .where(eq(graphs.id, input.graphId))
    .limit(1);
  if (!graph || graph.orgId !== input.orgId) {
    throw Object.assign(new Error("Workbook not found"), { status: 404 });
  }

  const snapshot =
    input.graphOverride ??
    (input.published && graph.publishedGraph
      ? (graph.publishedGraph as GraphDoc)
      : (graph.graph as GraphDoc));

  if (plan.versions && input.trigger === "manual") {
    await snapshotWorkbook(input.orgId, input.graphId, snapshot, "run", input.userId);
  }

  const runId = newId();
  const [run] = await db
    .insert(runs)
    .values({
      id: runId,
      orgId: input.orgId,
      graphId: input.graphId,
      status: "queued",
      trigger: input.trigger === "node" || input.only || input.from ? "node" : input.trigger,
      only: input.only ?? input.from ?? null,
      snapshot,
      input: {
        from: input.from,
        only: input.only,
        cached: input.cached ?? {},
        extra: input.input ?? {},
      },
      idempotencyKey: input.idempotencyKey ?? null,
      startedAt: new Date(),
    })
    .returning();

  await enqueueJob(input.orgId, "run", { runId });
  void import("./worker").then((m) => m.tickJobs());
  return { run: run!, reused: false };
}

export async function recordUsage(opts: {
  orgId: string;
  runId: string;
  amountUsd: number;
  tokens: number;
  model?: string;
  provider?: string;
}) {
  await db.insert(usageLedger).values({
    id: newId(),
    orgId: opts.orgId,
    runId: opts.runId,
    kind: "run",
    amountUsd: opts.amountUsd,
    tokens: opts.tokens,
    model: opts.model,
    provider: opts.provider,
  });
}
