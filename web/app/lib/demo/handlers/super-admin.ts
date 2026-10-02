"use client";

import { json, notFound, route, sleep, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoUser } from "../fixtures/people";
import type { DemoTestRun } from "../fixtures/system";
import { audit } from "./shared";
import { auditTrail } from "./admin";
import { DAY_MS } from "./derive";
import { sectionName, userById } from "./scope";

/** The Admin portal: accounts, sign-up requests, system metrics and test results. */

type Ctx = DemoContext;

const adminOnly = (ctx: Ctx) => ctx.role === "super_admin";
const forbidden = () => json({ error: "Forbidden" }, 403);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function account(ctx: Ctx, u: DemoUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    picture_url: u.picture_url,
    sex: u.sex,
    created_at: u.created_at,
    last_login_at: u.last_sign_in_at,
    force_password_change: false,
    section_id: u.section_id,
    section_name: sectionName(ctx.db, u.section_id),
    admin_id: u.admin_id,
  };
}

route("GET", "/api/super-admin/users", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  return {
    users: ctx.db.users.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((u) => account(ctx, u)),
    sections: ctx.db.sections.map((s) => ({ id: s.id, name: s.name })),
    owner_enabled: true,
  };
});

const ROLES = ["student", "faculty", "admin", "super_admin"] as const;

route("POST", "/api/super-admin/users", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name) return json({ error: "Name is required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
  if (!ROLES.includes(body?.role)) return json({ error: "Choose a role" }, 400);
  if (db.users.some((u) => u.email === email)) return json({ error: "An account with this email already exists" }, 409);
  const user: DemoUser = {
    id: newId(),
    email,
    name,
    role: body.role,
    sex: body?.sex === "male" || body?.sex === "female" ? body.sex : null,
    picture_url: null,
    section_id: body.role === "student" && body?.section_id ? body.section_id : null,
    team_id: null,
    admin_id: body.role === "faculty" ? (body?.admin_id ?? null) : null,
    student_number: null,
    created_at: new Date().toISOString(),
    last_sign_in_at: null,
    last_activity: null,
    status: "active",
    google_linked: false,
    risk_level: null,
    risk_probability: null,
  };
  db.users.push(user);
  // An account made from a sign-up request settles that request.
  if (typeof body?.request_id === "string") settleRequest(ctx, body.request_id, "accepted");
  audit(db, viewer, "user.create", "users", { message: `Created ${name}'s account` }, user.id);
  return json(
    {
      user: account(ctx, user),
      password: "Demo-Pass-2026",
      warning: "This is a demo: no welcome email was sent. In the real app the new account gets this temporary password by email.",
    },
    201,
  );
});

route("PATCH", "/api/super-admin/users/:id", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const { db, body, params, viewer } = ctx;
  const user = userById(db, params.id);
  if (!user) return notFound("Account not found");
  if (Object.values(db.viewers).includes(user.id) && body?.role && body.role !== user.role) {
    return json({ error: "The demo accounts keep their roles, so every demo still opens" }, 400);
  }
  if (typeof body?.name === "string" && body.name.trim()) user.name = body.name.trim();
  if (ROLES.includes(body?.role)) user.role = body.role;
  if (body?.sex === "male" || body?.sex === "female") user.sex = body.sex;
  if (body && "section_id" in body) user.section_id = user.role === "student" ? body.section_id || null : null;
  if (body && "admin_id" in body) user.admin_id = user.role === "faculty" ? body.admin_id || null : null;
  audit(db, viewer, "user.update", "users", { message: `Edited ${user.name}'s account` }, user.id);
  return { user: account(ctx, user) };
});

route("DELETE", "/api/super-admin/users/:id", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const { db, params, viewer } = ctx;
  const user = userById(db, params.id);
  if (!user) return notFound("Account not found");
  if (Object.values(db.viewers).includes(user.id)) return json({ error: "The demo accounts can't be deleted" }, 400);
  db.users = db.users.filter((u) => u.id !== user.id);
  for (const t of db.teams) if (t.faculty_id === user.id) t.faculty_id = null;
  audit(db, viewer, "user.delete", "users", { message: `Deleted ${user.name}'s account` }, user.id);
  return { success: true };
});

route("POST", "/api/super-admin/users/:id/password", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const user = userById(ctx.db, ctx.params.id);
  if (!user) return notFound("Account not found");
  audit(ctx.db, ctx.viewer, "user.password_reset", "users", { message: `Reset the password for ${user.name}` }, user.id);
  return { password: "Demo-Reset-2026" };
});

