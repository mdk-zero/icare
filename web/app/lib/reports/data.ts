/**
 * The per-student figures several reports share, read the way the app reads
 * them: groups from team_members, scenario grades from graded (completed)
 * assignments, case grades from graded submissions, and quiz scores from
 * submitted attempts.
 */
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { scoreDescriptor } from '../task-ratings';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** The College's passing mark for Skill Assessments (see migration 015). */
export const PASSING_SCORE = 75;

/** Scenario grades below this read "Needs Practice" (task-ratings bands). */
export const NEEDS_PRACTICE_BELOW = 63;

export function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** "82% Satisfactory", or a dash when nothing is graded. */
export function grade(score: number | null): string {
  return score === null ? '—' : `${score}% ${scoreDescriptor(score)}`;
}

/** A stat tile for a grade: the percent as the value, the verbal level in the label. */
export function gradeTile(label: string, score: number | null): { label: string; value: string } {
  return { label: score === null ? label : `${label}: ${scoreDescriptor(score)}`, value: pct(score) };
}

/** "1 admin", "3 admins". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—';
}

export function isLate(submittedAt: string | null, deadline: string | null): boolean {
  return Boolean(submittedAt && deadline && new Date(submittedAt).getTime() > new Date(deadline).getTime());
}

/**
 * How a scenario assignment reads on the review page: handed in but not yet
 * graded is "Awaiting grade", a graded one is "Graded".
 */
export function scenarioStatus(a: { status: string; submitted_at: string | null }): string {
  if (a.status === 'completed') return 'Graded';
  if (a.submitted_at) return 'Awaiting grade';
  if (a.status === 'in_progress') return 'In progress';
  if (a.status === 'overdue') return 'Overdue';
  return 'Not started';
}

export const CASE_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  draft: 'Draft',
  submitted: 'Awaiting grade',
  graded: 'Graded',
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
  scenariosAssigned: number;
  scenariosGraded: number;
  scenarioAverage: number | null;
  casesGraded: number;
  caseAverage: number | null;
  quizAttempts: number;
  quizAverage: number | null;
}

/** Graded scenarios, graded cases and submitted quizzes, per student. */
export async function studentWork(
  supabase: Supabase,
  studentIds: readonly string[],
): Promise<Map<string, StudentWork>> {
  const work = new Map<string, StudentWork>();
  if (studentIds.length === 0) return work;
  const ids = [...studentIds];

  const [scenarios, cases, attempts] = await Promise.all([
    supabase.from('scenario_assignments').select('student_id, status, score').in('student_id', ids),
    supabase.from('case_submissions').select('student_id, status, score').in('student_id', ids),
    supabase.from('assessment_attempts').select('student_id, score').eq('status', 'submitted').in('student_id', ids),
  ]);
  // Case presentations need migration 056; a report still renders without them.
  if (cases.error) console.error('Report: failed to read case submissions', cases.error);

  const lists = new Map<string, { scenario: number[]; assigned: number; kase: number[]; quiz: number[] }>();
  const entry = (id: string) => {
    let e = lists.get(id);
    if (!e) lists.set(id, (e = { scenario: [], assigned: 0, kase: [], quiz: [] }));
    return e;
  };
  for (const a of scenarios.data ?? []) {
    const e = entry(a.student_id as string);
    e.assigned += 1;
    if (a.status === 'completed' && a.score !== null) e.scenario.push(Number(a.score));
  }
  for (const c of cases.data ?? []) {
    if (c.status === 'graded' && c.score !== null) entry(c.student_id as string).kase.push(Number(c.score));
  }
  for (const a of attempts.data ?? []) {
    if (a.score !== null) entry(a.student_id as string).quiz.push(Number(a.score));
  }

  for (const id of ids) {
    const e = lists.get(id);
    work.set(id, {
      scenariosAssigned: e?.assigned ?? 0,
      scenariosGraded: e?.scenario.length ?? 0,
      scenarioAverage: avg(e?.scenario ?? []),
      casesGraded: e?.kase.length ?? 0,
      caseAverage: avg(e?.kase ?? []),
      quizAttempts: e?.quiz.length ?? 0,
      quizAverage: avg(e?.quiz ?? []),
    });
  }
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
