export function redactPayload(payload: Record<string, unknown>) {
  const out = { ...payload };
  for (const key of ["apiKey", "authorization", "prompt", "text", "settings"]) {
    if (key in out) delete out[key];
  }
  return out;
}
