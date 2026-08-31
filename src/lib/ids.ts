import * as crypto from "crypto";

export function newId(len = 12) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function newToken(len = 24) {
  return crypto.randomBytes(len).toString("base64url");
}
