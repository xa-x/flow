export type ThemePref = "light" | "dark" | "system";

export function resolveTheme(pref: ThemePref, systemDark = true): "light" | "dark" {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

export const THEME_KEY = "flowbook.theme";
