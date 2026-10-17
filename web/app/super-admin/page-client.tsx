"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowRight,
  faCircleCheck,
  faCircleQuestion,
  faCircleXmark,
  faHeartPulse,
  faHouse,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import PageHeader from "../components/PageHeader";
import { SkeletonChartBars, SkeletonText } from "../components/skeletons";
import AiUsage from "./AiUsage";
import TimeSeriesChart from "./TimeSeriesChart";
import { CARD, MigrationPending, StatusText, TONE_STYLE } from "./ui";
import {
  P95_SCALE,
  fillBuckets,
  formatMs,
  formatPct,
  reliability,
  reliabilityTone,
  speedTone,
  type AiUsageRow,
  type MetricsSummary,
  type Tone,
} from "./metrics";
import { RUN_KINDS, ago, runVerdict, type RunKind, type RunTone } from "./run-status";

interface LatestRun {
  created_at: string;
  summary: Record<string, number | string | null>;
}

interface Overview {
  accounts: {
    total: number;
    by_role: Record<string, number>;
    active_7d: number;
    new_per_week: { t: string; count: number }[];
  };
  metrics: MetricsSummary | null;
  /** The newest run of each kind; e2e and api arrived after the others, so they may be missing. */
  latest_runs: Partial<Record<RunKind, LatestRun | null>>;
  /** Tokens per AI model over the last 24 hours and 30 days (076). */
  ai_usage: { day: AiUsageRow[]; month: AiUsageRow[] } | null;
  ai_usage_pending?: boolean;
  pending_migration: boolean;
}

// Same hues as the Dean's "Users by Role" donut, plus one for Admins.
const ROLES = [
  { key: "student", label: "Students", color: "#2a8a98" },
  { key: "faculty", label: "Instructors", color: "#f59e0b" },
  { key: "admin", label: "Deans", color: "#7c3aed" },
  { key: "super_admin", label: "Admins", color: "#e87ba4" },
];

const DAY_MS = 86_400_000;
const DASH = "—";

/** The banner's colour is the worst of its signals. */
function worst(tones: (RunTone | null)[]): Tone | null {
  for (const tone of ["bad", "warn", "good"] as const) if (tones.includes(tone)) return tone;
  return null;
}

const BANNER: Record<Tone | "idle", { box: string; icon: IconDefinition; iconClass: string; headline: string }> = {
  good: {
    box: "border-emerald-200 bg-emerald-50",
    icon: faCircleCheck,
    iconClass: "text-emerald-600",
    headline: "All systems normal",
  },
  warn: {
    box: "border-amber-200 bg-amber-50",
    icon: faTriangleExclamation,
    iconClass: "text-amber-600",
    headline: "Something needs a look",
  },
  bad: {
    box: "border-rose-200 bg-rose-50",
    icon: faCircleXmark,
    iconClass: "text-rose-600",
    headline: "Something is failing",
  },
  idle: {
    box: "border-hairline bg-surface",
    icon: faCircleQuestion,
    iconClass: "text-gray-400",
    headline: "No readings yet",
  },
};

const SPEED_WORD: Record<Tone, string> = { good: "Fast", warn: "Okay", bad: "Slow" };
const RELIABILITY_WORD: Record<Tone, string> = { good: "Stable", warn: "Watch", bad: "Unstable" };

/**
 * The first thing on the page answers "is anything wrong?": one verdict from
 * the latest health check and the last 24 hours of traffic, the three
 * readings behind it, and the button that refreshes the stalest of them.
 */
