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
