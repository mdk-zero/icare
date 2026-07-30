export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "icare_theme";

/** Same-tab preference changes; `storage` only fires in *other* tabs. */
export const THEME_CHANGE_EVENT = "icare:themechange";

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
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: preference }));
}

/**
 * Runs before first paint, inlined into <head>. Without it the document paints
 * light and then snaps to dark once React hydrates.
 *
 * It also owns the live OS listener, rather than a mounted component doing it:
 * registered here it survives client-side navigation, applies on every route,
 * and repaints even before React has hydrated.
 *
 * Kept dependency-free and self-contained because it is stringified verbatim.
 */
export const THEME_INIT_SCRIPT = `(function(){
var KEY=${JSON.stringify(THEME_STORAGE_KEY)};
function read(){var p;try{p=localStorage.getItem(KEY)}catch(e){}
return p==='light'||p==='dark'||p==='system'?p:'system'}
function apply(){var p=read();
var d=p==='dark'||(p==='system'&&mq.matches);
document.documentElement.classList.toggle('dark',d);
document.documentElement.dataset.theme=p}
var mq;try{mq=window.matchMedia('(prefers-color-scheme: dark)');apply();
mq.addEventListener('change',apply);
window.addEventListener('storage',function(e){if(!e.key||e.key===KEY)apply()});
window.addEventListener(${JSON.stringify(THEME_CHANGE_EVENT)},apply)}catch(e){}
})();`;
