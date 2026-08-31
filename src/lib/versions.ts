import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, workbookVersions } from "@/db/schema";
import { newId } from "./ids";
import type { GraphDoc } from "./types";

export async function snapshotWorkbook(
  orgId: string,
  graphId: string,
  graph: GraphDoc,
  label: string,
  createdBy?: string,
) {
  const id = newId();
  await db.insert(workbookVersions).values({
    id,
    orgId,
    graphId,
    label,
    graph,
    createdBy: createdBy ?? null,
  });
  return id;
}

export async function listVersions(graphId: string, limit = 30) {
  return db
    .select({
      id: workbookVersions.id,
      label: workbookVersions.label,
      createdAt: workbookVersions.createdAt,
      createdBy: workbookVersions.createdBy,
    })
    .from(workbookVersions)
    .where(eq(workbookVersions.graphId, graphId))
    .orderBy(desc(workbookVersions.createdAt))
    .limit(limit);
}

export async function restoreVersion(orgId: string, graphId: string, versionId: string) {
  const [row] = await db
    .select()
    .from(workbookVersions)
    .where(eq(workbookVersions.id, versionId))
    .limit(1);
  if (!row || row.orgId !== orgId || row.graphId !== graphId) return null;
  const [current] = await db.select().from(graphs).where(eq(graphs.id, graphId)).limit(1);
  if (current?.graph) {
    await snapshotWorkbook(orgId, graphId, current.graph as GraphDoc, "before-restore");
  }
  await db
    .update(graphs)
    .set({
      graph: row.graph,
      version: (current?.version ?? 1) + 1,
      updatedAt: new Date(),
    })
    .where(eq(graphs.id, graphId));
  return row.graph as GraphDoc;
}
