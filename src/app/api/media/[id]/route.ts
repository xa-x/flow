import { NextRequest } from "next/server";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MEDIA_DIR } from "@/db";
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

  const stat = fs.statSync(file);
  const stream = fs.createReadStream(file);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "content-type": row.mimeType,
      "content-length": String(stat.size),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
