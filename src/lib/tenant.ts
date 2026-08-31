import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { graphs, memberships, organizations } from "@/db/schema";
import type { MembershipRow, OrgRow } from "@/db/schema";

export class TenantError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "TenantError";
    this.status = status;
  }
}

export function assertOrgAccess(
  actorOrgId: string,
  resourceOrgId: string | null | undefined,
) {
  if (!resourceOrgId || resourceOrgId !== actorOrgId) {
    throw new TenantError("Not found", 404);
  }
}

export function canEdit(role: string) {
  return role === "owner" || role === "admin" || role === "editor";
}

export function canAdmin(role: string) {
  return role === "owner" || role === "admin";
}

export async function membershipFor(userId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function orgForUser(userId: string): Promise<{
  org: OrgRow;
  membership: MembershipRow;
} | null> {
  const [row] = await db
    .select({ org: organizations, membership: memberships })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function requireGraph(orgId: string, graphId: string) {
  const [row] = await db.select().from(graphs).where(eq(graphs.id, graphId)).limit(1);
  if (!row) throw new TenantError("Workbook not found", 404);
  assertOrgAccess(orgId, row.orgId);
  return row;
}
