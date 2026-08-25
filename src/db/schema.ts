import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One row per workbook (a canvas of nodes/edges).
 * `graph` stores the full React Flow document: { nodes: [...], edges: [...], viewport: {...} }.
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
 * One row per executed node (a node that was run with concrete inputs).
 * `inputs` / `output` cache the last execution so the canvas can replay
 * outputs without re-running everything.
 */
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(), // `${graphId}:${nodeId}:${ts}` or nanoid
  graphId: text("graph_id").notNull(),
  nodeId: text("node_id").notNull(),
  status: text("status").notNull().default("idle"), // queued|running|done|error
  inputs: text("inputs", { mode: "json" }),
  output: text("output", { mode: "json" }),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Binary artifacts produced by nodes (images / audio / video).
 * Stored on disk under .data/media, served by /api/media/[id].
 */
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(), // nanoid
  runId: text("run_id"),
  kind: text("kind").notNull(), // image | audio | video
  mimeType: text("mime_type").notNull(),
  bytes: integer("bytes").notNull(),
  filename: text("filename").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type GraphRow = typeof graphs.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
