import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default("Owner"),
  theme: text("theme").notNull().default("system"), // light|dark|system
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("sessions_token_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  plan: text("plan").notNull().default("free"), // free|pro|team
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("owner"), // owner|admin|editor|viewer
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/**
 * One row per workbook (a canvas of nodes/edges).
 * `graph` stores the full React Flow document: { nodes, edges, viewport }.
 */
export const graphs = sqliteTable(
  "graphs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().default(""),
    ownerId: text("owner_id"),
    title: text("title").notNull().default("Untitled"),
    graph: text("graph", { mode: "json" }).notNull().default(sql`'{}'`),
    publishedGraph: text("published_graph", { mode: "json" }),
    version: integer("version").notNull().default(1),
    visibility: text("visibility").notNull().default("private"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("graphs_org_idx").on(t.orgId, t.updatedAt)],
);

/**
 * One row per graph execution (whole canvas or single node).
 */
export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().default(""),
    graphId: text("graph_id").notNull(),
    status: text("status").notNull().default("queued"),
    trigger: text("trigger").notNull().default("manual"),
    only: text("only"),
    snapshot: text("snapshot", { mode: "json" }),
    input: text("input", { mode: "json" }),
    idempotencyKey: text("idempotency_key"),
    cancelRequested: integer("cancel_requested").notNull().default(0),
    heartbeatAt: integer("heartbeat_at", { mode: "timestamp_ms" }),
    totalCostUsd: integer("total_cost_usd").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(now),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("runs_graph_idx").on(t.graphId, t.startedAt),
    index("runs_org_idx").on(t.orgId, t.startedAt),
    index("runs_idem_idx").on(t.orgId, t.idempotencyKey),
  ],
);

export const runNodes = sqliteTable(
  "run_nodes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().default(""),
    runId: text("run_id").notNull(),
    graphId: text("graph_id").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull().default("idle"),
    output: text("output", { mode: "json" }),
    error: text("error"),
    model: text("model"),
    provider: text("provider"),
    costUsd: integer("cost_usd").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    durationMs: integer("duration_ms"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("run_nodes_run_idx").on(t.runId),
    index("run_nodes_graph_idx").on(t.graphId, t.createdAt),
  ],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    runId: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    level: text("level").notNull().default("info"),
    nodeId: text("node_id"),
    payload: text("payload", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("run_events_run_idx").on(t.runId, t.seq)],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().default(""),
    runId: text("run_id"),
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    filename: text("filename").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("artifacts_run_idx").on(t.runId), index("artifacts_org_idx").on(t.orgId)],
);

export const credentials = sqliteTable(
  "credentials",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("credentials_org_provider_idx").on(t.orgId, t.provider)],
);

export const workbookVersions = sqliteTable(
  "workbook_versions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    graphId: text("graph_id").notNull(),
    label: text("label").notNull().default("snapshot"),
    graph: text("graph", { mode: "json" }).notNull(),
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("versions_graph_idx").on(t.graphId, t.createdAt)],
);

export const shares = sqliteTable(
  "shares",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    graphId: text("graph_id").notNull(),
    token: text("token").notNull(),
    permission: text("permission").notNull().default("view"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("shares_token_idx").on(t.token), index("shares_graph_idx").on(t.graphId)],
);

export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    graphId: text("graph_id").notNull(),
    cronExpr: text("cron_expr").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: integer("enabled").notNull().default(1),
    inputs: text("inputs", { mode: "json" }),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("schedules_next_idx").on(t.enabled, t.nextRunAt)],
);

export const webhookEndpoints = sqliteTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    graphId: text("graph_id").notNull(),
    token: text("token").notNull(),
    secret: text("secret").notNull(),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [uniqueIndex("webhooks_token_idx").on(t.token)],
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    scopes: text("scopes").notNull().default("run,read"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.tokenHash)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    kind: text("kind").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    status: text("status").notNull().default("queued"),
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull().default(now),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.runAt)],
);

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    source: text("source").notNull().default("local"), // builtin|registry|local
    registryId: text("registry_id"),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    body: text("body").notNull(),
    installs: integer("installs").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("skills_org_slug_idx").on(t.orgId, t.slug),
    index("skills_org_idx").on(t.orgId),
  ],
);

export const templates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    graphId: text("graph_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags", { mode: "json" }).notNull().default(sql`'[]'`),
    workbook: text("workbook", { mode: "json" }).notNull(),
    cloneCount: integer("clone_count").notNull().default(0),
    featured: integer("featured").notNull().default(0),
    publishedBy: text("published_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("templates_slug_idx").on(t.slug),
    index("templates_featured_idx").on(t.featured, t.createdAt),
  ],
);

export const usageLedger = sqliteTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    runId: text("run_id"),
    kind: text("kind").notNull(),
    amountUsd: integer("amount_usd").notNull().default(0),
    tokens: integer("tokens").notNull().default(0),
    model: text("model"),
    provider: text("provider"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("usage_org_idx").on(t.orgId, t.createdAt)],
);

export type GraphRow = typeof graphs.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type RunNodeRow = typeof runNodes.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type OrgRow = typeof organizations.$inferSelect;
export type MembershipRow = typeof memberships.$inferSelect;
export type SkillRow = typeof skills.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
