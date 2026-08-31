import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { newId } from "./ids";

export type JobKind = "run" | "schedule_tick";

export async function enqueueJob(
  orgId: string,
  kind: JobKind,
  payload: Record<string, unknown>,
  runAt = new Date(),
) {
  const id = newId(16);
  await db.insert(jobs).values({
    id,
    orgId,
    kind,
    payload,
    status: "queued",
    runAt,
  });
  return id;
}

export async function claimNextJob() {
  const now = new Date();
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "queued"), lte(jobs.runAt, now)))
    .limit(1);
  if (!row) return null;
  await db
    .update(jobs)
    .set({
      status: "running",
      attempts: row.attempts + 1,
      startedAt: now,
    })
    .where(eq(jobs.id, row.id));
  return { ...row, attempts: row.attempts + 1, status: "running" as const };
}

export async function finishJob(id: string, error?: string) {
  await db
    .update(jobs)
    .set({
      status: error ? "error" : "done",
      lastError: error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(jobs.id, id));
}
