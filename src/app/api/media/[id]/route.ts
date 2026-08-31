import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { ensureActor } from "@/lib/auth";
import { objectStore } from "@/lib/storage";
import { ensurePlayableAudio } from "@/lib/audio";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
  if (!row) return new Response("not found", { status: 404 });
  try {
    const actor = await ensureActor(req);
    if (row.orgId && row.orgId !== actor.org.id) {
      return new Response("not found", { status: 404 });
    }
  } catch {
    return new Response("unauthorized", { status: 401 });
  }

  const raw = await objectStore.get(row.filename);
  if (!raw) return new Response("gone", { status: 410 });

  const playable =
    row.kind === "audio"
      ? ensurePlayableAudio(raw, row.mimeType)
      : { data: raw, mime: row.mimeType };
  return new Response(Buffer.from(playable.data), {
    headers: {
      "content-type": playable.mime,
      "content-length": String(playable.data.byteLength),
      "cache-control":
        row.kind === "audio"
          ? "private, max-age=60, must-revalidate"
          : "private, max-age=31536000, immutable",
    },
  });
}
