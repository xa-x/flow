import { NextRequest, NextResponse } from "next/server";
import { fail, requireActor } from "@/lib/auth";
import { saveArtifact } from "@/lib/artifacts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(req);
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
      return NextResponse.json({ error: `unsupported type: ${mime}` }, { status: 415 });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const art = await saveArtifact(buf, mime, kind, undefined, actor.org.id);
    return NextResponse.json({ id: art.id, url: `/api/media/${art.id}` });
  } catch (e) {
    return fail(e);
  }
}
