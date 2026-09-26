"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGaugeHigh, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import PageHeader from "../../components/PageHeader";
import TimeSeriesChart from "../TimeSeriesChart";
import {
  BUCKET_MINUTES,
  formatMs,
  formatPct,
  reliability,
  type MetricsRoute,
  type MetricsSummary,
} from "../metrics";
import { CARD, MigrationPending } from "../ui";

const RANGES = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;

type SortKey = "requests" | "p50_ms" | "p95_ms" | "errors";

export default function PerformanceClient() {
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("24h");
  const [sort, setSort] = useState<SortKey>("p95_ms");

  const { data, loading, refresh } = usePageData(
    `super-admin:metrics:${range}`,
    async (): Promise<MetricsSummary | null> => {
      const res = await apiFetch(`/api/super-admin/metrics?range=${range}`);
      return res.ok ? ((await res.json()) as MetricsSummary) : null;
    },
    { keepPreviousData: true },
  );

  const bucket = data?.bucket ?? "hour";
  const series = data?.series ?? [];
  const totals = data?.totals;

  const points = useMemo(
    () => ({
      latency: series.map((b) => ({ t: b.bucket, values: [b.p50_ms, b.p95_ms] })),
      throughput: series.map((b) => ({ t: b.bucket, values: [b.requests / BUCKET_MINUTES[bucket]] })),
      reliability: series.map((b) => ({ t: b.bucket, values: [reliability(b.requests, b.errors)] })),
    }),
    [series, bucket],
  );

  const routes = useMemo(
    () => [...(data?.routes ?? [])].sort((a, b) => b[sort] - a[sort]),
    [data?.routes, sort],
  );

  const windowMinutes = { "1h": 60, "24h": 1440, "7d": 10080, "30d": 43200 }[range];
  const tiles = [
    { label: "Requests", value: totals ? totals.requests.toLocaleString() : "—" },
    {
      label: "Throughput",
      value: totals ? `${(totals.requests / windowMinutes).toFixed(totals.requests / windowMinutes < 10 ? 2 : 0)}/min` : "—",
    },
    { label: "Median response", value: formatMs(totals?.p50_ms) },
    { label: "95th percentile", value: formatMs(totals?.p95_ms) },
    { label: "Reliability", value: totals ? formatPct(reliability(totals.requests, totals.errors)) : "—" },
  ];

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faGaugeHigh} className="w-3.5 h-3.5" />, label: "System" }}
        title="Performance"
        subtitle="Live response time, throughput and reliability, measured from every API call users make"
        action={{
          icon: <FontAwesomeIcon icon={faRotateRight} className="w-3.5 h-3.5" />,
          onClick: () => void refresh(),
          label: "Reload the metrics",
        }}
      />

      <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-xl border border-hairline bg-surface p-1 mb-5">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={range === r.value}
            onClick={() => setRange(r.value)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              range === r.value ? "bg-brand-600 text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {data?.pending_migration ? (
        <MigrationPending />
      ) : !data && !loading ? (
        <div className={`${CARD} p-6 text-sm text-rose-700`}>Couldn&apos;t load the metrics.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            {tiles.map((t) => (
              <div key={t.label} className={`${CARD} p-4`}>
                <p className="text-2xl font-bold text-gray-800 tabular-nums">{loading && !data ? "–" : t.value}</p>
                <p className="text-xs text-gray-500">{t.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
            <section className={`${CARD} p-4 xl:col-span-2`}>
              <h2 className="font-semibold text-gray-800">Response time</h2>
              <p className="text-xs text-gray-500 mb-3">Time from sending a request to its response arriving</p>
              <TimeSeriesChart
                ariaLabel="Response time over time, median and 95th percentile"
                series={[
                  { label: "Median (p50)", color: "var(--chart-1)" },
                  { label: "95th percentile", color: "var(--chart-2)" },
                ]}
                points={points.latency}
                bucket={bucket}
                format={formatMs}
              />
            </section>
            <section className={`${CARD} p-4`}>
              <h2 className="font-semibold text-gray-800">Throughput</h2>
              <p className="text-xs text-gray-500 mb-3">Requests per minute</p>
              <TimeSeriesChart
                ariaLabel="Requests per minute over time"
                kind="bar"
                series={[{ label: "Requests / min", color: "var(--chart-1)" }]}
                points={points.throughput}
                bucket={bucket}
                format={(v) => (v < 10 ? v.toFixed(1) : Math.round(v).toString())}
                height={180}
              />
            </section>
            <section className={`${CARD} p-4`}>
              <h2 className="font-semibold text-gray-800">Reliability</h2>
              <p className="text-xs text-gray-500 mb-3">Requests answered without a server or network error</p>
              <TimeSeriesChart
                ariaLabel="Share of successful requests over time"
                series={[{ label: "Successful", color: "var(--chart-1)" }]}
                points={points.reliability}
                bucket={bucket}
                yMax={100}
                format={(v) => `${Math.round(v)}%`}
                height={180}
              />
            </section>
          </div>

          <section className={`${CARD} overflow-hidden`}>
            <div className="p-4 pb-2">
              <h2 className="font-semibold text-gray-800">Endpoints</h2>
              <p className="text-xs text-gray-500">Slowest first; click a column to re-sort</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-subtle border-y border-gray-100">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Endpoint
                    </th>
                    {(
                      [
                        ["requests", "Requests"],
                        ["p50_ms", "p50"],
                        ["p95_ms", "p95"],
                        ["errors", "Errors"],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th key={key} className="text-right py-2.5 px-4" aria-sort={sort === key ? "descending" : "none"}>
                        <button
                          type="button"
                          onClick={() => setSort(key)}
                          className={`text-[11px] font-semibold uppercase tracking-wider ${
                            sort === key ? "text-brand-700" : "text-gray-500 hover:text-gray-800"
                          }`}
                        >
                          {label}
                          {sort === key && " ↓"}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {routes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-gray-400">
                        {loading ? "Loading…" : "No requests recorded in this window yet"}
                      </td>
                    </tr>
                  ) : (
                    routes.map((r: MetricsRoute) => (
                      <tr key={`${r.method} ${r.route}`} className="hover:bg-subtle">
                        <td className="py-2 px-4 font-mono text-xs text-gray-700">
                          <span className="inline-block w-14 text-gray-400">{r.method}</span>
                          {r.route}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-700">{r.requests.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-700">{formatMs(r.p50_ms)}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-gray-900 font-medium">{formatMs(r.p95_ms)}</td>
                        <td className="py-2 px-4 text-right tabular-nums">
                          {r.errors > 0 ? (
                            <span className="text-rose-700">
                              {r.errors} ({formatPct((r.errors / r.requests) * 100)})
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
