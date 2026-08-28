/**
 * Model catalog helpers — keeps per-node model lists organized by provider
 * and supports custom / gateway models (e.g. the PYK gateway, "pyk/<model>").
 */

export interface ModelInfo {
  id: string;
  label: string;
}

export const PROVIDER_LABELS: Record<string, string> = {
  stealth: "Stealth",
  deepseek: "DeepSeek",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "meta-llama": "Meta",
  "bytedance-seed": "ByteDance Seed",
  bytedance: "ByteDance",
};

/** Sentinel option value for the "Custom model…" entry. */
export const CUSTOM_MODEL = "__custom__";

export const providerOf = (id: string) => id.split("/")[0] ?? id;
export const providerLabel = (p: string) => PROVIDER_LABELS[p] ?? p;

/** Bucket a flat model list into provider groups, preserving order. */
export function groupModels(models: ModelInfo[]): {
  provider: string;
  label: string;
  items: ModelInfo[];
}[] {
  const order: string[] = [];
  const buckets = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const p = providerOf(m.id);
    if (!buckets.has(p)) {
      buckets.set(p, []);
      order.push(p);
    }
    buckets.get(p)!.push(m);
  }
  return order.map((provider) => ({
    provider,
    label: providerLabel(provider),
    items: buckets.get(provider)!,
  }));
}
