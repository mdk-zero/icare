import type { getSupabaseAdmin } from './supabase/server';
import { kindOf, scenarioKinds } from './scenario-kind';
import type { WorkKind } from './work-kinds';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** One graded piece of work, dated by the day the student handed it in (UTC). */
export interface GradedWork {
  student_id: string;
  kind: WorkKind;
  score: number;
  date: string;
}

/** Ids per `in` filter: each is a URL-encoded query param, so keep it short. */
const CHUNK = 150;
const DAY_MS = 24 * 60 * 60 * 1000;

const day = (ts: string) => new Date(ts).toISOString().slice(0, 10);

function chunks<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

async function readAll<T>(
  ids: readonly string[],
  read: (part: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const results = await Promise.all(chunks(ids).map(read));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return results.flatMap((r) => (r.data ?? []) as T[]);
}

/**
 * Every graded piece of work these students handed in from `from` through
 * `to` (YYYY-MM-DD, inclusive; `to` may be null), read live from the app's
 * own tables. The same rows, scores and dates as the graded rows of the
 * warehouse's dw.fact_student_work (migration 085), so a chart drawn from
 * these agrees with the dashboard figures beside it. `kinds` limits which
 * kinds are read.
 */
export async function loadGradedWork(
  supabase: Supabase,
  studentIds: readonly string[],
  window: { from: string; to: string | null; kinds: readonly WorkKind[] },
): Promise<GradedWork[]> {
  const { from, to, kinds } = window;
  if (studentIds.length === 0 || kinds.length === 0) return [];
  const wants = new Set(kinds);
  const inWindow = (date: string) => date >= from && (!to || date <= to);
  const toBound = to ? new Date(Date.parse(to) + DAY_MS).toISOString() : null;

  const [attempts, assignments, submissions] = await Promise.all([
    wants.has('quiz')
      ? readAll<{ student_id: string; score: number | null; submitted_at: string | null; created_at: string }>(
          studentIds,
          (part) => {
            // An attempt is dated by its submission, or its start when it has none;
            // it can't be submitted before it starts, so `to` bounds the start too.
            let q = supabase
              .from('assessment_attempts')
              .select('student_id, score, submitted_at, created_at')
              .eq('status', 'submitted')
              .in('student_id', part)
              .or(`submitted_at.gte.${from},created_at.gte.${from}`);
            if (toBound) q = q.lt('created_at', toBound);
            return q;
          },
        )
      : [],
    wants.has('patient_case') || wants.has('return_demo')
      ? readAll<{ student_id: string; scenario_id: string; score: number | null; submitted_at: string | null; completed_at: string | null }>(
          studentIds,
          (part) =>
            supabase
              .from('scenario_assignments')
              .select('student_id, scenario_id, score, submitted_at, completed_at')
              .eq('status', 'completed')
              .in('student_id', part)
              .or(`submitted_at.gte.${from},completed_at.gte.${from}`),
        )
      : [],
    wants.has('case_presentation')
      ? readAll<{ student_id: string; score: number | null; submitted_at: string | null; graded_at: string | null; updated_at: string }>(
          studentIds,
          (part) =>
            supabase
              .from('case_submissions')
              .select('student_id, score, submitted_at, graded_at, updated_at')
              .eq('status', 'graded')
              .in('student_id', part)
              .or(`submitted_at.gte.${from},graded_at.gte.${from},updated_at.gte.${from}`),
        )
      : [],
  ]);

  const work: GradedWork[] = [];
  const add = (student_id: string, kind: WorkKind, score: number | null, ts: string | null) => {
    if (score === null || score === undefined || !ts || !wants.has(kind)) return;
    const date = day(ts);
    if (inWindow(date)) work.push({ student_id, kind, score: Number(score), date });
  };

  for (const a of attempts) add(a.student_id, 'quiz', a.score, a.submitted_at ?? a.created_at);
  const scenarioKind = assignments.length
    ? await scenarioKinds(supabase, assignments.map((a) => a.scenario_id))
    : new Map();
  for (const a of assignments) {
    add(a.student_id, kindOf(scenarioKind, a.scenario_id), a.score, a.submitted_at ?? a.completed_at);
  }
  for (const s of submissions) add(s.student_id, 'case_presentation', s.score, s.submitted_at ?? s.graded_at ?? s.updated_at);
  return work;
}
