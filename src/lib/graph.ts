/** Graph helpers safe for the browser — no Node built-ins. */

/** This node plus everything reachable downstream. */
export function downstreamIds(
  start: string,
  edges: { source: string; target: string }[],
): string[] {
  const out = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const id = q.shift()!;
    for (const e of edges) {
      if (e.source === id && !out.has(e.target)) {
        out.add(e.target);
        q.push(e.target);
      }
    }
  }
  return [...out];
}
