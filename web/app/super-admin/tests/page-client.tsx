"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCircleExclamation,
  faCircleXmark,
  faDatabase,
  faFlaskVial,
  faHeartPulse,
  faPlay,
  faRobot,
  faStop,
  faTruckFast,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { apiFetch } from "@/app/lib/api";
import { usePageData } from "@/app/lib/use-page-data";
import { MODEL_EVAL_DATASET, MODEL_EVAL_SNAPSHOT } from "@/app/lib/model-eval-snapshot";
import PageHeader from "../../components/PageHeader";
import { CARD, MigrationPending } from "../ui";
import { formatMs } from "../metrics";
import {
  BENCHMARK_TARGETS,
  CONCURRENCY_LEVELS,
  runBenchmark,
  type BenchmarkResult,
} from "./benchmark";

type Status = "pass" | "warn" | "fail";

interface HealthCheck {
  id: string;
  label: string;
  status: Status;
  detail: string;
  duration_ms?: number;
}

interface DwTiming {
  query_id: string;
  label: string;
  duration_ms: number | null;
  row_count: number | null;
  error: string | null;
}

interface TestRun<S = Record<string, number | string | null>, R = unknown[]> {
  id: string | null;
  kind: "health" | "benchmark" | "dw_benchmark";
  created_at: string;
  summary: S;
  results: R;
  run_by_name?: string | null;
}

type HealthRun = TestRun<{ pass: number; warn: number; fail: number; total: number }, HealthCheck[]>;
type BenchRun = TestRun<
  { requests: number; success_pct: number; worst_p95_ms: number; peak_rps: number; max_concurrency: number },
  BenchmarkResult[]
>;
type DwRun = TestRun<{ queries: number; failed: number; total_ms: number; slowest: string | null }, DwTiming[]>;

interface RunsPayload {
  runs: TestRun[];
  pending_migration?: boolean;
}

const STATUS: Record<Status, { icon: IconDefinition; className: string; label: string }> = {
  pass: { icon: faCircleCheck, className: "text-emerald-600", label: "Pass" },
  warn: { icon: faCircleExclamation, className: "text-amber-600", label: "Warning" },
  fail: { icon: faCircleXmark, className: "text-rose-600", label: "Fail" },
};

const BUTTON =
  "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60";
const PRIMARY = `${BUTTON} bg-brand-600 text-white hover:bg-brand-700`;
const TH = "py-2 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const targetLabel = (id: string) => BENCHMARK_TARGETS.find((t) => t.id === id)?.label ?? id;

export default function TestsClient() {
  const { data, setData } = usePageData("super-admin:test-runs", async (): Promise<RunsPayload> => {
    const res = await apiFetch("/api/super-admin/test-runs");
    return res.ok ? ((await res.json()) as RunsPayload) : { runs: [] };
  });
  const runs = data?.runs ?? [];
  const pending = !!data?.pending_migration;

  const addRun = (run: TestRun) =>
    setData((prev) => ({ ...(prev ?? { runs: [] }), runs: [run, ...(prev?.runs ?? [])] }));

  const ofKind = <T extends TestRun>(kind: TestRun["kind"]) => runs.filter((r) => r.kind === kind) as T[];

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFlaskVial} className="w-3.5 h-3.5" />, label: "System" }}
        title="Test Results"
        subtitle="Health checks, load and warehouse benchmarks, and the prediction models' evaluation"
      />
      {pending && (
        <div className="mb-5">
          <MigrationPending />
        </div>
      )}
      <div className="space-y-5">
        <HealthSection runs={ofKind<HealthRun>("health")} onRun={addRun} />
        <BenchmarkSection runs={ofKind<BenchRun>("benchmark")} onRun={addRun} />
        <DwSection runs={ofKind<DwRun>("dw_benchmark")} onRun={addRun} />
        <MlSection />
      </div>
    </div>
  );
}

