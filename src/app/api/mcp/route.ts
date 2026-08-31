import { NextRequest, NextResponse } from "next/server";
import { fail, requireActor } from "@/lib/auth";
import { callMcpTool, MCP_TOOLS } from "@/lib/mcp";
import { planOf } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!planOf(actor.org.plan).mcp) {
      return NextResponse.json({ error: "MCP is available on Pro and Team." }, { status: 402 });
    }
    return NextResponse.json({
      name: "flowbook",
      version: "0.1.0",
      tools: MCP_TOOLS,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
    if (!planOf(actor.org.plan).mcp) {
      return NextResponse.json({ error: "MCP is available on Pro and Team." }, { status: 402 });
    }
    const body = await req.json().catch(() => ({}));
    const method = String(body.method ?? body.name ?? "");
    if (method === "tools/list" || method === "list") {
      return NextResponse.json({ tools: MCP_TOOLS });
    }
    const name = String(body.params?.name ?? body.tool ?? method);
    const args = (body.params?.arguments ?? body.arguments ?? body.params ?? {}) as Record<
      string,
      unknown
    >;
    const result = await callMcpTool(actor, name.replace(/^tools\/call:?/, ""), args);
    return NextResponse.json({ result });
  } catch (e) {
    return fail(e);
  }
}
