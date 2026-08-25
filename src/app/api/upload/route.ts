import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { saveArtifact, newId } from "@/lib/artifacts";

export const runtime = "nodejs";

/**
 * POST /api/upload — multipart form: file=<binary>
 * Saves to media store + artifacts row, returns { id, url }.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const mime =
    file.type ||
    (file.name.endsWith(".png")
      ? "image/png"
      : file.name.endsWith(".mp4")
        ? "video/mp4"
        : "application/octet-stream");

  const kind = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("audio/")
      ? "audio"
      : mime.startsWith("video/")
        ? "video"
        : null;
  if (!kind) {
    return NextResponse.json(
      { error: `unsupported type: ${mime}` },
      { status: 415 },
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const art = await saveArtifact(buf, mime, kind);
  return NextResponse.json({ id: art.id, url: `/api/media/${art.id}` });
}

export async function GET() {
  const rows = await db.select().from(artifacts);
  return NextResponse.json({ artifacts: rows });
}
