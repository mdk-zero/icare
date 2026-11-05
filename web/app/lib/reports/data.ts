/**
 * The per-student figures several reports share, read the way the app reads
 * them: groups from team_members, scenario grades from graded (completed)
 * assignments, case grades from graded submissions, and quiz grades from
 * submitted attempts, each quiz the average of its graded tries.
 */
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { scoreDescriptor } from '../task-ratings';
import { ofKind, scenarioKinds } from '../scenario-kind';
import { readMatching } from '../fetch-all';
import { quizGrade } from '../quiz-attempts';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** The College's passing mark for Skill Assessments (see migration 015). */
export const PASSING_SCORE = 75;

/** Scenario grades below this read "Needs Practice" (task-ratings bands). */
export const NEEDS_PRACTICE_BELOW = 50;

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
  returnDemosAssigned: number;
  returnDemosGraded: number;
  returnDemoAverage: number | null;
  casesGraded: number;
  caseAverage: number | null;
  /** Quizzes with at least one graded try. */
  quizzesTaken: number;
  /** Across those quizzes, each graded as the average of its graded tries (quizGrade), as the app grades them. */
  quizAverage: number | null;
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
  type Attempt = { student_id: string; assessment_id: string; score: number | null };
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
        .select('id, student_id, assessment_id, score')
        .eq('status', 'submitted')
        .in('student_id', part)
        .order('id')
        .range(from, to),
    ),
  ]);

  const lists = new Map<
    string,
    { scenario: number[]; assigned: number; demo: number[]; demos: number; kase: number[]; quiz: Map<string, number[]> }
  >();
  const entry = (id: string) => {
    let e = lists.get(id);
    if (!e) lists.set(id, (e = { scenario: [], assigned: 0, demo: [], demos: 0, kase: [], quiz: new Map() }));
    return e;
  };
  // Patient Cases and Return Demonstrations (072) are counted apart.
  const kinds = await scenarioKinds(supabase, [...new Set(scenarios.map((a) => a.scenario_id))]);
  for (const a of ofKind(scenarios, kinds, 'patient_case', (row) => row.scenario_id)) {
    const e = entry(a.student_id);
    e.assigned += 1;
    if (a.status === 'completed' && a.score !== null) e.scenario.push(Number(a.score));
  }
  for (const a of ofKind(scenarios, kinds, 'return_demo', (row) => row.scenario_id)) {
    const e = entry(a.student_id);
    e.demos += 1;
    if (a.status === 'completed' && a.score !== null) e.demo.push(Number(a.score));
  }
  for (const c of cases) {
    if (c.status === 'graded' && c.score !== null) entry(c.student_id).kase.push(Number(c.score));
  }
  for (const a of attempts) {
    if (a.score === null) continue;
    const quiz = entry(a.student_id).quiz;
    quiz.set(a.assessment_id, [...(quiz.get(a.assessment_id) ?? []), Number(a.score)]);
  }

  for (const id of ids) {
    const e = lists.get(id);
    const quizGrades = [...(e?.quiz.values() ?? [])].flatMap((tries) => {
      const g = quizGrade(tries);
      return g === null ? [] : [g];
    });
    work.set(id, {
      scenariosAssigned: e?.assigned ?? 0,
      scenariosGraded: e?.scenario.length ?? 0,
      scenarioAverage: avg(e?.scenario ?? []),
      returnDemosAssigned: e?.demos ?? 0,
      returnDemosGraded: e?.demo.length ?? 0,
      returnDemoAverage: avg(e?.demo ?? []),
      casesGraded: e?.kase.length ?? 0,
      caseAverage: avg(e?.kase ?? []),
      quizzesTaken: quizGrades.length,
      quizAverage: avg(quizGrades),
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
