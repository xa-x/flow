"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ModelInfo } from "./models";
import type { RunSettings } from "./types";
import { PROVIDER_SPECS } from "./providers";

/**
 * Live model catalogs per provider, fetched through /api/models (which
 * queries each provider's standard `/models` endpoint) and cached in
 * localStorage so dropdowns paint instantly.
 */

export interface ModelCatalog {
  models: Record<string, ModelInfo[]>;
  updatedAt: number;
}

const EMPTY: ModelCatalog = { models: {}, updatedAt: 0 };
const CACHE_KEY = "flowbook.catalog.v2";

function readCache(): ModelCatalog | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelCatalog;
    if (parsed.models && typeof parsed.models === "object")
      return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(c: ModelCatalog) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* private mode */
  }
}

const Ctx = createContext<ModelCatalog>(EMPTY);

export function useModelCatalog(
  settings: RunSettings,
  env: Record<string, boolean>,
): { catalog: ModelCatalog; reload: () => void } {
  const [catalog, setCatalog] = useState<ModelCatalog>(() => {
    if (typeof window === "undefined") return EMPTY;
    return readCache() ?? EMPTY;
  });

  // signature: every provider's baseUrl+apiKey + env flags
  const sig =
    PROVIDER_SPECS.map(
      (s) =>
        `${s.id}:${settings.providers[s.id]?.baseUrl ?? ""}|${settings.providers[s.id]?.apiKey ?? ""}|${env[s.id] ? 1 : 0}`,
    ).join("~");
  const lastSig = useRef<string>("");

  // Concurrent refreshes are allowed; writes are guarded by updatedAt so a
  // slow stale response can never clobber fresher data.
  const reload = useCallback(() => {
    fetch("/api/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    })
      .then((r) => r.json())
      .then((data) => {
        const next: ModelCatalog = {
          models:
            data?.models && typeof data.models === "object" ? data.models : {},
          updatedAt: Date.now(),
        };
        setCatalog((prev) =>
          next.updatedAt >= prev.updatedAt || prev.updatedAt === 0 ? next : prev,
        );
        try {
          const cur = readCache();
          if (!cur || next.updatedAt >= cur.updatedAt) writeCache(next);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return { catalog, reload };
}

export function ModelCatalogProvider({
  value,
  children,
}: {
  value: ModelCatalog;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCatalog = () => useContext(Ctx);
