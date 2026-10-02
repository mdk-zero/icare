import { demoEndedHere, isDemo } from "./session";

/**
 * Routes the app's own `/api/*` requests to the demo router while a demo is
 * on. Patching `fetch` rather than `apiFetch` catches the handful of pages
 * that call `fetch` directly, plus telemetry and the health probe, so no demo
 * request can leak through to the real API.
 *
 * The router and its data load on first use, so a normal sign-in never
 * downloads them.
 */
export function installDemoFetch() {
  if (typeof window === "undefined") return;
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = apiUrl(input);
    if (url && isDemo()) {
      const { handleDemoRequest } = await import("./router");
      if (input instanceof Request) {
        const body = input.method === "GET" || input.method === "HEAD" ? undefined : await input.text();
        return handleDemoRequest(url, { method: input.method, body, ...init });
      }
      return handleDemoRequest(url, init);
    }
    // The page that just left a demo refetches as it unmounts; those calls
    // must not reach the real API, and the page is navigating away anyway.
    if (url && demoEndedHere()) return new Promise<Response>(() => {});
    return realFetch(input, init);
  };
}

/** The same-origin `/api/...` path and query, or null for anything else. */
function apiUrl(input: RequestInfo | URL): string | null {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
