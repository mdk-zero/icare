export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "icare_theme";

export const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** The theme actually painted, once "system" has been resolved. */
export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

export function applyTheme(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = preference;
}

export function setStoredTheme(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyTheme(preference);
  // Notifies every mounted useTheme() in this tab; `storage` only fires cross-tab.
  window.dispatchEvent(new CustomEvent("icare:themechange", { detail: preference }));
}

/**
 * Runs before first paint, inlined into <head>. Without it the document paints
 * light and then snaps to dark once React hydrates.
 *
 * Kept dependency-free and self-contained because it is stringified verbatim.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=p;}catch(e){}})();`;
