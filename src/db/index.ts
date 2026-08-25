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

function openDb(): Database.Database {
  const db = new Database(path.join(DATA_DIR, "flowbook.db"));
  db.pragma("journal_mode = WAL");
  return db;
}

const sqlite = globalForDb.__flowbookDb ?? openDb();
if (process.env.NODE_ENV !== "production") globalForDb.__flowbookDb = sqlite;

export const db = drizzle(sqlite, { schema });