function settleRequest(ctx: Ctx, requestId: string, status: "accepted" | "declined") {
  const copies = ctx.db.notifications.filter((n) => n.data?.kind === "access_request" && n.data.request_id === requestId);
  for (const n of copies) {
    n.data = { ...n.data, status, resolved_by: ctx.viewer.id, resolved_by_name: ctx.viewer.name, resolved_at: new Date().toISOString() };
    n.read_at ??= new Date().toISOString();
  }
  return copies;
}

route("PATCH", "/api/super-admin/access-requests/:id", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const status = ctx.body?.status;
  if (status !== "accepted" && status !== "declined") return json({ error: "status must be accepted or declined" }, 400);
  const current = ctx.db.notifications.find((n) => n.data?.kind === "access_request" && n.data.request_id === ctx.params.id);
  if (!current) return notFound("Request not found");
  if (current.data.status !== "pending") return json({ error: `This request was already ${current.data.status}.` }, 409);
  settleRequest(ctx, ctx.params.id, status);
  audit(ctx.db, ctx.viewer, `access_request.${status}`, "users", { message: `${status === "accepted" ? "Accepted" : "Declined"} a sign-up request from ${current.data.name}` });
  return { success: true, status };
});

route("GET", "/api/super-admin/audit", (ctx) => (adminOnly(ctx) ? auditTrail(ctx, null) : forbidden()));

// ---------------------------------------------------------------------------
// Metrics: a plausible day-and-night traffic curve, the same every time for a moment
// ---------------------------------------------------------------------------

const RANGES = {
  "1h": { ms: 3_600_000, bucket: "minute" as const, step: 60_000 },
  "24h": { ms: DAY_MS, bucket: "hour" as const, step: 3_600_000 },
  "7d": { ms: 7 * DAY_MS, bucket: "hour" as const, step: 3_600_000 },
  "30d": { ms: 30 * DAY_MS, bucket: "day" as const, step: DAY_MS },
};

const ROUTES = [
  ["GET", "/api/faculty/dashboard", 210],
  ["GET", "/api/faculty/scenarios/assignments", 260],
  ["GET", "/api/notifications", 45],
  ["GET", "/api/analytics/summary", 340],
  ["PUT", "/api/faculty/scenarios/assignments/[id]/tasks", 120],
  ["GET", "/api/student/scenarios", 150],
  ["POST", "/api/student/attempts/[id]/submit", 180],
  ["GET", "/api/faculty/shifts", 95],
] as const;

/** Deterministic noise from a number, so the chart doesn't jitter on refresh. */
function noise(k: number) {
  const x = Math.sin(k * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function metrics(rangeKey: string) {
  const range = RANGES[rangeKey as keyof typeof RANGES] ?? RANGES["24h"];
  const now = Date.now();
  const since = new Date(now - range.ms).toISOString();
  const series = [];
  for (let t = Math.ceil((now - range.ms) / range.step) * range.step; t <= now; t += range.step) {
    const hour = new Date(t).getHours();
    // School hours are busy, nights are quiet.
    const load = hour >= 7 && hour <= 21 ? 1 : 0.15;
    const perStep = range.step / 3_600_000;
    const requests = Math.round((380 + noise(t / range.step) * 220) * load * Math.max(perStep, 1 / 60) * (range.bucket === "minute" ? 1 : 1));
    const p50 = Math.round(85 + noise(t / range.step + 1) * 40);
    series.push({
      bucket: new Date(t).toISOString(),
      requests,
      p50_ms: p50,
      p95_ms: Math.round(p50 * (2.6 + noise(t / range.step + 2))),
      errors: noise(t / range.step + 3) > 0.93 ? 1 + Math.round(noise(t) * 3) : 0,
      ai_requests: Math.round(requests * 0.02),
    });
  }
  const total = series.reduce((s, b) => s + b.requests, 0);
  const errors = series.reduce((s, b) => s + b.errors, 0);
  return {
    range: rangeKey,
    bucket: range.bucket,
    since,
    totals: { requests: total, avg_ms: 118, p50_ms: 96, p95_ms: 284, errors },
    ai: { requests: Math.round(total * 0.02), p50_ms: 1450, p95_ms: 3900, errors: 2 },
    series,
    routes: ROUTES.map(([method, path, ms], i) => ({
      method,
      route: path,
      requests: Math.round(total * [0.18, 0.15, 0.22, 0.06, 0.09, 0.14, 0.05, 0.04][i]),
      p50_ms: ms,
      p95_ms: Math.round(ms * 2.4),
      errors: i === 3 ? Math.min(errors, 2) : 0,
    })),
  };
}

route("GET", "/api/super-admin/metrics", (ctx) => (adminOnly(ctx) ? metrics(ctx.query.get("range") ?? "24h") : forbidden()));

route("GET", "/api/super-admin/overview", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const { db } = ctx;
  const byRole: Record<string, number> = {};
  for (const u of db.users) byRole[u.role] = (byRole[u.role] ?? 0) + 1;
  const weekAgo = Date.now() - 7 * DAY_MS;
  const latest = (kind: string) => db.testRuns.find((r) => r.kind === kind) ?? null;
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.now() - (7 - i) * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    return {
      t: new Date(start).toISOString().slice(0, 10),
      count: db.users.filter((u) => Date.parse(u.created_at) >= start && Date.parse(u.created_at) < end).length,
    };
  });
  return {
    accounts: {
      total: db.users.length,
      by_role: byRole,
      active_7d: db.users.filter((u) => u.last_sign_in_at && Date.parse(u.last_sign_in_at) > weekAgo).length,
      new_per_week: weeks,
    },
    metrics: metrics("24h"),
    latest_runs: { health: latest("health"), benchmark: latest("benchmark"), dw_benchmark: latest("dw_benchmark") },
    pending_migration: false,
  };
});

