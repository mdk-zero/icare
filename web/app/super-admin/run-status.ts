import { formatMs, reliabilityTone, type Tone } from "./metrics";

/** "idle" is a run with no verdict: never run, or still running. */
export type RunTone = Tone | "idle";

export interface RunVerdict {
  tone: RunTone;
  text: string;
}

export type RunKind = "health" | "e2e" | "api" | "benchmark" | "dw_benchmark";

/** Every recorded suite, in the order the System Tests page lays them out. */
export const RUN_KINDS: { kind: RunKind; label: string; anchor: string }[] = [
  { kind: "health", label: "System health checks", anchor: "health" },
  { kind: "e2e", label: "Frontend tests", anchor: "e2e" },
  { kind: "api", label: "API tests", anchor: "api" },
  { kind: "benchmark", label: "Load benchmark", anchor: "load" },
  { kind: "dw_benchmark", label: "Data warehouse benchmark", anchor: "warehouse" },
];

/** Playwright's per-test timeout is 45 s; a run silent for longer than this has died. */
export const STALE_RUN_MS = 2 * 60_000;

type Summary = Record<string, number | string | null | undefined>;

const num = (s: Summary, key: string) => Number(s[key] ?? 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** One run's outcome in a word and a colour, the same on the dashboard and the System Tests page. */
export function runVerdict(kind: RunKind, summary: Summary | null | undefined, now = Date.now()): RunVerdict {
  if (!summary) return { tone: "idle", text: "Not run yet" };
  switch (kind) {
    case "health": {
      const fail = num(summary, "fail");
      const warn = num(summary, "warn");
      if (fail) return { tone: "bad", text: `${fail} failing` };
      if (warn) return { tone: "warn", text: plural(warn, "warning") };
      return { tone: "good", text: `${num(summary, "pass")}/${num(summary, "total")} passing` };
    }
    case "e2e":
    case "api": {
      const failed = num(summary, "failed");
      const passed = num(summary, "passed");
      const updated = typeof summary.updated_at === "string" ? Date.parse(summary.updated_at) : NaN;
      const live = summary.status === "running" && !(now - updated > STALE_RUN_MS);
      if (live) return { tone: "idle", text: `Running · ${num(summary, "total")} done` };
      if (failed) return { tone: "bad", text: `${failed} failing` };
      const stopped = summary.status === "interrupted" || summary.status === "running";
      if (stopped) return { tone: "warn", text: `Stopped early · ${passed} passed` };
      return passed ? { tone: "good", text: `${passed} passed` } : { tone: "warn", text: "No tests ran" };
    }
    case "benchmark": {
      const ok = num(summary, "success_pct");
      return {
        tone: reliabilityTone(ok),
        text: `${ok}% succeeded · slowest p95 ${formatMs(num(summary, "worst_p95_ms"))}`,
      };
    }
    case "dw_benchmark": {
      const failed = num(summary, "failed");
      const queries = num(summary, "queries");
      if (failed) return { tone: "bad", text: `${failed} of ${queries} queries failed` };
      return { tone: "good", text: `${plural(queries, "query", "queries")} · ${num(summary, "total_ms")} ms total` };
    }
  }
}

export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
