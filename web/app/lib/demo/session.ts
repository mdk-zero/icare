/**
 * Demo mode: a visitor picks a role on /login and walks the portal on
 * hard-coded data held in the browser. Nothing reaches the API routes or the
 * database while it is on.
 *
 * Two markers carry it, because two places need to know:
 *
 *  - a localStorage flag, read by the fetch interceptor on every request;
 *  - a plain cookie holding the role, read by the proxy (so a demo can get
 *    past the page gate) and by the one server-rendered page, the Dean
 *    overview. The cookie unlocks page shells only — no API route reads it,
 *    so it can never stand in for a real session.
 *
 * Shared by client and server code: keep it free of browser-only imports.
 */

export const DEMO_ROLES = ["super_admin", "admin", "faculty"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_COOKIE = "icare_demo";
const DEMO_FLAG = "icare_demo";
/** The edited copy of the mock data, kept until logout. */
export const DEMO_STORE_KEY = "icare_demo_store";

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === "string" && (DEMO_ROLES as readonly string[]).includes(value);
}

/**
 * The demo's role, when one is on. Both markers must agree: the cookie dies
 * with the browser session but the localStorage flag doesn't, and a flag
 * left behind on its own must not route a later visit into a demo the proxy
 * no longer recognises.
 */
export function demoRole(): DemoRole | null {
  if (typeof window === "undefined") return null;
  try {
    const role = localStorage.getItem(DEMO_FLAG);
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${DEMO_COOKIE}=`))?.slice(DEMO_COOKIE.length + 1);
    return isDemoRole(role) && role === cookie ? role : null;
  } catch {
    return null;
  }
}

/** Set once a demo ends in this document, which is then on its way to /login. */
let endedHere = false;

export function demoEndedHere(): boolean {
  return endedHere;
}

export function isDemo(): boolean {
  return demoRole() !== null;
}

export function demoHome(role: DemoRole): string {
  return role === "faculty" ? "/faculty" : role === "super_admin" ? "/super-admin" : "/admin";
}

/** Called right before a full navigation into the role's portal. */
export function startDemo(role: DemoRole, user: object) {
  sessionStorage.removeItem(DEMO_STORE_KEY);
  localStorage.setItem(DEMO_FLAG, role);
  localStorage.setItem("icare_user", JSON.stringify(user));
  localStorage.setItem("icare_token", "logged_in");
  // No max-age: a session cookie, gone with the browser like the data.
  document.cookie = `${DEMO_COOKIE}=${role}; path=/; SameSite=Lax`;
}

/** Drops every trace of the demo, so the next one starts from the original data. */
export function endDemo() {
  if (typeof window === "undefined") return;
  if (isDemo()) endedHere = true;
  try {
    sessionStorage.removeItem(DEMO_STORE_KEY);
    localStorage.removeItem(DEMO_FLAG);
  } catch {
    // Storage blocked: the cookie below still ends the demo for the proxy.
  }
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
