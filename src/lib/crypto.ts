import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const ALGO = "aes-256-gcm";

function dataDir() {
  return path.join(process.cwd(), ".data");
}

/** 32-byte key from FLOWBOOK_SECRET or a generated local file. */
export function masterKey(): Buffer {
  const env = process.env.FLOWBOOK_SECRET;
  if (env && env.length >= 16) {
    return crypto.createHash("sha256").update(env).digest();
  }
  const file = path.join(dataDir(), "secret");
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, "utf8").trim();
    if (raw) return crypto.createHash("sha256").update(raw).digest();
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return crypto.createHash("sha256").update(generated).digest();
}

export function encryptSecret(plain: string): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptSecret(ciphertext: string, iv: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv(
    ALGO,
    masterKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function hashPassword(password: string, salt?: string) {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 32).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = crypto.scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return crypto.timingSafeEqual(next, prev);
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
