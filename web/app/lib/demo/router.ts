"use client";

import { getStore, saveStore, type DemoDb } from "./store";
import { demoRole, type DemoRole } from "./session";
import type { DemoUser } from "./fixtures/people";

/**
 * The demo's stand-in for the API routes. Each route answers from the
 * in-browser store, in the same shape the real handler returns, so the pages
 * cannot tell the difference.
 *
 * A route nobody mocked answers like a real failure rather than with an empty
 * body a page might misread as "no data": reads 404 (and warn, so a sweep can
 * find them), writes 403 with a message the pages already know how to toast.
 */

export interface DemoContext {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- request bodies are untyped JSON
  db: DemoDb;
  role: DemoRole;
  viewer: DemoUser;
}

type Result = unknown | Response;
export type DemoHandler = (ctx: DemoContext) => Result | Promise<Result>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: DemoHandler;
}

const routes: Route[] = [];

/** `/api/faculty/students/:id` → a matcher capturing `id`. */
export function route(method: string, path: string, handler: DemoHandler) {
  const keys: string[] = [];
  const source = path
    .split("/")
    .map((part) => {
      if (!part.startsWith(":")) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      keys.push(part.slice(1));
      return "([^/]+)";
    })
    .join("/");
  routes.push({ method, pattern: new RegExp(`^${source}/?$`), keys, handler });
}

export const NOT_IN_DEMO = "Not available in the demo";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function notInDemo(): Response {
  return json({ error: NOT_IN_DEMO }, 403);
}

export function notFound(what = "Not found"): Response {
  return json({ error: what }, 404);
}

/** An NDJSON body that trickles out line by line, as the streaming routes do. */
export function ndjson(lines: unknown[], gapMs = 350): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const line of lines) {
        await sleep(gapMs);
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let registered: Promise<unknown> | null = null;

/** Every concurrent first request waits on the same load, not just the first. */
function ensureRoutes() {
  // Imported for their route() side effects.
  registered ??= Promise.all([
    import("./handlers/shared"),
    import("./handlers/faculty"),
    import("./handlers/quizzes"),
    import("./handlers/ward"),
    import("./handlers/teaching"),
    import("./handlers/admin"),
    import("./handlers/super-admin"),
    import("./handlers/courses"),
    import("./handlers/attendance"),
  ]);
  return registered;
}

async function readBody(init?: RequestInit): Promise<unknown> {
  const raw = init?.body;
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (raw instanceof FormData) return Object.fromEntries(raw.entries());
  return undefined;
}

export async function handleDemoRequest(url: string, init?: RequestInit): Promise<Response> {
  await ensureRoutes();
  const role = demoRole();
  const method = (init?.method ?? "GET").toUpperCase();
  const parsed = new URL(url, window.location.origin);
  const path = parsed.pathname;

  // Snappy, but not so instant that loading states never get a frame.
  await sleep(method === "GET" ? 60 + Math.random() * 60 : 150);

  if (!role) return json({ error: "Not signed in" }, 401);

  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const match = candidate.pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    candidate.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1]);
    });
    const db = getStore();
    const viewer = db.users.find((u) => u.id === db.viewers[role]);
    if (!viewer) return json({ error: "Not signed in" }, 401);
    try {
      const result = await candidate.handler({
        method,
        path,
        params,
        query: parsed.searchParams,
        body: await readBody(init),
        db,
        role,
        viewer,
      });
      saveStore();
      if (result instanceof Response) return result;
      if (result === undefined) return new Response(null, { status: 204 });
      return json(result);
    } catch (err) {
      console.error("[demo] handler failed", method, path, err);
      return json({ error: "Something went wrong in the demo" }, 500);
    }
  }

  if (method === "GET") {
    console.warn("[demo] unmocked", method, path);
    return notFound();
  }
  return notInDemo();
}
