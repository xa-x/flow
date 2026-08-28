import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One row per workbook (a canvas of nodes/edges).
 * `graph` stores the full React Flow document: { nodes, edges, viewport }.
 */
export const graphs = sqliteTable("graphs", {
  id: text("id").primaryKey(), // nanoid
  title: text("title").notNull().default("Untitled"),
  graph: text("graph", { mode: "json" }).notNull().default(sql`'{}'`),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * One row per graph execution (whole canvas or single node).
 * Aggregates status + cost across its run_nodes.
 */
export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(), // nanoid
    graphId: text("graph_id").notNull(),
    status: text("status").notNull().default("running"), // running|done|error|cancelled
    trigger: text("trigger").notNull().default("manual"), // manual|node
    only: text("only"), // nodeId when single-node run
    totalCostUsd: integer("total_cost_usd").notNull().default(0), // micro-dollars
    totalTokens: integer("total_tokens").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("runs_graph_idx").on(t.graphId, t.startedAt)],
);

/**
 * One row per executed node inside a run. `output` caches the last
 * execution so the canvas can replay outputs without re-running.
 */
export const runNodes = sqliteTable(
  "run_nodes",
  {
    id: text("id").primaryKey(), // `${runId}:${nodeId}`
    runId: text("run_id").notNull(),
    graphId: text("graph_id").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull().default("idle"), // running|done|error|skipped
    output: text("output", { mode: "json" }),
    error: text("error"),
    model: text("model"),
    provider: text("provider"),
    costUsd: integer("cost_usd").notNull().default(0), // micro-dollars
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    durationMs: integer("duration_ms"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("run_nodes_run_idx").on(t.runId),
    index("run_nodes_graph_idx").on(t.graphId, t.createdAt),
  ],
);

/**
 * Binary artifacts produced or uploaded (images / audio / video).
 * Stored on disk under .data/media, served by /api/media/[id].
 */
export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(), // nanoid
    runId: text("run_id"),
    kind: text("kind").notNull(), // image | audio | video
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    filename: text("filename").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("artifacts_run_idx").on(t.runId)],
);

export type GraphRow = typeof graphs.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type RunNodeRow = typeof runNodes.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
