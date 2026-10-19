/**
 * Ends a session that wasn't remembered once its last tab closes.
 *
 * Such a session's cookie has no expiry, so it lasts until the browser quits,
 * which can be days away, and a browser that restores its tabs brings it back
 * even then. So every tab in the session keeps a short-lived presence cookie
 * fresh, and the proxy turns an unremembered session away once that cookie
 * has lapsed. When the last tab closes, the cookie is cut to five seconds:
 * enough for a reload to land, too little for the next person at the computer.
 *
 * The cookie is not a credential, and anyone holding the session cookie
 * could set it. It only tells the proxy whether one of this browser's tabs
 * is still open. Remembered sessions keep it too; the proxy ignores it there.
 */

export const TAB_PRESENCE_COOKIE = "icare_tab";

/** Outlives a background tab's throttled timers, which may fire once a minute. */
const PRESENCE_MAX_AGE_S = 120;
const BEAT_MS = 30_000;
/**
 * What the last tab to close leaves on the cookie. A reload's request goes out
 * within milliseconds of the old page hiding, so this is ample.
 */
const CLOSE_GRACE_S = 5;
/** Marks a tab as inside the session, across its reloads. */
const TAB_MARK_KEY = "icare_tab_in_session";
/** Each open tab's last beat, so a closing tab can tell whether it was the last. */
const OPEN_TABS_KEY = "icare_open_tabs";

let tabId: string | null = null;
let timer: number | undefined;

function writeCookie(maxAgeS: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TAB_PRESENCE_COOKIE}=1; Max-Age=${maxAgeS}; Path=/; SameSite=Lax${secure}`;
}

function readOpenTabs(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOpenTabs(tabs: Record<string, number>) {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(tabs));
  } catch {
    // Storage blocked: every closing tab then counts as the last one.
  }
}

/** Tabs that have beaten recently enough to still be open, keyed by id. */
function liveTabs(now: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(readOpenTabs()).filter(([, at]) => now - at <= PRESENCE_MAX_AGE_S * 1000),
  );
}

function beat() {
  if (!tabId) return;
  writeCookie(PRESENCE_MAX_AGE_S);
  const now = Date.now();
  writeOpenTabs({ ...liveTabs(now), [tabId]: now });
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") beat();
}

/**
 * Fires on closing the tab, on reloading it and on leaving the site in it,
 * and the three can't be told apart here. So the cookie is only shortened,
 * never cleared, and only when no other tab of the session is still open.
 */
function onPageHide() {
  if (!tabId) return;
  const now = Date.now();
  const others = liveTabs(now);
  delete others[tabId];
  writeOpenTabs(others);
  if (Object.keys(others).length === 0) writeCookie(CLOSE_GRACE_S);
}

/**
 * Called once this tab is inside a session: on signing in, and when a
 * signed-in page loads. Idempotent, and it outlives client-side navigation,
 * so a visit to a public page in the same tab doesn't end the session.
 */
export function holdTabPresence() {
  if (typeof window === "undefined" || tabId) return;
  // Not crypto.randomUUID: that needs a secure context, and the dev server is
  // often opened over plain http from another device.
  tabId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  try {
    sessionStorage.setItem(TAB_MARK_KEY, "1");
  } catch {
    // Without it a reload of a public page in this tab won't resume; a
    // signed-in page still does, through the Shell.
  }
  beat();
  timer = window.setInterval(beat, BEAT_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", beat);
  // Back from the back/forward cache, where pagehide has already run.
  window.addEventListener("pageshow", beat);
  window.addEventListener("pagehide", onPageHide);
}

/**
 * A reload of a tab that was in the session picks the session back up, but
 * only inside the grace a closing tab leaves. A tab restored long after it
 * was closed carries its old mark too, and must not revive the session.
 */
export function resumeTabPresence() {
  if (typeof window === "undefined" || tabId) return;
  let marked = false;
  try {
    marked = sessionStorage.getItem(TAB_MARK_KEY) === "1";
  } catch {
    return;
  }
  if (!marked) return;
  const alive = document.cookie.split("; ").some((c) => c.startsWith(`${TAB_PRESENCE_COOKIE}=`));
  if (alive) {
    holdTabPresence();
    return;
  }
  try {
    sessionStorage.removeItem(TAB_MARK_KEY);
  } catch {
    // Nothing to undo.
  }
}

/** On signing out: this tab stops vouching for a session that has ended. */
export function releaseTabPresence() {
  if (typeof window === "undefined") return;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("focus", beat);
  window.removeEventListener("pageshow", beat);
  window.removeEventListener("pagehide", onPageHide);
  if (tabId) {
    const others = liveTabs(Date.now());
    delete others[tabId];
    writeOpenTabs(others);
  }
  tabId = null;
  try {
    sessionStorage.removeItem(TAB_MARK_KEY);
  } catch {
    // Nothing to undo.
  }
  writeCookie(0);
}
