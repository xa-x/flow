import { NextRequest } from "next/server";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MEDIA_DIR } from "@/db";
import { ensurePlayableAudio } from "@/lib/audio";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";

/** GET /api/media/[id] — stream a stored artifact. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [row] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);
  if (!row) return new Response("not found", { status: 404 });

  const file = path.join(MEDIA_DIR, row.filename);
  if (!fs.existsSync(file)) return new Response("gone", { status: 410 });

  const raw = new Uint8Array(fs.readFileSync(file));
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
          ? "public, max-age=60, must-revalidate"
          : "public, max-age=31536000, immutable",
    },
  });
}
