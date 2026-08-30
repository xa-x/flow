"use client";

import { useEffect, useState } from "react";
import type { RunSettings } from "./types";
import { hasUsableProvider, loadSettings, saveSettings } from "./settings";
import { readJson } from "./http";

export function useSettings() {
  const [settings, setSettings] = useState<RunSettings>(() => ({
    providers: {},
  }));
  const [env, setEnv] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [onboardDismissed, setOnboardDismissed] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const local = loadSettings();
      let cfg: { envProviders?: Record<string, boolean> } = {};
      try {
        cfg = await fetch("/api/config").then((r) =>
          readJson<{ envProviders?: Record<string, boolean> }>(r),
        );
      } catch {
        /* server unreachable — treat as env-less */
      }
      if (!alive) return;
      setSettings(local);
      setEnv(cfg.envProviders ?? {});
      setOnboardDismissed(
        window.localStorage.getItem("flowbook.onboarded") === "1",
      );
      setBooted(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = (s: RunSettings) => {
    setSettings(s);
    saveSettings(s);
    window.localStorage.setItem("flowbook.onboarded", "1");
    setOnboardDismissed(true);
  };

  const dismissOnboard = () => {
    if (!hasUsableProvider(settings, env))
      window.localStorage.setItem("flowbook.onboarded", "1");
    setOnboardDismissed(true);
    setShowSettings(false);
  };

  const needsOnboard =
    booted && !hasUsableProvider(settings, env) && !onboardDismissed;

  return {
    settings,
    env,
    booted,
    showSettings,
    setShowSettings,
    persist,
    dismissOnboard,
    needsOnboard,
  };
}
