import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { execFileSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { newId } from "./ids";
import { mediaKey, objectStore } from "./storage";

export { newId };

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function sniffMime(buf: Uint8Array, fallback: string): string {
  if (buf.length >= 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
      return "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    const riff = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    const four = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (riff === "RIFF" && four === "WEBP") return "image/webp";
    if (riff === "RIFF" && four === "WAVE") return "audio/wav";
    const tag = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
    if (tag === "ftyp") return "video/mp4";
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3)
      return "video/webm";
  }
  return fallback;
}

function looksLikeJson(buf: Uint8Array) {
  const i = buf.findIndex((b) => b !== 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09);
  return i >= 0 && (buf[i] === 0x7b || buf[i] === 0x5b);
}

export async function saveArtifact(
  buf: Uint8Array,
  mimeType: string,
  kind: "image" | "audio" | "video",
  runId?: string,
  orgId = "",
) {
  if (!buf.byteLength) throw new Error(`Empty ${kind} artifact`);
  if (kind === "video" && looksLikeJson(buf)) {
    throw new Error(
      `Video download was not a video file: ${new TextDecoder().decode(buf.slice(0, 180))}`,
    );
  }
  const id = newId();
  const mime = sniffMime(buf, mimeType);
  if (kind === "video" && !mime.startsWith("video/")) {
    throw new Error("Video generation returned a file the browser cannot play.");
  }
  const ext = EXT[mime] ?? (kind === "image" ? "png" : kind === "audio" ? "mp3" : "mp4");
  const filename = mediaKey(orgId, `${id}.${ext}`);
  await objectStore.put(filename, buf);
  await db.insert(artifacts).values({
    id,
    orgId,
    runId,
    kind,
    mimeType: mime,
    bytes: buf.byteLength,
    filename,
  });
  return { id, filename, mimeType: mime, bytes: buf.byteLength };
}

export async function readArtifactBytes(id: string) {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);
  if (!row) return null;
  const data = await objectStore.get(row.filename);
  if (!data) return null;
  return { data, mimeType: row.mimeType, orgId: row.orgId };
}

const MAX_REF_BYTES = 900_000;
const MAX_REF_EDGE = 1536;

/** Shrink a large reference photo before sending it to an image model. */
export function shrinkReferenceImage(data: Uint8Array): Uint8Array {
  if (data.byteLength <= MAX_REF_BYTES) return data;
  if (process.platform !== "darwin") return data;
  const tmp = path.join(
    os.tmpdir(),
    `flowbook-ref-${crypto.randomBytes(6).toString("hex")}.jpg`,
  );
  try {
    fs.writeFileSync(tmp, data);
    execFileSync(
      "sips",
      ["-Z", String(MAX_REF_EDGE), "-s", "format", "jpeg", tmp],
      { stdio: "ignore" },
    );
    const out = fs.readFileSync(tmp);
    return out.byteLength > 0 && out.byteLength < data.byteLength
      ? new Uint8Array(out)
      : data;
  } catch {
    return data;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
