/** Parse a fetch Response as JSON without throwing on empty bodies. */
export async function readJson<T = unknown>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      res.ok ? "Empty response from server" : `Request failed (${res.status})`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok ? "Invalid response from server" : `Request failed (${res.status})`,
    );
  }
}
