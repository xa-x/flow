import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  apiKeys,
  memberships,
  organizations,
  sessions,
  users,
} from "@/db/schema";
import { hashPassword, hashToken, verifyPassword } from "./crypto";
import { newId, newToken } from "./ids";
import { orgForUser, type TenantError } from "./tenant";
import type { MembershipRow, OrgRow, UserRow } from "@/db/schema";

export const SESSION_COOKIE = "fb_session";
const SESSION_DAYS = 30;

export interface Actor {
  user: UserRow;
  org: OrgRow;
  membership: MembershipRow;
  via: "session" | "api_key" | "local";
}

function cookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function createSession(userId: string) {
  const token = newToken(24);
  const id = newId();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({
    id,
    userId,
    tokenHash: hashToken(token),
    expiresAt: expires,
  });
  return token;
}

export async function signup(email: string, password: string, name?: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@") || password.length < 6) {
    throw Object.assign(new Error("Valid email and 6+ character password required"), {
      status: 400,
    });
  }
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (existing) {
    throw Object.assign(new Error("Email already registered"), { status: 409 });
  }
  const userId = newId();
  const orgId = newId();
  await db.insert(users).values({
    id: userId,
    email: normalized,
    passwordHash: hashPassword(password),
    name: name?.trim() || normalized.split("@")[0],
  });
  await db.insert(organizations).values({
    id: orgId,
    name: "Personal",
    slug: `org-${orgId}`,
    plan: "free",
  });
  await db.insert(memberships).values({
    id: newId(),
    orgId,
    userId,
    role: "owner",
  });
  return { userId, orgId, token: await createSession(userId) };
}

export async function login(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }
  return { user, token: await createSession(user.id) };
}

export async function bootstrapLocalOwner() {
  const existing = await db.select().from(users).limit(1);
  if (existing[0]) {
    const ctx = await orgForUser(existing[0].id);
    return { user: existing[0], org: ctx?.org ?? null, membership: ctx?.membership ?? null };
  }
  const userId = newId();
  const orgId = newId();
  await db.insert(users).values({
    id: userId,
    email: "local@flowbook.dev",
    passwordHash: hashPassword(newToken(16)),
    name: "Local",
    theme: "system",
  });
  await db.insert(organizations).values({
    id: orgId,
    name: "Personal",
    slug: "personal",
    plan: "pro",
  });
  await db.insert(memberships).values({
    id: newId(),
    orgId,
    userId,
    role: "owner",
  });
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  return { user: user!, org: org!, membership: membership! };
}

export async function backfillOrphanRows(orgId: string, ownerId: string) {
  const sqlite = (await import("@/db")).rawSqlite;
  sqlite
    .prepare("UPDATE graphs SET org_id = ?, owner_id = COALESCE(owner_id, ?) WHERE org_id = '' OR org_id IS NULL")
    .run(orgId, ownerId);
  sqlite.prepare("UPDATE runs SET org_id = ? WHERE org_id = '' OR org_id IS NULL").run(orgId);
  sqlite.prepare("UPDATE run_nodes SET org_id = ? WHERE org_id = '' OR org_id IS NULL").run(orgId);
  sqlite.prepare("UPDATE artifacts SET org_id = ? WHERE org_id = '' OR org_id IS NULL").run(orgId);
}

async function actorFromToken(token: string): Promise<Actor | null> {
  const [sess] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())),
    )
    .limit(1);
  if (!sess) return null;
  const [user] = await db.select().from(users).where(eq(users.id, sess.userId)).limit(1);
  if (!user) return null;
  const ctx = await orgForUser(user.id);
  if (!ctx) return null;
  return { user, org: ctx.org, membership: ctx.membership, via: "session" };
}

async function actorFromApiKey(raw: string): Promise<Actor | null> {
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.tokenHash, hashToken(raw)))
    .limit(1);
  if (!key) return null;
  const [user] = await db.select().from(users).where(eq(users.id, key.userId)).limit(1);
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, key.orgId))
    .limit(1);
  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, key.userId), eq(memberships.orgId, key.orgId)))
    .limit(1);
  if (!user || !org || !membership) return null;
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));
  return { user, org, membership, via: "api_key" };
}

export async function resolveActor(req?: NextRequest): Promise<Actor | null> {
  const header = req?.headers.get("authorization");
  if (header?.startsWith("Bearer fb_")) {
    const viaKey = await actorFromApiKey(header.slice(7));
    if (viaKey) return viaKey;
  }
  const cookieStore = req
    ? undefined
    : await cookies();
  const token =
    req?.cookies.get(SESSION_COOKIE)?.value ?? cookieStore?.get(SESSION_COOKIE)?.value;
  if (token) {
    const viaSess = await actorFromToken(token);
    if (viaSess) return viaSess;
  }
  return null;
}

/** Local-first: if nobody is signed in, provision a personal workspace. */
export async function ensureActor(req?: NextRequest): Promise<Actor> {
  const existing = await resolveActor(req);
  if (existing) {
    await backfillOrphanRows(existing.org.id, existing.user.id);
    return existing;
  }
  const boot = await bootstrapLocalOwner();
  if (!boot.org || !boot.membership) {
    throw Object.assign(new Error("Could not provision workspace"), { status: 500 });
  }
  await backfillOrphanRows(boot.org.id, boot.user.id);
  return { user: boot.user, org: boot.org, membership: boot.membership, via: "local" };
}

export async function requireActor(req?: NextRequest): Promise<Actor> {
  return ensureActor(req);
}

export function attachSession(res: NextResponse, token: string) {
  res.cookies.set(cookieOptions(token));
  return res;
}

export async function destroySession(req?: NextRequest) {
  const cookieStore = req ? undefined : await cookies();
  const token =
    req?.cookies.get(SESSION_COOKIE)?.value ?? cookieStore?.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
}

export function publicActor(actor: Actor) {
  return {
    user: { id: actor.user.id, email: actor.user.email, name: actor.user.name, theme: actor.user.theme },
    org: { id: actor.org.id, name: actor.org.name, plan: actor.org.plan },
    role: actor.membership.role,
  };
}

export function fail(err: unknown) {
  const status =
    typeof err === "object" && err && "status" in err
      ? Number((err as TenantError).status) || 500
      : 500;
  const message = err instanceof Error ? err.message : "Request failed";
  return NextResponse.json({ error: message }, { status });
}
