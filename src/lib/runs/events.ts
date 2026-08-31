import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { runEvents } from "@/db/schema";
import { newId } from "../ids";
import { redactPayload } from "../redact";

export { redactPayload };

export interface StoredRunEvent {
  seq: number;
  type: string;
  level: string;
  nodeId?: string | null;
  payload: Record<string, unknown>;
  ts: number;
}

export async function nextSeq(runId: string) {
  const rows = await db
    .select({ seq: runEvents.seq })
    .from(runEvents)
    .where(eq(runEvents.runId, runId));
  return rows.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
}

export async function appendEvent(
  orgId: string,
  runId: string,
  ev: Omit<StoredRunEvent, "seq"> & { seq?: number },
) {
  const seq = ev.seq ?? (await nextSeq(runId));
  const payload = redactPayload(ev.payload ?? {});
  await db.insert(runEvents).values({
    id: newId(16),
    orgId,
    runId,
    seq,
    type: ev.type,
    level: ev.level ?? "info",
    nodeId: ev.nodeId ?? null,
    payload,
    createdAt: new Date(ev.ts || Date.now()),
  });
  return { ...ev, seq, payload };
}

export async function eventsAfter(runId: string, after = 0) {
  return db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, after)))
    .orderBy(runEvents.seq);
}