function StatusBanner({
  data,
  pending,
  onChecked,
}: {
  data: Overview | null | undefined;
  pending: boolean;
  onChecked: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read once: a check run after mount is newer than this, so it never reads as stale.
  const [mountedAt] = useState(() => Date.now());

  const totals = data?.metrics?.totals;
  const health = data?.latest_runs.health ?? null;
  const healthVerdict = health ? runVerdict("health", health.summary) : null;
  const successPct = totals?.requests ? reliability(totals.requests, totals.errors) : null;
  const steady = successPct !== null ? reliabilityTone(successPct) : null;
  const speed = totals?.requests && totals.p95_ms !== null ? speedTone(totals.p95_ms, P95_SCALE) : null;
  const tone = worst([healthVerdict?.tone ?? null, steady, speed]);
  const style = BANNER[tone ?? "idle"];
  const stale = !health || mountedAt - Date.parse(health.created_at) > DAY_MS;

  const runChecks = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/super-admin/health", { method: "POST" });
    if (res.ok) await onChecked();
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The checks could not run");
    setBusy(false);
  };

  const signals: { label: string; value: string; tone: RunTone; verdict: string }[] = [
    {
      label: "System health",
      value: health ? `${health.summary.pass ?? 0}/${health.summary.total ?? 0}` : DASH,
      tone: healthVerdict?.tone ?? "idle",
      verdict: health
        ? `${healthVerdict!.tone === "good" ? "All passing" : healthVerdict!.text} · checked ${ago(health.created_at)}`
        : "Never checked",
    },
    {
      label: "Reliability · 24 h",
      value: successPct !== null ? formatPct(successPct) : DASH,
      tone: steady ?? "idle",
      verdict: totals?.requests
        ? `${RELIABILITY_WORD[steady!]} · ${totals.errors.toLocaleString()} ${totals.errors === 1 ? "error" : "errors"} in ${totals.requests.toLocaleString()} requests`
        : "No requests yet",
    },
    {
      label: "Response time · 24 h",
      value: totals?.requests ? formatMs(totals.p95_ms) : DASH,
      tone: speed ?? "idle",
      verdict: totals?.requests ? `${SPEED_WORD[speed!]} · p95, median ${formatMs(totals.p50_ms)}` : "No requests yet",
    },
  ];

  return (
    <section aria-labelledby="system-status" className={`rounded-xl border ${style.box} p-4 sm:p-5 mb-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          {pending ? (
            <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-gray-100 animate-pulse" />
          ) : (
            <FontAwesomeIcon icon={style.icon} className={`mt-0.5 h-7 w-7 shrink-0 ${style.iconClass}`} />
          )}
          <div>
            {pending ? (
              <>
                <SkeletonText className="mt-1 h-5 w-48" />
                <SkeletonText className="mt-2 h-3.5 w-72 max-w-full" />
              </>
            ) : (
              <>
                <h2 id="system-status" className="text-lg font-semibold leading-snug text-gray-900">
                  {style.headline}
                </h2>
                <p className="text-sm text-gray-600">
                  {stale
                    ? health
                      ? `The last health check was ${ago(health.created_at)}. Run one for a current reading.`
                      : "No health check has run yet. Run one to check every connected service."
                    : "From the latest health check and the last 24 hours of requests."}
                </p>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={runChecks}
          disabled={busy || pending}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-gray-200 bg-surface px-3.5 py-2 text-sm font-medium text-gray-800 transition-colors hover:border-gray-300 hover:bg-subtle disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
        >
          <FontAwesomeIcon icon={faHeartPulse} className={`h-3.5 w-3.5 text-brand-600 ${busy ? "animate-pulse" : ""}`} />
          {busy ? "Checking…" : "Run health checks"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}

      <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-900/10 pt-4 sm:grid-cols-3">
        {signals.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-xs text-gray-500">{s.label}</dt>
            {pending ? (
              <dd>
                <SkeletonText className="mt-1.5 h-6 w-16" />
                <SkeletonText className="mt-2 h-3 w-40" />
              </dd>
            ) : (
              <>
                <dd className="mt-0.5 text-2xl font-bold text-gray-900 tabular-nums">{s.value}</dd>
                <dd className="mt-0.5 text-xs font-medium">
                  <StatusText tone={s.tone}>{s.verdict}</StatusText>
                </dd>
              </>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
    >
      {children}
      <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3" />
    </Link>
  );
}

/** Every suite's latest outcome, each linking to its section on System Tests. */
function LatestChecks({ runs, pending }: { runs: Overview["latest_runs"] | undefined; pending: boolean }) {
  return (
    <section className={`${CARD} p-4 flex flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Latest checks</h2>
          <p className="text-xs text-gray-500">The newest run of each test suite</p>
        </div>
        <CardLink href="/super-admin/tests">All</CardLink>
      </div>
      <ul className="mt-2 flex-1 divide-y divide-hairline">
        {RUN_KINDS.map(({ kind, label, anchor }) => {
          const run = runs?.[kind] ?? null;
          const verdict = runVerdict(kind, run?.summary);
          return (
            <li key={kind}>
              <Link
                href={`/super-admin/tests#${anchor}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${pending ? "bg-gray-200" : TONE_STYLE[verdict.tone].dot}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-800">{label}</span>
                  {pending ? (
                    <SkeletonText className="mt-1 h-3 w-32" />
                  ) : (
                    <span
                      className={`block truncate text-xs ${verdict.tone === "idle" ? "text-gray-400" : TONE_STYLE[verdict.tone].text}`}
                    >
                      {verdict.text}
                    </span>
                  )}
                </span>
                {!pending && run && <span className="shrink-0 text-xs text-gray-400 tabular-nums">{ago(run.created_at)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Accounts at a glance: totals, the split by role as one bar, and sign-ups per week. */
function Accounts({ accounts, pending }: { accounts: Overview["accounts"] | undefined; pending: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const total = accounts?.total ?? 0;
  return (
    <section className={`${CARD} p-4`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Accounts</h2>
          <p className="text-xs text-gray-500">Everyone who can sign in, by role</p>
        </div>
        <CardLink href="/super-admin/users">Manage users</CardLink>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-gray-500">Total accounts</dt>
              <dd className="mt-0.5 text-2xl font-bold text-gray-900 tabular-nums">
                {pending ? <SkeletonText className="mt-1.5 h-6 w-12" /> : accounts ? total.toLocaleString() : DASH}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Active users · 7 days</dt>
              <dd className="mt-0.5 text-2xl font-bold text-gray-900 tabular-nums">
                {pending ? <SkeletonText className="mt-1.5 h-6 w-12" /> : accounts ? accounts.active_7d.toLocaleString() : DASH}
                {accounts && total > 0 && (
                  <span className="ml-1.5 text-sm font-medium text-gray-400">
                    {Math.round((accounts.active_7d / total) * 100)}%
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {/* One bar split by role; hovering a row lights its segment. */}
          <div
            role="img"
            aria-label={`Accounts by role: ${ROLES.map((r) => `${r.label} ${accounts?.by_role[r.key] ?? 0}`).join(", ")}`}
            className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-gray-100"
          >
            {total > 0 &&
              ROLES.map((role) => {
                const count = accounts?.by_role[role.key] ?? 0;
                return count > 0 ? (
                  <span
                    key={role.key}
                    className="h-full transition-opacity duration-150"
                    style={{
                      width: `${(count / total) * 100}%`,
                      backgroundColor: role.color,
                      opacity: active && active !== role.key ? 0.3 : 1,
                    }}
                  />
                ) : null;
              })}
          </div>
          <ul className="mt-3 divide-y divide-hairline text-sm">
            {ROLES.map((role) => {
              const count = accounts?.by_role[role.key] ?? 0;
              return (
                <li
                  key={role.key}
                  tabIndex={0}
                  className={`flex cursor-default items-center gap-2.5 rounded py-1.5 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    active && active !== role.key ? "opacity-50" : ""
                  }`}
                  onMouseEnter={() => setActive(role.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(role.key)}
                  onBlur={() => setActive(null)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                  <span className="flex-1 text-gray-600">{role.label}</span>
                  <span className="font-medium text-gray-900 tabular-nums">{accounts ? count.toLocaleString() : DASH}</span>
                  <span className="w-10 text-right text-xs text-gray-400 tabular-nums">
                    {accounts && total > 0 ? `${Math.round((100 * count) / total)}%` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-3 lg:border-l lg:border-hairline lg:pl-6">
          <h3 className="text-sm font-medium text-gray-700">New accounts</h3>
          <p className="mb-3 text-xs text-gray-500">Per week, last 8 weeks</p>
          {pending ? (
            <SkeletonChartBars height={190} bars={8} />
          ) : (
            <TimeSeriesChart
              ariaLabel="New accounts per week over the last 8 weeks"
              kind="bar"
              series={[{ label: "New accounts", color: "var(--chart-1)" }]}
              points={(accounts?.new_per_week ?? []).map((w) => ({ t: w.t, values: [w.count] }))}
              bucket="day"
              integer
              format={(v) => Math.round(v).toString()}
              height={190}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export default function SuperAdminDashboardClient() {
  const { data, loading, refresh } = usePageData("super-admin:overview", async (): Promise<Overview | null> => {
    const res = await apiFetch("/api/super-admin/overview");
    return res.ok ? ((await res.json()) as Overview) : null;
  });

  const totals = data?.metrics?.totals;
  const ai = data?.metrics?.ai;
  const pending = loading && !data;

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />, label: "System Administration" }}
        title="System Dashboard"
        subtitle="System status, traffic, AI usage and accounts at a glance"
      />

      {data?.pending_migration && (
        <div className="mb-5">
          <MigrationPending />
        </div>
      )}
      {!data && !loading && (
        <div className={`${CARD} p-6 mb-5 text-sm text-rose-700`}>Couldn&apos;t load the dashboard.</div>
      )}

      <StatusBanner data={data} pending={pending} onChecked={refresh} />

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className={`${CARD} p-4 xl:col-span-2`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-800">Requests per hour</h2>
              {pending ? (
                <SkeletonText className="mb-3 mt-1 h-3 w-64 max-w-full" />
              ) : (
                <p className="mb-3 text-xs text-gray-500">
                  {totals?.requests
                    ? `${totals.requests.toLocaleString()} app requests${ai ? ` and ${ai.requests.toLocaleString()} AI provider calls` : ""} in the last 24 hours`
                    : "Last 24 hours of API traffic from the web app"}
                </p>
              )}
            </div>
            <CardLink href="/super-admin/performance">Performance</CardLink>
          </div>
          {pending ? (
            <SkeletonChartBars height={236} />
          ) : (
            <TimeSeriesChart
              ariaLabel={
                ai ? "API requests and AI provider calls per hour over the last 24 hours" : "API requests per hour over the last 24 hours"
              }
              kind="bar"
              series={[
                { label: ai ? "App requests" : "Requests", color: "var(--chart-1)" },
                // Before migration 060 there is no AI count, so no series rather than a row of zeros.
                ...(ai ? [{ label: "AI provider calls", color: "var(--chart-2)" }] : []),
              ]}
              points={fillBuckets(data?.metrics).map((b) => ({
                t: b.bucket,
                values: ai ? [b.requests, b.ai_requests ?? 0] : [b.requests],
              }))}
              bucket="hour"
              integer
              format={(v) => Math.round(v).toLocaleString()}
              height={236}
            />
          )}
        </section>

        <LatestChecks runs={data?.latest_runs} pending={pending} />
      </div>

      <AiUsage usage={data?.ai_usage} pending={pending} migrationPending={!!data?.ai_usage_pending} />

      <Accounts accounts={data?.accounts} pending={pending} />
    </div>
  );
}
