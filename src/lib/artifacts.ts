import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { MEDIA_DIR } from "@/db";
import { eq } from "drizzle-orm";
import { execFileSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function newId(len = 12) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

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

export async function saveArtifact(
  buf: Uint8Array,
  mimeType: string,
  kind: "image" | "audio" | "video",
  runId?: string,
) {
  const id = newId();
  const ext = EXT[mimeType] ?? (kind === "image" ? "png" : kind === "audio" ? "mp3" : "mp4");
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), buf);
  await db.insert(artifacts).values({
    id,
    runId,
    kind,
    mimeType,
    bytes: buf.byteLength,
    filename,
  });
  return { id, filename, mimeType, bytes: buf.byteLength };
}

export async function readArtifactBytes(id: string) {
  const [row] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, id))
    .limit(1);
  if (!row) return null;
  const file = path.join(MEDIA_DIR, row.filename);
  if (!fs.existsSync(file)) return null;
  return {
    data: new Uint8Array(fs.readFileSync(file)),
    mimeType: row.mimeType,
  };
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
