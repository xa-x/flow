export function fmtCost(micro: number) {
  if (!micro) return "—";
  const usd = micro / 1e6;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export function fmtDur(ms?: number | null) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function ago(t?: string | number) {
  if (!t) return "";
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export { GENERIC_VOICES as TTS_VOICES } from "./media-params";
