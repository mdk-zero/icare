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

export function demoRole(): DemoRole | null {
  if (typeof window === "undefined") return null;
  try {
    const role = localStorage.getItem(DEMO_FLAG);
    return isDemoRole(role) ? role : null;
  } catch {
    return null;
  }
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
  try {
    sessionStorage.removeItem(DEMO_STORE_KEY);
    localStorage.removeItem(DEMO_FLAG);
  } catch {
    // Storage blocked: the cookie below still ends the demo for the proxy.
  }
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
