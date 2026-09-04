import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs } from "@/db/schema";
import { mergeNodeRuntime } from "../graph";
import type { GraphDoc, NodeOutput, RunStatus, UsageInfo } from "../types";

/** Write a node's run result into the saved workbook so closing the browser doesn't drop it. */
export async function writeNodeOutputToGraph(
  graphId: string,
  nodeId: string,
  patch: {
    outputs?: NodeOutput[];
    runStatus?: RunStatus;
    runError?: string | null;
    runUsage?: UsageInfo;
  },
) {
  if (!graphId) return;
  const [row] = await db.select().from(graphs).where(eq(graphs.id, graphId)).limit(1);
  if (!row) return;
  const doc = (row.graph ?? { nodes: [], edges: [] }) as GraphDoc;
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    if (n.id !== nodeId) return n;
    changed = true;
    return {
      ...n,
      data: mergeNodeRuntime(n.data, {
        outputs: patch.outputs,
        runStatus: patch.runStatus,
        runError: patch.runError ?? undefined,
        runUsage: patch.runUsage,
      }),
    };
  });
  if (!changed) return;
  await db
    .update(graphs)
    .set({ graph: { ...doc, nodes }, updatedAt: new Date() })
    .where(eq(graphs.id, graphId));
}
