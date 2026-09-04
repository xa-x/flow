import type { RunEvent } from "../types";

function asRunEvent(raw: unknown): RunEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type === "end") {
    const usage = o.usage as RunEvent extends { usage?: infer U } ? U : never;
    return {
      type: "run",
      runId: typeof o.runId === "string" ? o.runId : "",
      status: (typeof o.status === "string" ? o.status : "done") as
        | "done"
        | "error"
        | "cancelled"
        | "timed_out",
      usage:
        usage && typeof usage === "object"
          ? (usage as { totalCostUsd?: number; totalTokens?: number; durationMs?: number })
          : {
              totalCostUsd:
                typeof o.totalCostUsd === "number" ? o.totalCostUsd : undefined,
              totalTokens:
                typeof o.totalTokens === "number" ? o.totalTokens : undefined,
              durationMs:
                typeof o.durationMs === "number" ? o.durationMs : undefined,
            },
      ts: typeof o.ts === "number" ? o.ts : Date.now(),
    };
  }
  const payload =
    o.payload && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o;
  if (typeof payload.type !== "string") return null;
  return payload as unknown as RunEvent;
}

/**
 * Follow a durable run via SSE. Aborting the signal only disconnects
 * the listener — the server job keeps running.
 */
export async function watchRunEvents(
  runId: string,
  opts: {
    after?: number;
    signal?: AbortSignal;
    onEvent: (ev: RunEvent) => void;
  },
) {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/events?after=${opts.after ?? 0}`,
    {
      signal: opts.signal,
      headers: { accept: "text/event-stream" },
    },
  );
  if (!res.ok) {
    throw new Error(`Could not subscribe to run (${res.status})`);
  }
  if (!res.body) throw new Error("No event stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx = buf.indexOf("\n\n");
    while (idx >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) {
        try {
          const data = JSON.parse(dataLine.replace(/^data:\s?/, "")) as unknown;
          const ev = asRunEvent(data);
          if (ev) opts.onEvent(ev);
          if (
            data &&
            typeof data === "object" &&
            (data as { type?: string }).type === "end"
          ) {
            return;
          }
        } catch {
          /* skip malformed frame */
        }
      }
      idx = buf.indexOf("\n\n");
    }
  }
}
