/** Shapes returned by /api/super-admin/metrics (super_admin_metrics_summary, migration 054). */

export interface MetricsBucket {
  bucket: string;
  requests: number;
  p50_ms: number;
  p95_ms: number;
  errors: number;
}

export interface MetricsRoute {
  method: string;
  route: string;
  requests: number;
  p50_ms: number;
  p95_ms: number;
  errors: number;
}

export interface MetricsSummary {
  pending_migration?: boolean;
  range?: string;
  bucket?: "minute" | "hour" | "day";
  since?: string;
  totals?: { requests: number; avg_ms: number | null; p50_ms: number | null; p95_ms: number | null; errors: number };
  series?: MetricsBucket[];
  routes?: MetricsRoute[];
}

export const BUCKET_MINUTES = { minute: 1, hour: 60, day: 1440 } as const;

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s` : `${Math.round(value)} ms`;
}

/** Share of requests that got a non-error answer; errors are 5xx and network failures. */
export function reliability(requests: number, errors: number): number | null {
  return requests > 0 ? ((requests - errors) / requests) * 100 : null;
}

export function formatPct(value: number | null): string {
  if (value === null) return "—";
  return value >= 99.95 || value === 0 ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;
}

/** A bucket after gap filling: latency is null where nothing was measured. */
export interface FilledBucket {
  bucket: string;
  requests: number;
  p50_ms: number | null;
  p95_ms: number | null;
  errors: number;
}

/**
 * The summary only returns buckets that saw traffic, so "last 24 hours" with
 * two busy hours drew two fat bars and a line sloping straight across the
 * quiet hours in between. This lays out every bucket from `since` to `now`:
 * an empty one counts zero requests and has no latency, so bars sit at zero
 * and each reading sits at its real time — the line joins readings across
 * the quiet hours, but the axis shows how long they were.
 */
export function fillBuckets(summary: MetricsSummary | null | undefined, now = Date.now()): FilledBucket[] {
  const series = summary?.series ?? [];
  const bucket = summary?.bucket;
  if (!bucket || !summary?.since) return series;
  const step = BUCKET_MINUTES[bucket] * 60_000;
  const byKey = new Map(series.map((b) => [Math.floor(Date.parse(b.bucket) / step), b]));
  const first = Math.floor(Date.parse(summary.since) / step);
  const last = Math.floor(now / step);
  // A malformed window would loop for ever; fall back to what was returned.
  if (!Number.isFinite(first) || last < first || last - first > 2000) return series;

  const out: FilledBucket[] = [];
  for (let k = first; k <= last; k++) {
    out.push(byKey.get(k) ?? { bucket: new Date(k * step).toISOString(), requests: 0, p50_ms: null, p95_ms: null, errors: 0 });
  }
  return out;
}
