import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { credentials } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { newId } from "./ids";
import type { ProviderConfig, RunSettings } from "./types";
import { PROVIDER_SPECS } from "./providers";

export async function saveOrgCredential(
  orgId: string,
  provider: string,
  cfg: ProviderConfig,
) {
  const payload = JSON.stringify({
    baseUrl: cfg.baseUrl ?? "",
    apiKey: cfg.apiKey ?? "",
  });
  const { ciphertext, iv } = encryptSecret(payload);
  const [existing] = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.orgId, orgId), eq(credentials.provider, provider)))
    .limit(1);
  if (existing) {
    await db
      .update(credentials)
      .set({ ciphertext, iv, updatedAt: new Date() })
      .where(eq(credentials.id, existing.id));
    return existing.id;
  }
  const id = newId();
  await db.insert(credentials).values({
    id,
    orgId,
    provider,
    ciphertext,
    iv,
  });
  return id;
}

export async function loadOrgSettings(orgId: string): Promise<RunSettings> {
  const rows = await db.select().from(credentials).where(eq(credentials.orgId, orgId));
  const providers: Record<string, ProviderConfig> = {};
  for (const spec of PROVIDER_SPECS) providers[spec.id] = {};
  for (const row of rows) {
    try {
      const parsed = JSON.parse(decryptSecret(row.ciphertext, row.iv)) as ProviderConfig;
      providers[row.provider] = {
        baseUrl: parsed.baseUrl || "",
        apiKey: parsed.apiKey || "",
      };
    } catch {
      /* skip corrupt row */
    }
  }
  return { providers };
}

export function mergeSettings(org: RunSettings, client?: RunSettings): RunSettings {
  const providers: Record<string, ProviderConfig> = { ...org.providers };
  for (const [id, cfg] of Object.entries(client?.providers ?? {})) {
    if (!cfg) continue;
    providers[id] = {
      baseUrl: cfg.baseUrl || providers[id]?.baseUrl || "",
      apiKey: cfg.apiKey || providers[id]?.apiKey || "",
    };
  }
  return { providers };
}

export function publicProviderFlags(settings: RunSettings) {
  const out: Record<string, { configured: boolean; hasBaseUrl: boolean }> = {};
  for (const spec of PROVIDER_SPECS) {
    const c = settings.providers[spec.id];
    out[spec.id] = {
      configured: !!c?.apiKey,
      hasBaseUrl: !!c?.baseUrl,
    };
  }
  return out;
}
