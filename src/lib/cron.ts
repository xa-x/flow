import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { organizations, schedules } from "@/db/schema";
import { enqueueRun } from "./runs/enqueue";

/** Minimal 5-field cron: m h dom mon dow. Supports * and N. */
export function nextCron(expr: string, from = new Date()): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Cron must be 5 fields: m h dom mon dow");
  const [min, hour, dom, mon, dow] = parts.map(parseField);
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (
      matchField(min, d.getUTCMinutes()) &&
      matchField(hour, d.getUTCHours()) &&
      matchField(dom, d.getUTCDate()) &&
      matchField(mon, d.getUTCMonth() + 1) &&
      matchField(dow, d.getUTCDay())
    ) {
      return d;
    }
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  throw new Error("Could not resolve next cron time");
}

function parseField(field: string): number[] | null {
  if (field === "*") return null;
  return field.split(",").flatMap((part) => {
    if (part.includes("/")) {
      const [range, stepS] = part.split("/");
      const step = Number(stepS);
      const [a, b] = range === "*" ? [0, 59] : range.split("-").map(Number);
      const out: number[] = [];
      for (let n = a; n <= b; n += step) out.push(n);
      return out;
    }
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      const out: number[] = [];
      for (let n = a; n <= b; n++) out.push(n);
      return out;
    }
    return [Number(part)];
  });
}

function matchField(allowed: number[] | null, value: number) {
  return !allowed || allowed.includes(value);
}

export async function tickSchedules() {
  const due = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, 1), lte(schedules.nextRunAt, new Date())));
  for (const row of due) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, row.orgId))
      .limit(1);
    try {
      await enqueueRun(
        {
          orgId: row.orgId,
          graphId: row.graphId,
          trigger: "schedule",
          published: true,
          input: (row.inputs as Record<string, unknown>) ?? {},
          idempotencyKey: `sched:${row.id}:${row.nextRunAt?.getTime() ?? Date.now()}`,
        },
        org?.plan ?? "free",
      );
    } catch (e) {
      console.error("[cron] enqueue failed", row.id, e);
    }
    let next: Date;
    try {
      next = nextCron(row.cronExpr, new Date());
    } catch {
      next = new Date(Date.now() + 86_400_000);
    }
    await db
      .update(schedules)
      .set({ lastRunAt: new Date(), nextRunAt: next })
      .where(eq(schedules.id, row.id));
  }
}
