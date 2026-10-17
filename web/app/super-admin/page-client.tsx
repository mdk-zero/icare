"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faHouse } from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import PageHeader from "../components/PageHeader";
import { SkeletonChartBars, SkeletonDonut, SkeletonKeyValues, SkeletonText } from "../components/skeletons";
import AiUsage from "./AiUsage";
import TimeSeriesChart from "./TimeSeriesChart";
import { CARD, MigrationPending } from "./ui";
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

interface Overview {
  accounts: {
    total: number;
    by_role: Record<string, number>;
    active_7d: number;
    new_per_week: { t: string; count: number }[];
  };
  metrics: MetricsSummary | null;
  latest_runs: {
    health: { created_at: string; summary: { pass: number; warn: number; fail: number; total: number } } | null;
    benchmark: {
      created_at: string;
      summary: { requests: number; success_pct: number; worst_p95_ms: number; peak_rps: number; max_concurrency: number };
    } | null;
    dw_benchmark: { created_at: string; summary: { queries: number; failed: number; total_ms: number } } | null;
  };
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

/** Donut of accounts per role. The middle shows the total; hovering a slice or
 * its legend entry swaps in that role's count and share. */
function RolePie({ byRole, total, dash }: { byRole: Record<string, number> | null; total: number; dash: string }) {
  const [active, setActive] = useState<string | null>(null);
  const r = 45;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && ROLES.filter((role) => (byRole?.[role.key] ?? 0) > 0).length > 1 ? 2.5 : 0;
  const hovered = byRole ? ROLES.find((role) => role.key === active) : undefined;
  const hoveredCount = hovered ? (byRole?.[hovered.key] ?? 0) : 0;
  let offset = 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-square w-full max-w-[9.5rem]">
        <svg
          viewBox="0 0 120 120"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`Accounts by role: ${ROLES.map((role) => `${role.label} ${byRole?.[role.key] ?? 0}`).join(", ")}`}
          onMouseLeave={() => setActive(null)}
        >
          <circle cx="60" cy="60" r={r} fill="none" className="stroke-gray-200" strokeWidth="18" />
          {total > 0 &&
            ROLES.map((role) => {
              const len = ((byRole?.[role.key] ?? 0) / total) * c;
              const el =
                len > 0 ? (
                  <circle
                    key={role.key}
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke={role.color}
                    strokeWidth={active === role.key ? 21 : 18}
                    strokeDasharray={`${Math.max(len - gap, 0.1)} ${c}`}
                    strokeDashoffset={-offset}
                    opacity={active && active !== role.key ? 0.35 : 1}
                    className="cursor-pointer transition-[opacity,stroke-width] duration-150"
                    onMouseEnter={() => setActive(role.key)}
                  />
                ) : null;
              offset += len;
              return el;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hovered ? (
            <>
              <p className="text-3xl font-bold text-gray-900 tabular-nums">{hoveredCount.toLocaleString()}</p>
              <p className="text-xs text-gray-500">
                {hovered.label}
                {total > 0 && ` · ${Math.round((100 * hoveredCount) / total)}%`}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-900 tabular-nums">{byRole ? total.toLocaleString() : dash}</p>
              <p className="text-xs text-gray-500">Accounts</p>
            </>
          )}
        </div>
      </div>
      <ul className="divide-y divide-hairline text-sm">
        {ROLES.map((role) => {
          const count = byRole?.[role.key] ?? 0;
          return (
            <li
              key={role.key}
              tabIndex={0}
              className={`flex cursor-default items-center gap-2.5 rounded py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-opacity ${
                active && active !== role.key ? "opacity-50" : ""
              }`}
              onMouseEnter={() => setActive(role.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(role.key)}
              onBlur={() => setActive(null)}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
              <span className="flex-1 text-gray-600">{role.label}</span>
              <span className="font-medium text-gray-900 tabular-nums">{byRole ? count.toLocaleString() : dash}</span>
              <span className="w-10 text-right text-xs text-gray-400 tabular-nums">
                {byRole && total > 0 ? `${Math.round((100 * count) / total)}%` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const TONE: Record<Tone, { dot: string; text: string }> = {
  good: { dot: "bg-emerald-500", text: "text-emerald-700" },
  warn: { dot: "bg-amber-500", text: "text-amber-700" },
  bad: { dot: "bg-rose-500", text: "text-rose-700" },
};

/** A KPI. `status` is the verdict in words beside a coloured dot, so a glance
 * down the row says whether anything needs looking at. */
function Tile({
  label,
  value,
  detail,
  status,
  href,
  pending,
  className = "",
}: {
  label: string;
  value: string;
  detail?: string;
  status?: { tone: Tone; text: string };
  href?: string;
  pending?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {/* On a narrow tile the status drops under the label instead of breaking "24 h" apart. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <p className="text-xs text-gray-500 whitespace-nowrap">{label}</p>
        {status && !pending && (
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium leading-4 ${TONE[status.tone].text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${TONE[status.tone].dot}`} />
            {status.text}
          </span>
        )}
      </div>
      {pending ? (
        <>
          <SkeletonText className="mt-1.5 h-6 w-14" />
          <SkeletonText className="mt-2 h-3 w-24" />
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-800 tabular-nums mt-0.5">{value}</p>
          {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
        </>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className={`${CARD} ${className} p-4 block hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50 transition-colors`}
    >
      {body}
    </Link>
  ) : (
    <div className={`${CARD} ${className} p-4`}>{body}</div>
  );
}

const SPEED_WORD: Record<Tone, string> = { good: "Fast", warn: "Okay", bad: "Slow" };
const RELIABILITY_WORD: Record<Tone, string> = { good: "Stable", warn: "Watch", bad: "Unstable" };

export default function SuperAdminDashboardClient() {
  const { data, loading } = usePageData("super-admin:overview", async (): Promise<Overview | null> => {
    const res = await apiFetch("/api/super-admin/overview");
    return res.ok ? ((await res.json()) as Overview) : null;
  });

  const totals = data?.metrics?.totals;
  const health = data?.latest_runs.health;
  const bench = data?.latest_runs.benchmark;
  const ai = data?.metrics?.ai;
  const dw = data?.latest_runs.dw_benchmark;
  const pending = loading && !data;
  const dash = "—";
  const successPct = totals?.requests ? reliability(totals.requests, totals.errors) : null;
  const speed = totals?.requests && totals.p95_ms !== null ? speedTone(totals.p95_ms, P95_SCALE) : null;
  const steady = successPct !== null ? reliabilityTone(successPct) : null;
  const healthTone: Tone | null = health ? (health.summary.fail ? "bad" : health.summary.warn ? "warn" : "good") : null;

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />, label: "System Administration" }}
        title="System Dashboard"
        subtitle="Accounts, system performance and the latest system tests at a glance"
      />

      {data?.pending_migration && (
        <div className="mb-5">
          <MigrationPending />
        </div>
      )}
      {!data && !loading && (
        <div className={`${CARD} p-6 mb-5 text-sm text-rose-700`}>Couldn&apos;t load the dashboard.</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Tile
          label="Accounts"
          value={data ? data.accounts.total.toLocaleString() : dash}
          detail={data ? `${data.accounts.by_role.student ?? 0} students` : undefined}
          href="/super-admin/users"
          pending={pending}
        />
        <Tile
          label="Active users · 7 days"
          value={data ? data.accounts.active_7d.toLocaleString() : dash}
          detail={
            data && data.accounts.total
              ? `${Math.round((data.accounts.active_7d / data.accounts.total) * 100)}% of accounts`
              : undefined
          }
          pending={pending}
        />
        <Tile
          label="Response time · 24 h"
          value={totals?.requests ? formatMs(totals.p95_ms) : dash}
          detail={totals?.requests ? `p95 · median ${formatMs(totals.p50_ms)}` : "No requests yet"}
          status={speed ? { tone: speed, text: SPEED_WORD[speed] } : undefined}
          href="/super-admin/performance"
          pending={pending}
        />
        <Tile
          label="Reliability · 24 h"
          value={successPct !== null ? formatPct(successPct) : dash}
          detail={
            totals?.requests
              ? `${totals.errors.toLocaleString()} ${totals.errors === 1 ? "error" : "errors"} in ${totals.requests.toLocaleString()} requests`
              : undefined
          }
          status={steady ? { tone: steady, text: RELIABILITY_WORD[steady] } : undefined}
          href="/super-admin/performance"
          pending={pending}
        />
        <Tile
          label="System Health"
          value={health ? `${health.summary.pass}/${health.summary.total}` : dash}
          detail={
            health
              ? `${health.summary.fail ? `${health.summary.fail} failing · ` : health.summary.warn ? `${health.summary.warn} warning · ` : ""}checked ${ago(health.created_at)}`
              : "Not checked yet"
          }
          status={
            healthTone
              ? { tone: healthTone, text: healthTone === "bad" ? "Failing" : healthTone === "warn" ? "Warning" : "All passing" }
              : undefined
          }
          href="/super-admin/tests"
          pending={pending}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <section className={`${CARD} p-4 xl:col-span-2`}>
          <h2 className="font-semibold text-gray-800">Requests per hour</h2>
          <p className="text-xs text-gray-500 mb-3">
            {ai
              ? `Last 24 hours of API traffic from the web app, and the ${ai.requests.toLocaleString()} calls the server made to AI providers`
              : "Last 24 hours of API traffic from the web app"}
          </p>
          {pending ? (
            <SkeletonChartBars height={256} />
          ) : (
          <TimeSeriesChart
            ariaLabel={ai ? "API requests and AI provider calls per hour over the last 24 hours" : "API requests per hour over the last 24 hours"}
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
            height={256}
          />
          )}
        </section>

        <section className={`${CARD} p-4`}>
          <h2 className="font-semibold text-gray-800 mb-3">Accounts by role</h2>
          {pending ? (
            <SkeletonDonut />
          ) : (
            <RolePie byRole={data?.accounts.by_role ?? null} total={data?.accounts.total ?? 0} dash={dash} />
          )}
        </section>
      </div>

      <AiUsage usage={data?.ai_usage} pending={pending} migrationPending={!!data?.ai_usage_pending} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className={`${CARD} p-4`}>
          <h2 className="font-semibold text-gray-800">New accounts</h2>
          <p className="text-xs text-gray-500 mb-3">Per week, last 8 weeks</p>
          {pending ? (
            <SkeletonChartBars height={170} bars={8} />
          ) : (
          <TimeSeriesChart
            ariaLabel="New accounts per week over the last 8 weeks"
            kind="bar"
            series={[{ label: "New accounts", color: "var(--chart-1)" }]}
            points={(data?.accounts.new_per_week ?? []).map((w) => ({ t: w.t, values: [w.count] }))}
            bucket="day"
            integer
            format={(v) => Math.round(v).toString()}
            height={170}
          />
          )}
        </section>

        <RunCard
          title="Latest load benchmark"
          pending={pending}
          empty="No load benchmark yet"
          at={bench?.created_at}
          rows={
            bench
              ? [
                  ["Worst p95", formatMs(bench.summary.worst_p95_ms)],
                  ["Peak throughput", `${bench.summary.peak_rps} req/s`],
                  ["Success", `${bench.summary.success_pct}%`],
                  ["Up to", `${bench.summary.max_concurrency} concurrent users`],
                ]
              : []
          }
        />
        <RunCard
          title="Latest data warehouse benchmark"
          pending={pending}
          empty="No data warehouse benchmark yet"
          at={dw?.created_at}
          rows={
            dw
              ? [
                  ["Queries", `${dw.summary.queries - dw.summary.failed}/${dw.summary.queries} ran`],
                  ["Total execution", `${dw.summary.total_ms} ms`],
                ]
              : []
          }
        />
      </div>
    </div>
  );
}

function RunCard({
  title,
  empty,
  at,
  rows,
  pending,
}: {
  title: string;
  empty: string;
  at?: string;
  rows: [string, string][];
  pending?: boolean;
}) {
  return (
    <section className={`${CARD} p-4 flex flex-col`}>
      <h2 className="font-semibold text-gray-800">{title}</h2>
      {pending ? (
        <SkeletonText className="mb-3 mt-1 h-3 w-16" />
      ) : (
        <p className="text-xs text-gray-500 mb-3">{at ? ago(at) : " "}</p>
      )}
      {pending ? (
        <div className="flex-1">
          <SkeletonKeyValues />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 flex-1">{empty}</p>
      ) : (
        <dl className="space-y-1.5 text-sm flex-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium text-gray-900 tabular-nums text-right">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link
        href="/super-admin/tests"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        System tests
        <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
      </Link>
    </section>
  );
}
