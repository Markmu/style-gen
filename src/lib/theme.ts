export const THEME_STORAGE_KEY = "visoryn-theme-preference";
export const THEME_CHANGE_EVENT = "visoryn-theme-change";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const key = ${JSON.stringify(THEME_STORAGE_KEY)};
  const allowed = new Set(["system", "light", "dark"]);
  let preference = "system";
  try {
    const stored = window.localStorage.getItem(key);
    if (stored && allowed.has(stored)) preference = stored;
  } catch {}
  const resolved = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
})();`;
