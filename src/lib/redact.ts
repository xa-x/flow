const SECRET_KEYS = ["apiKey", "authorization", "settings"];

/** Strip credentials. Keep `text`/`outputs` so live run events still render. */
export function redactPayload(payload: Record<string, unknown>) {
  const out = { ...payload };
  for (const key of SECRET_KEYS) {
    if (key in out) delete out[key];
  }
  return out;
}