// ---------------------------------------------------------------------------
// Test results
// ---------------------------------------------------------------------------

route("GET", "/api/super-admin/test-runs", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const since = ctx.query.get("since");
  return {
    runs: ctx.db.testRuns.filter((r) => !since || r.created_at > since),
    now: new Date().toISOString(),
  };
});

function saveRun(ctx: Ctx, run: Omit<DemoTestRun, "id" | "created_at" | "run_by_name">) {
  const full: DemoTestRun = { ...run, id: newId(), created_at: new Date().toISOString(), run_by_name: ctx.viewer.name };
  ctx.db.testRuns.unshift(full);
  return full;
}

route("POST", "/api/super-admin/health", async (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  await sleep(900);
  const previous = ctx.db.testRuns.find((r) => r.kind === "health");
  const results = ((previous?.results ?? []) as { status: string; duration_ms: number }[]).map((r, i) => ({
    ...r,
    status: "pass",
    duration_ms: 18 + ((i * 41 + Date.now()) % 130),
  }));
  const run = saveRun(ctx, { kind: "health", summary: { pass: results.length, warn: 0, fail: 0, total: results.length }, results });
  return { run };
});

route("POST", "/api/super-admin/test-runs", (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  const results = Array.isArray(ctx.body?.results) ? (ctx.body.results as { requests: number; ok: number; p95_ms: number; rps: number; concurrency: number }[]) : [];
  if (results.length === 0) return json({ error: "Nothing to save" }, 400);
  const requests = results.reduce((s, r) => s + r.requests, 0);
  const ok = results.reduce((s, r) => s + r.ok, 0);
  const run = saveRun(ctx, {
    kind: "benchmark",
    summary: {
      requests,
      success_pct: requests ? Math.round((ok / requests) * 1000) / 10 : 0,
      worst_p95_ms: Math.max(...results.map((r) => r.p95_ms)),
      peak_rps: Math.max(...results.map((r) => r.rps)),
      max_concurrency: Math.max(...results.map((r) => r.concurrency)),
    },
    results,
  });
  return json({ run }, 201);
});

route("POST", "/api/super-admin/dw-benchmark", async (ctx) => {
  if (!adminOnly(ctx)) return forbidden();
  await sleep(1100);
  const previous = ctx.db.testRuns.find((r) => r.kind === "dw_benchmark");
  const results = ((previous?.results ?? []) as { duration_ms: number }[]).map((r, i) => ({
    ...r,
    duration_ms: Math.round(r.duration_ms * (0.85 + ((i * 7 + Date.now()) % 30) / 100)),
  }));
  const total = results.reduce((s, r) => s + r.duration_ms, 0);
  const run = saveRun(ctx, { kind: "dw_benchmark", summary: { queries: results.length, failed: 0, total_ms: total, slowest: "Analytics summary" }, results });
  return { run };
});

route("GET", "/api/super-admin/probe", (ctx) => (adminOnly(ctx) ? { ok: true, target: ctx.query.get("target") } : forbidden()));
