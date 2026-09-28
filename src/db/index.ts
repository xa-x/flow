import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), ".data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const globalForDb = globalThis as unknown as { __flowbookDb?: Database.Database };

function hasColumn(db: Database.Database, table: string, column: string) {
  const cols = db.pragma(`table_info(${table})`) as { name: string }[];
  return cols.some((c) => c.name === column);
}

function addColumn(db: Database.Database, table: string, column: string, def: string) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL,
      password_hash text NOT NULL,
      name text DEFAULT 'Owner' NOT NULL,
      theme text DEFAULT 'system' NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);
    CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      token_hash text NOT NULL,
      expires_at integer NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token_hash);
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
    CREATE TABLE IF NOT EXISTS organizations (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      slug text NOT NULL,
      plan text DEFAULT 'free' NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      user_id text NOT NULL,
      role text DEFAULT 'owner' NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS memberships_org_user_idx ON memberships (org_id, user_id);
    CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);
    CREATE TABLE IF NOT EXISTS graphs (
      id text PRIMARY KEY NOT NULL,
      title text DEFAULT 'Untitled' NOT NULL,
      graph text DEFAULT '{}' NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id text PRIMARY KEY NOT NULL,
      graph_id text NOT NULL,
      status text DEFAULT 'queued' NOT NULL,
      trigger text DEFAULT 'manual' NOT NULL,
      only text,
      total_cost_usd integer DEFAULT 0 NOT NULL,
      total_tokens integer DEFAULT 0 NOT NULL,
      duration_ms integer,
      error text,
      started_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      finished_at integer,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_graph_idx ON runs (graph_id, started_at);
    CREATE TABLE IF NOT EXISTS run_nodes (
      id text PRIMARY KEY NOT NULL,
      run_id text NOT NULL,
      graph_id text NOT NULL,
      node_id text NOT NULL,
      status text DEFAULT 'idle' NOT NULL,
      output text,
      error text,
      model text,
      provider text,
      cost_usd integer DEFAULT 0 NOT NULL,
      tokens_in integer DEFAULT 0 NOT NULL,
      tokens_out integer DEFAULT 0 NOT NULL,
      duration_ms integer,
      started_at integer,
      finished_at integer,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS run_nodes_run_idx ON run_nodes (run_id);
    CREATE INDEX IF NOT EXISTS run_nodes_graph_idx ON run_nodes (graph_id, created_at);
    CREATE TABLE IF NOT EXISTS artifacts (
      id text PRIMARY KEY NOT NULL,
      run_id text,
      kind text NOT NULL,
      mime_type text NOT NULL,
      bytes integer NOT NULL,
      filename text NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS artifacts_run_idx ON artifacts (run_id);
    CREATE TABLE IF NOT EXISTS credentials (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      provider text NOT NULL,
      ciphertext text NOT NULL,
      iv text NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS credentials_org_provider_idx ON credentials (org_id, provider);
    CREATE TABLE IF NOT EXISTS workbook_versions (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      graph_id text NOT NULL,
      label text DEFAULT 'snapshot' NOT NULL,
      graph text NOT NULL,
      created_by text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS versions_graph_idx ON workbook_versions (graph_id, created_at);
    CREATE TABLE IF NOT EXISTS shares (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      graph_id text NOT NULL,
      token text NOT NULL,
      permission text DEFAULT 'view' NOT NULL,
      expires_at integer,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS shares_token_idx ON shares (token);
    CREATE INDEX IF NOT EXISTS shares_graph_idx ON shares (graph_id);
    CREATE TABLE IF NOT EXISTS schedules (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      graph_id text NOT NULL,
      cron_expr text NOT NULL,
      timezone text DEFAULT 'UTC' NOT NULL,
      enabled integer DEFAULT 1 NOT NULL,
      inputs text,
      last_run_at integer,
      next_run_at integer,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS schedules_next_idx ON schedules (enabled, next_run_at);
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      graph_id text NOT NULL,
      token text NOT NULL,
      secret text NOT NULL,
      enabled integer DEFAULT 1 NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS webhooks_token_idx ON webhook_endpoints (token);
    CREATE TABLE IF NOT EXISTS api_keys (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      user_id text NOT NULL,
      name text NOT NULL,
      token_hash text NOT NULL,
      prefix text NOT NULL,
      scopes text DEFAULT 'run,read' NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      last_used_at integer
    );
    CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (token_hash);
    CREATE TABLE IF NOT EXISTS run_events (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      run_id text NOT NULL,
      seq integer NOT NULL,
      type text NOT NULL,
      level text DEFAULT 'info' NOT NULL,
      node_id text,
      payload text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS run_events_run_idx ON run_events (run_id, seq);
    CREATE TABLE IF NOT EXISTS jobs (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      kind text NOT NULL,
      payload text NOT NULL,
      status text DEFAULT 'queued' NOT NULL,
      run_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      attempts integer DEFAULT 0 NOT NULL,
      last_error text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      started_at integer,
      finished_at integer
    );
    CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, run_at);
    CREATE TABLE IF NOT EXISTS usage_ledger (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      run_id text,
      kind text NOT NULL,
      amount_usd integer DEFAULT 0 NOT NULL,
      tokens integer DEFAULT 0 NOT NULL,
      model text,
      provider text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_org_idx ON usage_ledger (org_id, created_at);
    CREATE TABLE IF NOT EXISTS skills (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      source text DEFAULT 'local' NOT NULL,
      registry_id text,
      slug text NOT NULL,
      display_name text NOT NULL,
      description text DEFAULT '' NOT NULL,
      body text NOT NULL,
      installs integer DEFAULT 0 NOT NULL,
      created_by text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS skills_org_slug_idx ON skills (org_id, slug);
    CREATE INDEX IF NOT EXISTS skills_org_idx ON skills (org_id);
    CREATE TABLE IF NOT EXISTS templates (
      id text PRIMARY KEY NOT NULL,
      org_id text NOT NULL,
      graph_id text NOT NULL,
      slug text NOT NULL,
      title text NOT NULL,
      description text DEFAULT '' NOT NULL,
      tags text DEFAULT '[]' NOT NULL,
      workbook text NOT NULL,
      clone_count integer DEFAULT 0 NOT NULL,
      featured integer DEFAULT 0 NOT NULL,
      published_by text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS templates_slug_idx ON templates (slug);
    CREATE INDEX IF NOT EXISTS templates_featured_idx ON templates (featured, created_at);
  `);

  addColumn(db, "graphs", "org_id", "text DEFAULT '' NOT NULL");
  addColumn(db, "graphs", "owner_id", "text");
  addColumn(db, "graphs", "published_graph", "text");
  addColumn(db, "graphs", "version", "integer DEFAULT 1 NOT NULL");
  addColumn(db, "graphs", "visibility", "text DEFAULT 'private' NOT NULL");
  addColumn(db, "runs", "org_id", "text DEFAULT '' NOT NULL");
  addColumn(db, "runs", "snapshot", "text");
  addColumn(db, "runs", "input", "text");
  addColumn(db, "runs", "idempotency_key", "text");
  addColumn(db, "runs", "cancel_requested", "integer DEFAULT 0 NOT NULL");
  addColumn(db, "runs", "heartbeat_at", "integer");
  addColumn(db, "run_nodes", "org_id", "text DEFAULT '' NOT NULL");
  addColumn(db, "artifacts", "org_id", "text DEFAULT '' NOT NULL");
}

function openDb(): Database.Database {
  const db = new Database(path.join(DATA_DIR, "flowbook.db"));
  db.pragma("journal_mode = WAL");
  ensureSchema(db);
  return db;
}

const sqlite = globalForDb.__flowbookDb ?? openDb();
ensureSchema(sqlite);
if (process.env.NODE_ENV !== "production") globalForDb.__flowbookDb = sqlite;

export const rawSqlite = sqlite;
export const db = drizzle(sqlite, { schema });
