/** Shapes returned by /api/super-admin/metrics (super_admin_metrics_summary, migration 054). */

export interface MetricsBucket {
  bucket: string;
  requests: number;
  p50_ms: number;
  p95_ms: number;
  errors: number;
  /** Calls the server made to AI providers in this bucket (060; absent before). */
  ai_requests?: number;
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
  /** AI provider calls, kept out of the app figures above (060). Errors include 429s. */
  ai?: { requests: number; p50_ms: number | null; p95_ms: number | null; errors: number };
  series?: MetricsBucket[];
  routes?: MetricsRoute[];
}

/** One AI model's calls and tokens over a window (super_admin_ai_usage, 076). */
export interface AiUsageRow {
  /** "<provider>/<model>", as app/lib/ai/record.ts logs it. */
  route: string;
  requests: number;
  errors: number;
  /** Calls that carry token counts: successful ones logged since 076. */
  metered: number;
  input_tokens: number;
  output_tokens: number;
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

/**
 * Never rounds up to a whole 100%: 4 errors in 8,158 requests read "100%"
 * beside "4 errors". Near the top the figure is cut (not rounded) to two
 * places, so it shows 99.95%.
 */
export function formatPct(value: number | null): string {
  if (value === null) return "—";
  if (value === 100 || value === 0) return `${value}%`;
  if (value >= 99) return `${(Math.floor(value * 100) / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  return `${value.toFixed(1)}%`;
}

export type Tone = "good" | "warn" | "bad";

/** Response-time bands, shared by the gauges and the dashboard tile. A typical
 * request should be quick; the slowest 5% get more headroom. */
export const MEDIAN_SCALE = { fast: 300, slow: 1000, max: 3000 };
export const P95_SCALE = { fast: 800, slow: 2500, max: 6000 };

export function speedTone(ms: number, scale: { fast: number; slow: number }): Tone {
  // Same cut-offs as the gauge, whose band changes at each boundary.
  return ms < scale.fast ? "good" : ms < scale.slow ? "warn" : "bad";
}

/** Below 99% one request in a hundred fails, which users notice. */
export function reliabilityTone(pct: number): Tone {
  return pct >= 99.5 ? "good" : pct >= 99 ? "warn" : "bad";
}

/** A bucket after gap filling: latency is null where nothing was measured. */
export interface FilledBucket {
  bucket: string;
  requests: number;
  p50_ms: number | null;
  p95_ms: number | null;
  errors: number;
  ai_requests?: number;
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
    out.push(byKey.get(k) ?? { bucket: new Date(k * step).toISOString(), requests: 0, p50_ms: null, p95_ms: null, errors: 0, ai_requests: 0 });
  }
  return out;
}
