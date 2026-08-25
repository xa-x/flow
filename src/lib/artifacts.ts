import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { MEDIA_DIR } from "@/db";
import * as crypto from "crypto";
import * as fs from "fs";
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
