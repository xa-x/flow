"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { THEME_KEY, resolveTheme, type ThemePref } from "@/lib/theme";

const Ctx = createContext<{
  pref: ThemePref;
  resolved: "light" | "dark";
  setPref: (p: ThemePref) => void;
}>({
  pref: "system",
  resolved: "dark",
  setPref: () => {},
});

export function ThemeProvider({
  children,
  initial = "system",
}: {
  children: React.ReactNode;
  initial?: ThemePref;
}) {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    if (typeof window === "undefined") return initial;
    const saved = window.localStorage.getItem(THEME_KEY) as ThemePref | null;
    return saved === "light" || saved === "dark" || saved === "system" ? saved : initial;
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const resolved = useMemo(() => resolveTheme(pref, systemDark), [pref, systemDark]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    window.localStorage.setItem(THEME_KEY, p);
    void fetch("/api/theme", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: p }),
    }).catch(() => {});
  };

  return <Ctx.Provider value={{ pref, resolved, setPref }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