function SectionHead({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: IconDefinition;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-600/10 text-brand-600 flex items-center justify-center shrink-0">
          <FontAwesomeIcon icon={icon} className="w-4 h-4" />
        </span>
        <div>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function History<T extends TestRun>({
  runs,
  describe,
  selected,
  onSelect,
}: {
  runs: T[];
  describe: (run: T) => React.ReactNode;
  selected: T | null;
  onSelect: (run: T) => void;
}) {
  if (runs.length < 2) return null;
  return (
    <details className="mt-4">
      <summary className="text-sm text-brand-700 cursor-pointer select-none">Previous runs ({runs.length})</summary>
      <ul className="mt-2 divide-y divide-hairline border border-hairline rounded-xl overflow-hidden">
        {runs.map((run, i) => (
          <li key={run.id ?? i}>
            <button
              type="button"
              onClick={() => onSelect(run)}
              className={`w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-subtle ${
                selected === run ? "bg-subtle" : ""
              }`}
            >
              <span className="text-gray-700">
                {when(run.created_at)}
                {run.run_by_name && <span className="text-gray-400"> · {run.run_by_name}</span>}
              </span>
              <span className="text-gray-500 text-xs">{describe(run)}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---------------------------------------------------------------- health */

function HealthSection({ runs, onRun }: { runs: HealthRun[]; onRun: (run: TestRun) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<HealthRun | null>(null);
  const shown = picked ?? runs[0] ?? null;

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/super-admin/health", { method: "POST" });
    setBusy(false);
    const json = (await res.json().catch(() => ({}))) as { run?: HealthRun; error?: string };
    if (!res.ok || !json.run) return setError(json.error ?? "The checks could not run");
    setPicked(null);
    onRun(json.run);
  };

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionHead icon={faHeartPulse} title="Health checks" subtitle="Is every dependency reachable and configured right now?">
        <button type="button" onClick={run} disabled={busy} className={PRIMARY}>
          <FontAwesomeIcon icon={faPlay} className="w-3 h-3" />
          {busy ? "Checking…" : "Run checks"}
        </button>
      </SectionHead>
      {error && <p className="text-sm text-rose-700 mb-3">{error}</p>}
      {!shown ? (
        <p className="text-sm text-gray-400">No health check has been run yet.</p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2">
            {when(shown.created_at)} · {shown.summary.pass}/{shown.summary.total} passing
            {shown.summary.warn > 0 && `, ${shown.summary.warn} warning${shown.summary.warn > 1 ? "s" : ""}`}
            {shown.summary.fail > 0 && `, ${shown.summary.fail} failing`}
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {shown.results.map((check) => {
              const s = STATUS[check.status];
              return (
                <li key={check.id} className="flex items-start gap-3 p-3 rounded-xl border border-hairline">
                  <FontAwesomeIcon icon={s.icon} className={`w-4 h-4 mt-0.5 ${s.className}`} aria-label={s.label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {check.label}
                      <span className={`ml-2 text-xs font-normal ${s.className}`}>{s.label}</span>
                    </p>
                    <p className="text-xs text-gray-500">{check.detail}</p>
                  </div>
                  {check.duration_ms !== undefined && (
                    <span className="text-xs tabular-nums text-gray-400">{formatMs(check.duration_ms)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <History
        runs={runs}
        selected={shown}
        onSelect={setPicked}
        describe={(r) => `${r.summary.pass}/${r.summary.total} passing`}
      />
    </section>
  );
}

/* ------------------------------------------------------------- benchmark */

function BenchmarkSection({ runs, onRun }: { runs: BenchRun[]; onRun: (run: TestRun) => void }) {
  const [targets, setTargets] = useState<string[]>(BENCHMARK_TARGETS.map((t) => t.id));
  const [levels, setLevels] = useState<number[]>(CONCURRENCY_LEVELS);
  const [perLevel, setPerLevel] = useState(20);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<BenchRun | null>(null);
  const abort = useRef<AbortController | null>(null);
  const shown = picked ?? runs[0] ?? null;
  const running = progress !== null;

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const start = async () => {
    if (!targets.length || !levels.length) return;
    setError(null);
    abort.current = new AbortController();
    const results = await runBenchmark({
      targets,
      levels: [...levels].sort((a, b) => a - b),
      perLevel,
      signal: abort.current.signal,
      onProgress: (done, total, label) => setProgress({ done, total, label }),
    });
    const stopped = abort.current.signal.aborted;
    setProgress(null);
    if (stopped || results.length === 0) return;
    const res = await apiFetch("/api/super-admin/test-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    const json = (await res.json().catch(() => ({}))) as { run?: BenchRun; error?: string };
    if (!res.ok || !json.run) return setError(json.error ?? "The run finished but could not be saved");
    setPicked(null);
    onRun(json.run);
  };

  const maxP95 = shown ? Math.max(1, ...shown.results.map((r) => r.p95_ms)) : 1;
  const totalRequests = targets.length * levels.length * perLevel;

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionHead
        icon={faTruckFast}
        title="Load benchmark"
        subtitle="Response time, throughput and reliability as concurrent users increase (scalability)"
      >
        {running ? (
          <button type="button" onClick={() => abort.current?.abort()} className={`${BUTTON} border border-rose-200 text-rose-700 hover:bg-rose-50`}>
            <FontAwesomeIcon icon={faStop} className="w-3 h-3" />
            Stop
          </button>
        ) : (
          <button type="button" onClick={start} disabled={!targets.length || !levels.length} className={PRIMARY}>
            <FontAwesomeIcon icon={faPlay} className="w-3 h-3" />
            Run benchmark
          </button>
        )}
      </SectionHead>

      <fieldset disabled={running} aria-label="Benchmark settings" className="flex flex-wrap gap-x-6 gap-y-3 mb-4 text-sm">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Targets</p>
          <div className="flex flex-wrap gap-1.5">
            {BENCHMARK_TARGETS.map((t) => (
              <Chip key={t.id} active={targets.includes(t.id)} onClick={() => setTargets(toggle(targets, t.id))}>
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Concurrent users</p>
          <div className="flex flex-wrap gap-1.5">
            {CONCURRENCY_LEVELS.map((c) => (
              <Chip key={c} active={levels.includes(c)} onClick={() => setLevels(toggle(levels, c))}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <label>
          <span className="block text-xs font-medium text-gray-500 mb-1.5">Requests per level</span>
          <select
            value={perLevel}
            onChange={(e) => setPerLevel(Number(e.target.value))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg bg-surface text-gray-800"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <p className="text-xs text-gray-500 mb-4">
        {totalRequests.toLocaleString()} read-only requests from this browser. Each counts toward Supabase usage; the
        warehouse target is the heaviest.
      </p>

      {progress && (
        <div className="mb-4" role="status">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{progress.label}</span>
            <span className="tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-[width]"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-rose-700 mb-3">{error}</p>}

      {!shown ? (
        !running && <p className="text-sm text-gray-400">No benchmark has been run yet.</p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2">
            {when(shown.created_at)} · {shown.summary.requests.toLocaleString()} requests · {shown.summary.success_pct}%
            successful · peak {shown.summary.peak_rps} req/s
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle">
                <tr>
                  <th className={`${TH} text-left`}>Target</th>
                  <th className={`${TH} text-right`}>Users</th>
                  <th className={`${TH} text-right`}>p50</th>
                  <th className={`${TH} text-left w-[30%]`}>p95</th>
                  <th className={`${TH} text-right`}>Req/s</th>
                  <th className={`${TH} text-right`}>Success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {shown.results.map((r, i) => {
                  const first = i === 0 || shown.results[i - 1].target !== r.target;
                  return (
                    <tr key={`${r.target}-${r.concurrency}`}>
                      <td className="py-1.5 px-3 text-gray-700">{first ? targetLabel(r.target) : ""}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-gray-600">{r.concurrency}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-gray-600">{formatMs(r.p50_ms)}</td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-subtle overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(r.p95_ms / maxP95) * 100}%`, background: "var(--chart-2)" }}
                            />
                          </div>
                          <span className="tabular-nums text-gray-900 w-16 text-right">{formatMs(r.p95_ms)}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-gray-600">{r.rps}</td>
                      <td
                        className={`py-1.5 px-3 text-right tabular-nums ${
                          r.ok < r.requests ? "text-rose-700 font-medium" : "text-gray-600"
                        }`}
                      >
                        {Math.round((r.ok / Math.max(r.requests, 1)) * 1000) / 10}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <History
        runs={runs}
        selected={shown}
        onSelect={setPicked}
        describe={(r) => `worst p95 ${formatMs(r.summary.worst_p95_ms)} · ${r.summary.success_pct}% ok`}
      />
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
        active ? "border-brand-600 bg-brand-600/10 text-brand-700" : "border-gray-200 text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ warehouse */

function DwSection({ runs, onRun }: { runs: DwRun[]; onRun: (run: TestRun) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<DwRun | null>(null);
  const shown = picked ?? runs[0] ?? null;

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/super-admin/dw-benchmark", { method: "POST" });
    setBusy(false);
    const json = (await res.json().catch(() => ({}))) as { run?: DwRun; error?: string; pending_migration?: boolean };
    if (json.pending_migration) return setError("Apply migration 054 to run the warehouse benchmark.");
    if (!res.ok || !json.run) return setError(json.error ?? "The benchmark could not run");
    setPicked(null);
    onRun(json.run);
  };

  const maxMs = shown ? Math.max(1, ...shown.results.map((r) => Number(r.duration_ms ?? 0))) : 1;

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionHead
        icon={faDatabase}
        title="Data warehouse query benchmark"
        subtitle="Execution time of the six analytical workloads, measured inside the database"
      >
        <button type="button" onClick={run} disabled={busy} className={PRIMARY}>
          <FontAwesomeIcon icon={faPlay} className="w-3 h-3" />
          {busy ? "Running…" : "Run benchmark"}
        </button>
      </SectionHead>
      {error && <p className="text-sm text-rose-700 mb-3">{error}</p>}
      {!shown ? (
        <p className="text-sm text-gray-400">No warehouse benchmark has been run yet.</p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2">
            {when(shown.created_at)} · {shown.summary.total_ms} ms total
            {shown.summary.failed > 0 && ` · ${shown.summary.failed} failed`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle">
                <tr>
                  <th className={`${TH} text-left`}>Query</th>
                  <th className={`${TH} text-left w-[40%]`}>Execution time</th>
                  <th className={`${TH} text-right`}>Rows</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {shown.results.map((q) => (
                  <tr key={q.query_id}>
                    <td className="py-1.5 px-3 text-gray-700">
                      <span className="text-gray-400 mr-2">{q.query_id}</span>
                      {q.label}
                    </td>
                    <td className="py-1.5 px-3">
                      {q.error ? (
                        <span className="text-xs text-rose-700">{q.error}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-subtle overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(Number(q.duration_ms) / maxMs) * 100}%`, background: "var(--chart-1)" }}
                            />
                          </div>
                          <span className="tabular-nums text-gray-900 w-20 text-right">{Number(q.duration_ms).toFixed(2)} ms</span>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-gray-600">{q.row_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <History
        runs={runs}
        selected={shown}
        onSelect={setPicked}
        describe={(r) => `${r.summary.total_ms} ms total${r.summary.failed ? `, ${r.summary.failed} failed` : ""}`}
      />
    </section>
  );
}

/* ------------------------------------------------------------------- ML */

function MlSection() {
  const models = Object.values(MODEL_EVAL_SNAPSHOT);
  const metrics = [
    ["accuracy", "Accuracy"],
    ["precision", "Precision"],
    ["recall", "Recall"],
    ["f1", "F1"],
    ["rocAuc", "ROC-AUC"],
  ] as const;
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionHead
        icon={faRobot}
        title="Risk-prediction model evaluation"
        subtitle={`${MODEL_EVAL_DATASET.name} set: ${MODEL_EVAL_DATASET.samples.toLocaleString()} samples, ${Math.round(
          MODEL_EVAL_DATASET.atRiskRate * 1000,
        ) / 10}% at-risk, threshold ${MODEL_EVAL_DATASET.threshold}`}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-subtle">
            <tr>
              <th className={`${TH} text-left`}>Model</th>
              {metrics.map(([, label]) => (
                <th key={label} className={`${TH} text-right`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {models.map((m) => (
              <tr key={m.model}>
                <td className="py-2 px-3 text-gray-800 font-medium">{m.model}</td>
                {metrics.map(([key]) => (
                  <td key={key} className="py-2 px-3 text-right tabular-nums text-gray-700">
                    {(m[key] * 100).toFixed(1)}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {models.map(
          (m) =>
            m.confusion && (
              <div key={m.model} className="p-3 rounded-xl border border-hairline">
                <p className="text-xs font-medium text-gray-600 mb-2">Confusion matrix · {m.model}</p>
                <table className="w-full text-xs text-center tabular-nums">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-normal py-1" />
                      <th className="font-normal py-1">Predicted at-risk</th>
                      <th className="font-normal py-1">Predicted on track</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th className="text-left font-normal text-gray-500 py-1">Actually at-risk</th>
                      <td className="py-1.5 bg-brand-600/10 text-gray-900 font-semibold rounded-l">{m.confusion.tp}</td>
                      <td className="py-1.5 text-gray-600">{m.confusion.fn}</td>
                    </tr>
                    <tr>
                      <th className="text-left font-normal text-gray-500 py-1">Actually on track</th>
                      <td className="py-1.5 text-gray-600">{m.confusion.fp}</td>
                      <td className="py-1.5 bg-brand-600/10 text-gray-900 font-semibold rounded-r">{m.confusion.tn}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ),
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        A fixed offline snapshot from <code className="font-mono">ml/eval/predict_eval.py</code>; the warehouse has no
        ground-truth outcomes to score live predictions against.
      </p>
    </section>
  );
}
