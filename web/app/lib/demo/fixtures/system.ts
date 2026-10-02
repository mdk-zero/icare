import { ADMIN_ID, KIND, ago, demoId } from "./people";

/** The Admin's system view: test runs of every kind, and a sign-up request waiting for an answer. */

export interface DemoTestRun {
  id: string;
  kind: "health" | "benchmark" | "dw_benchmark" | "e2e" | "api";
  created_at: string;
  summary: Record<string, unknown>;
  results: unknown[];
  run_by_name: string | null;
}

const HEALTH = [
  ["db", "Database", "Connected · 38 ms round trip"],
  ["auth", "Sessions", "Signing and verifying session tokens"],
  ["storage", "File storage", "Avatars and library buckets reachable"],
  ["ml", "ML service", "Model 2026.09.1 loaded · last scored 03:00"],
  ["dw", "Analytics warehouse", "Refreshed today at 03:05"],
  ["email", "Email", "SMTP relay accepting mail"],
  ["ai", "AI providers", "Claude Haiku primary · Gemini fallback ready"],
  ["migrations", "Migrations", "All 64 applied"],
] as const;

const SUITES: [string, string][] = [
  ["auth", "signs in with email and password"],
  ["auth", "refuses a wrong password"],
  ["auth", "rate-limits repeated failures"],
  ["faculty", "dashboard lists students needing attention"],
  ["faculty", "grades a patient case and saves the score"],
  ["faculty", "asks the dean before changing a saved grade"],
  ["faculty", "schedules a shift for a group"],
  ["faculty", "publishes a quiz once criteria total 100%"],
  ["admin", "assigns groups to an instructor"],
  ["admin", "renames a section and retargets quizzes"],
  ["admin", "approves a grade change request"],
  ["super-admin", "creates a dean account"],
  ["super-admin", "resets a password"],
  ["reports", "builds a student report PDF"],
  ["reports", "builds a section attendance PDF"],
];

export function seedSystem() {
  const runs: DemoTestRun[] = [];
  let n = 0;
  const id = () => demoId(KIND.testRun, ++n);

  for (const daysAgo of [0.4, 1.4, 2.4]) {
    const results = HEALTH.map(([key, label, detail], i) => ({
      id: key,
      label,
      status: key === "ai" && daysAgo > 2 ? "warn" : "pass",
      detail: key === "ai" && daysAgo > 2 ? "Gemini free tier near its daily limit" : detail,
      duration_ms: 20 + ((i * 37) % 140),
    }));
    runs.push({
      id: id(),
      kind: "health",
      created_at: ago(daysAgo),
      summary: {
        pass: results.filter((r) => r.status === "pass").length,
        warn: results.filter((r) => r.status === "warn").length,
        fail: 0,
        total: results.length,
      },
      results,
      run_by_name: "Andrea Villanueva",
    });
  }

  const bench = ["health", "auth", "db", "dw"].flatMap((target, t) =>
    [1, 5, 10, 25].map((concurrency) => {
      const base = [12, 38, 64, 140][t];
      const p50 = Math.round(base * (1 + concurrency / 30));
      return {
        target,
        concurrency,
        requests: 50,
        ok: concurrency === 25 && target === "dw" ? 49 : 50,
        p50_ms: p50,
        p95_ms: Math.round(p50 * 1.9),
        avg_ms: Math.round(p50 * 1.2),
        rps: Math.round((concurrency * 1000) / (p50 * 1.2)),
      };
    }),
  );
  runs.push({
    id: id(),
    kind: "benchmark",
    created_at: ago(1.1),
    summary: { requests: 800, success_pct: 99.9, worst_p95_ms: Math.max(...bench.map((b) => b.p95_ms)), peak_rps: Math.max(...bench.map((b) => b.rps)), max_concurrency: 25 },
    results: bench,
    run_by_name: "Andrea Villanueva",
  });

  const dw = [
    ["summary", "Analytics summary", 182, 1],
    ["trend", "Weekly trend", 64, 8],
    ["leaderboard", "Student leaderboard", 41, 20],
    ["competency", "Skill area breakdown", 57, 3],
    ["rooms", "Room utilisation", 22, 10],
  ] as const;
  runs.push({
    id: id(),
    kind: "dw_benchmark",
    created_at: ago(1.1),
    summary: { queries: dw.length, failed: 0, total_ms: dw.reduce((s, d) => s + d[2], 0), slowest: "Analytics summary" },
    results: dw.map(([query_id, label, duration_ms, row_count]) => ({ query_id, label, duration_ms, row_count, error: null })),
    run_by_name: "Andrea Villanueva",
  });

  for (const [kind, daysAgo, failing] of [["e2e", 0.5, 0], ["api", 0.5, 0], ["e2e", 3.5, 1]] as const) {
    const cases = SUITES.map(([suite, name], i) => ({
      suite,
      name,
      status: failing && i === 6 ? "failed" : "passed",
      duration_ms: 800 + ((i * 613) % 4200),
      error: failing && i === 6 ? "Timed out waiting for the shift calendar to render" : null,
    }));
    runs.push({
      id: id(),
      kind,
      created_at: ago(daysAgo),
      summary: {
        total: cases.length,
        passed: cases.filter((c) => c.status === "passed").length,
        failed: cases.filter((c) => c.status === "failed").length,
        skipped: 0,
        duration_ms: cases.reduce((s, c) => s + c.duration_ms, 0),
        base_url: "https://icare.demo",
        runner: kind === "e2e" ? "playwright" : "newman",
        commit: kind === "e2e" ? "3aa37d7" : "b2ae871",
        planned: cases.length,
        status: "done",
        updated_at: ago(daysAgo),
      },
      results: cases,
      run_by_name: null,
    });
  }

  const accessRequest = {
    id: demoId(KIND.notification, 900),
    user_id: ADMIN_ID,
    type: "system",
    title: "New account request",
    body: "Teresa Gomez (teresa.gomez@demo.icare.ph) asked for an instructor account from the sign-up page.",
    data: {
      kind: "access_request",
      request_id: demoId(KIND.misc, 900),
      name: "Teresa Gomez",
      email: "teresa.gomez@demo.icare.ph",
      sex: "female",
      status: "pending",
    } as Record<string, unknown>,
    read_at: null,
    created_at: ago(0.15),
  };

  return { testRuns: runs.sort((a, b) => b.created_at.localeCompare(a.created_at)), accessRequest };
}
