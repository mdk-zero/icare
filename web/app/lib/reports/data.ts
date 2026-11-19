/**
 * The per-student figures several reports share, read the way the app reads
 * them: groups from team_members, scenario grades from graded (completed)
 * assignments, case grades from graded submissions, and quiz grades from
 * submitted attempts, each quiz the average of its graded tries.
 */
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { ofKind, scenarioKinds } from '../scenario-kind';
import { readMatching } from '../fetch-all';
import { addScore, dateLabel, emptyTotals, type KindTotals } from './view';
export { PASSING_SCORE, NEEDS_PRACTICE_BELOW } from './bands';
// Defined beside the other pure report figures so the demo can use it; see the note there.
export { DORMANT_DAYS } from './view';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function date(value: string | null): string {
  return dateLabel(value);
}

export function isLate(submittedAt: string | null, deadline: string | null): boolean {
  return Boolean(submittedAt && deadline && new Date(submittedAt).getTime() > new Date(deadline).getTime());
}

/**
 * How a scenario assignment reads on the review page: handed in but not yet
 * graded is "Awaiting grade", a graded one is "Graded".
 */
export function scenarioStatus(a: { status: string; submitted_at: string | null }): string {
  if (a.status === 'completed') return 'Performed';
  if (a.submitted_at) return 'Awaiting grade';
  if (a.status === 'in_progress') return 'In progress';
  if (a.status === 'overdue') return 'Overdue';
  return 'Not started';
}

export const CASE_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  draft: 'Draft',
  submitted: 'Awaiting grade',
  graded: 'Presented',
};

/** Each student's group name; students in none are left out. */
export async function groupNames(supabase: Supabase, studentIds: readonly string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('team_members')
    .select('student_id, teams!inner(name)')
    .in('student_id', [...studentIds]);
  if (error) {
    console.error('Report: failed to read groups', error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((r) => [r.student_id as string, (r.teams as unknown as { name: string }).name]),
  );
}

export interface StudentWork {
  /**
   * Every graded piece of work, summed by kind for the "Overall average" (see view.ts).
   * Each submitted quiz try counts on its own; practice runs do not.
   */
  totals: KindTotals;
}

/**
 * Graded Patient Cases, Return Demonstrations, case presentations and quizzes,
 * per student. Every row is read: the ids go a chunk at a time and each read
 * pages past PostgREST's 1,000-row cap, so a large section isn't cut short.
 */
export async function studentWork(
  supabase: Supabase,
  studentIds: readonly string[],
): Promise<Map<string, StudentWork>> {
  const work = new Map<string, StudentWork>();
  if (studentIds.length === 0) return work;
  const ids = [...studentIds];

  type Scenario = { student_id: string; scenario_id: string; status: string; score: number | null };
  type Case = { student_id: string; status: string; score: number | null };
  type Attempt = { student_id: string; score: number | null };
  const [scenarios, cases, attempts] = await Promise.all([
    readMatching<Scenario>(ids, (part, from, to) =>
      supabase.from('scenario_assignments').select('id, student_id, scenario_id, status, score').in('student_id', part).order('id').range(from, to),
    ),
    // Case presentations need migration 056; a report still renders without them.
    readMatching<Case>(ids, (part, from, to) =>
      supabase.from('case_submissions').select('id, student_id, status, score').in('student_id', part).order('id').range(from, to),
    ).catch((err) => {
      console.error('Report: failed to read case submissions', err);
      return [] as Case[];
    }),
    readMatching<Attempt>(ids, (part, from, to) =>
      supabase
        .from('assessment_attempts')
        .select('id, student_id, score')
        .eq('status', 'submitted')
        .in('student_id', part)
        .order('id')
        .range(from, to),
    ),
  ]);

  const totals = new Map<string, KindTotals>();
  const of = (id: string) => {
    let t = totals.get(id);
    if (!t) totals.set(id, (t = emptyTotals()));
    return t;
  };
  // Patient Cases and Return Demonstrations (072) are counted apart.
  const kinds = await scenarioKinds(supabase, [...new Set(scenarios.map((a) => a.scenario_id))]);
  for (const kind of ['patient_case', 'return_demo'] as const) {
    for (const a of ofKind(scenarios, kinds, kind, (row) => row.scenario_id)) {
      if (a.status === 'completed' && a.score !== null) addScore(of(a.student_id), kind, Number(a.score));
    }
  }
  for (const c of cases) {
    if (c.status === 'graded' && c.score !== null) addScore(of(c.student_id), 'case_presentation', Number(c.score));
  }
  for (const a of attempts) {
    if (a.score !== null) addScore(of(a.student_id), 'quiz', Number(a.score));
  }

  for (const id of ids) work.set(id, { totals: totals.get(id) ?? emptyTotals() });
  return work;
}

/** Filenames: "Renz Carlo M. Ilagan" becomes "renz-carlo-m-ilagan". */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'report'
  );
}
