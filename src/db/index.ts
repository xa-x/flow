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

function ensureSchema(db: Database.Database) {
  db.exec(`
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
      status text DEFAULT 'running' NOT NULL,
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
  `);
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

export const db = drizzle(sqlite, { schema });
