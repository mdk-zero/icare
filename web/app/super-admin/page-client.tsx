"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faHouse } from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import PageHeader from "../components/PageHeader";
import TimeSeriesChart from "./TimeSeriesChart";
import { CARD, MigrationPending } from "./ui";
import { formatMs, formatPct, reliability, type MetricsSummary } from "./metrics";

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
  pending_migration: boolean;
}

const ROLES = [
  { key: "student", label: "Students" },
  { key: "faculty", label: "Faculty" },
  { key: "admin", label: "Admins" },
  { key: "super_admin", label: "Super admins" },
];

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function Tile({ label, value, detail, href }: { label: string; value: string; detail?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800 tabular-nums mt-0.5">{value}</p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
    </>
  );
  return href ? (
    <Link href={href} className={`${CARD} p-4 block hover:border-gray-300 transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={`${CARD} p-4`}>{body}</div>
  );
}

export default function SuperAdminDashboardClient() {
  const { data, loading } = usePageData("super-admin:overview", async (): Promise<Overview | null> => {
    const res = await apiFetch("/api/super-admin/overview");
    return res.ok ? ((await res.json()) as Overview) : null;
  });

  const totals = data?.metrics?.totals;
  const health = data?.latest_runs.health;
  const bench = data?.latest_runs.benchmark;
  const dw = data?.latest_runs.dw_benchmark;
  const dash = loading && !data ? "–" : "—";

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5" />, label: "System Administration" }}
        title="System Dashboard"
        subtitle="Accounts, live performance and the latest test results at a glance"
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
        />
        <Tile
          label="Active in 7 days"
          value={data ? data.accounts.active_7d.toLocaleString() : dash}
          detail={
            data && data.accounts.total
              ? `${Math.round((data.accounts.active_7d / data.accounts.total) * 100)}% of accounts`
              : undefined
          }
        />
        <Tile
          label="Response time · 24 h"
          value={totals?.requests ? formatMs(totals.p95_ms) : dash}
          detail={totals?.requests ? `p95 · median ${formatMs(totals.p50_ms)}` : "No requests yet"}
          href="/super-admin/performance"
        />
        <Tile
          label="Reliability · 24 h"
          value={totals?.requests ? formatPct(reliability(totals.requests, totals.errors)) : dash}
          detail={totals?.requests ? `${totals.errors} errors in ${totals.requests.toLocaleString()} requests` : undefined}
          href="/super-admin/performance"
        />
        <Tile
          label="Health"
          value={health ? `${health.summary.pass}/${health.summary.total}` : dash}
          detail={
            health
              ? `${health.summary.fail ? `${health.summary.fail} failing · ` : health.summary.warn ? `${health.summary.warn} warning · ` : ""}checked ${ago(health.created_at)}`
              : "Not checked yet"
          }
          href="/super-admin/tests"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <section className={`${CARD} p-4 xl:col-span-2`}>
          <h2 className="font-semibold text-gray-800">Requests per hour</h2>
          <p className="text-xs text-gray-500 mb-3">Last 24 hours of API traffic from the web app</p>
          <TimeSeriesChart
            ariaLabel="API requests per hour over the last 24 hours"
            kind="bar"
            series={[{ label: "Requests", color: "var(--chart-1)" }]}
            points={(data?.metrics?.series ?? []).map((b) => ({ t: b.bucket, values: [b.requests] }))}
            bucket="hour"
            format={(v) => Math.round(v).toLocaleString()}
            height={200}
          />
        </section>

        <section className={`${CARD} p-4`}>
          <h2 className="font-semibold text-gray-800 mb-3">Accounts by role</h2>
          <ul className="space-y-3">
            {ROLES.map((r) => {
              const count = data?.accounts.by_role[r.key] ?? 0;
              const share = data?.accounts.total ? count / data.accounts.total : 0;
              return (
                <li key={r.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{r.label}</span>
                    <span className="font-semibold text-gray-900 tabular-nums">{data ? count : dash}</span>
                  </div>
                  <div className="h-2 rounded-full bg-subtle overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: "var(--chart-1)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className={`${CARD} p-4`}>
          <h2 className="font-semibold text-gray-800">New accounts</h2>
          <p className="text-xs text-gray-500 mb-3">Per week, last 8 weeks</p>
          <TimeSeriesChart
            ariaLabel="New accounts per week over the last 8 weeks"
            kind="bar"
            series={[{ label: "New accounts", color: "var(--chart-1)" }]}
            points={(data?.accounts.new_per_week ?? []).map((w) => ({ t: w.t, values: [w.count] }))}
            bucket="day"
            format={(v) => Math.round(v).toString()}
            height={170}
          />
        </section>

        <RunCard
          title="Latest load benchmark"
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
          title="Latest warehouse benchmark"
          empty="No warehouse benchmark yet"
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

function RunCard({ title, empty, at, rows }: { title: string; empty: string; at?: string; rows: [string, string][] }) {
  return (
    <section className={`${CARD} p-4 flex flex-col`}>
      <h2 className="font-semibold text-gray-800">{title}</h2>
      <p className="text-xs text-gray-500 mb-3">{at ? ago(at) : " "}</p>
      {rows.length === 0 ? (
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
        Test results
        <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
      </Link>
    </section>
  );
}
