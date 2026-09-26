/**
 * The load benchmark, run from the super admin's browser so it isn't bound
 * by a serverless function's time limit. Each target is hit `perLevel` times
 * at each concurrency level; wall time over the level gives throughput, and
 * the spread of per-request times gives p50/p95.
 *
 * Requests go through plain fetch, not apiFetch: they must skip the response
 * cache, and they must not land in the live telemetry they would skew.
 */

export const BENCHMARK_TARGETS = [
  { id: "health", label: "Baseline (no DB)", url: "/api/health" },
  { id: "auth", label: "Auth check", url: "/api/super-admin/probe?target=auth" },
  { id: "db", label: "Database read", url: "/api/super-admin/probe?target=db" },
  { id: "dw", label: "Warehouse query", url: "/api/super-admin/probe?target=dw" },
] as const;

export const CONCURRENCY_LEVELS = [1, 5, 10, 25];

export interface BenchmarkResult {
  target: string;
  concurrency: number;
  requests: number;
  ok: number;
  p50_ms: number;
  p95_ms: number;
  avg_ms: number;
  rps: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

async function level(url: string, concurrency: number, total: number, signal: AbortSignal) {
  const times: number[] = [];
  let ok = 0;
  let next = 0;
  const started = performance.now();
  const worker = async () => {
    while (next < total && !signal.aborted) {
      next += 1;
      const t0 = performance.now();
      try {
        const res = await fetch(url, { credentials: "include", cache: "no-store", signal });
        await res.arrayBuffer();
        if (res.ok) ok += 1;
      } catch {
        if (signal.aborted) return;
      }
      times.push(performance.now() - t0);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  const wall = (performance.now() - started) / 1000;
  times.sort((a, b) => a - b);
  return {
    requests: times.length,
    ok,
    p50_ms: Math.round(percentile(times, 0.5)),
    p95_ms: Math.round(percentile(times, 0.95)),
    avg_ms: Math.round(times.reduce((s, t) => s + t, 0) / Math.max(times.length, 1)),
    rps: Math.round((times.length / Math.max(wall, 0.001)) * 10) / 10,
  };
}

export async function runBenchmark(options: {
  targets: string[];
  levels: number[];
  perLevel: number;
  signal: AbortSignal;
  onProgress: (done: number, total: number, label: string) => void;
}): Promise<BenchmarkResult[]> {
  const targets = BENCHMARK_TARGETS.filter((t) => options.targets.includes(t.id));
  const steps = targets.length * options.levels.length;
  const results: BenchmarkResult[] = [];
  let done = 0;
  for (const target of targets) {
    for (const concurrency of options.levels) {
      if (options.signal.aborted) return results;
      options.onProgress(done, steps, `${target.label} × ${concurrency}`);
      const r = await level(target.url, concurrency, options.perLevel, options.signal);
      results.push({ target: target.id, concurrency, ...r });
      done += 1;
    }
  }
  options.onProgress(done, steps, "Done");
  return results;
}
