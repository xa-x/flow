import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, webhookEndpoints } from "@/db/schema";
import { enqueueRun } from "@/lib/runs/enqueue";
import { PlanLimitError } from "@/lib/billing";
import { ensureJobLoop } from "@/lib/runs/worker";

export const runtime = "nodejs";

function validSig(secret: string, raw: string, header: string | null) {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.replace(/^sha256=/, "");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  } catch {
    return header === secret;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  ensureJobLoop();
  const { token } = await params;
  const [hook] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.token, token))
    .limit(1);
  if (!hook || !hook.enabled) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const raw = await req.text();
  const auth = req.headers.get("x-flowbook-signature") ?? req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!validSig(hook.secret, raw, bearer) && bearer !== hook.secret) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, hook.orgId))
    .limit(1);
  try {
    const { run } = await enqueueRun(
      {
        orgId: hook.orgId,
        graphId: hook.graphId,
        trigger: "webhook",
        published: true,
        input: body,
        idempotencyKey:
          typeof body.idempotencyKey === "string"
            ? body.idempotencyKey
            : req.headers.get("idempotency-key") ?? undefined,
      },
      org?.plan ?? "free",
    );
    return NextResponse.json({ runId: run.id, status: run.status }, { status: 202 });
  } catch (e) {
    if (e instanceof PlanLimitError) {
      return NextResponse.json({ error: e.message }, { status: 402 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "enqueue failed" },
      { status: 500 },
    );
  }
}
