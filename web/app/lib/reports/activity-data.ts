import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { readMatching } from '../fetch-all';
import { quizGrade } from '../quiz-attempts';
import { ofKind, scenarioKinds } from '../scenario-kind';
import type { GridEntry } from './activity-sheet';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** Titles for a set of ids, a chunk at a time. */
async function titlesOf(supabase: Supabase, table: string, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await supabase.from(table).select('id, title').in('id', unique.slice(i, i + 200));
    for (const r of (data ?? []) as { id: string; title: string }[]) out.set(r.id, r.title);
  }
  return out;
}

/**
 * Everything each student was given, with their grade on it: patient cases,
 * return demonstrations, quizzes and case presentations. Only what is
 * assigned to a student appears for them. Rows are read in full, past the
 * 1,000-row cap.
 */
export async function loadActivityGrid(
  supabase: Supabase,
  studentIds: readonly string[],
): Promise<Map<string, GridEntry[]>> {
  const out = new Map<string, GridEntry[]>(studentIds.map((id) => [id, []]));
  if (studentIds.length === 0) return out;
  const ids = [...studentIds];
  const add = (studentId: string, entry: GridEntry) => out.get(studentId)?.push(entry);

  type Scenario = { student_id: string; scenario_id: string; status: string; score: number | null };
  type Given = { student_id: string; assessment_id: string };
  type Attempt = { student_id: string; assessment_id: string; score: number | null };
  type Case = { student_id: string; presentation_id: string; status: string; score: number | null };
  const [scenarios, given, attempts, cases] = await Promise.all([
    readMatching<Scenario>(ids, (part, from, to) =>
      supabase.from('scenario_assignments').select('id, student_id, scenario_id, status, score').in('student_id', part).order('id').range(from, to),
    ),
    readMatching<Given>(ids, (part, from, to) =>
      supabase.from('assessment_assignments').select('id, student_id, assessment_id').in('student_id', part).order('id').range(from, to),
    ),
    readMatching<Attempt>(ids, (part, from, to) =>
      supabase.from('assessment_attempts').select('id, student_id, assessment_id, score').eq('status', 'submitted').in('student_id', part).order('id').range(from, to),
    ),
    // Case presentations need migration 056; the grid still renders without them.
    readMatching<Case>(ids, (part, from, to) =>
      supabase.from('case_submissions').select('id, student_id, presentation_id, status, score').in('student_id', part).order('id').range(from, to),
    ).catch(() => [] as Case[]),
  ]);

  const kinds = await scenarioKinds(supabase, scenarios.map((a) => a.scenario_id));
  const scenarioTitles = await titlesOf(supabase, 'scenarios', scenarios.map((a) => a.scenario_id));
  for (const kind of ['patient_case', 'return_demo'] as const) {
    for (const a of ofKind(scenarios, kinds, kind, (row) => row.scenario_id)) {
      add(a.student_id, {
        key: `${kind}:${a.scenario_id}`,
        kind,
        title: scenarioTitles.get(a.scenario_id) ?? 'Untitled',
        score: a.status === 'completed' && a.score !== null ? Number(a.score) : null,
      });
    }
  }

  // A quiz counts for a student given it or who sat it anyway; its grade averages the graded tries.
  const quizIds = [...new Set([...given.map((g) => g.assessment_id), ...attempts.map((a) => a.assessment_id)])];
  const quizTitles = await titlesOf(supabase, 'assessments', quizIds);
  const quizOf = new Map<string, Set<string>>();
  for (const g of given) quizOf.set(g.student_id, (quizOf.get(g.student_id) ?? new Set()).add(g.assessment_id));
  const scoresOf = new Map<string, number[]>();
  for (const a of attempts) {
    quizOf.set(a.student_id, (quizOf.get(a.student_id) ?? new Set()).add(a.assessment_id));
    if (a.score !== null) scoresOf.set(`${a.student_id}:${a.assessment_id}`, [...(scoresOf.get(`${a.student_id}:${a.assessment_id}`) ?? []), Number(a.score)]);
  }
  for (const [studentId, quizzes] of quizOf) {
    for (const quizId of quizzes) {
      const grade = quizGrade(scoresOf.get(`${studentId}:${quizId}`) ?? []);
      add(studentId, { key: `quiz:${quizId}`, kind: 'quiz', title: quizTitles.get(quizId) ?? 'Untitled', score: grade === null ? null : Math.round(grade) });
    }
  }

  const presentationTitles = await titlesOf(supabase, 'case_presentations', cases.map((c) => c.presentation_id));
  for (const c of cases) {
    add(c.student_id, {
      key: `case:${c.presentation_id}`,
      kind: 'case',
      title: presentationTitles.get(c.presentation_id) ?? 'Case presentation',
      score: c.status === 'graded' && c.score !== null ? Number(c.score) : null,
    });
  }
  return out;
}
