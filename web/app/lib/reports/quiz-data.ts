import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { quizGrade } from '../quiz-attempts';
import { loadGroupings } from './groupings';
import type { QuizCriterion, QuizQuestion, QuizTry } from './quiz-model';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export interface QuizPerformer {
  studentId: string;
  name: string;
  teamId: string | null;
  groupLabel: string;
  tries: number;
  /** The average of the graded tries; null until one is scored. */
  grade: number | null;
}

export interface QuizRoster {
  title: string;
  performers: QuizPerformer[];
}

/**
 * Who a quiz reaches: the students it was given to and any who sat it anyway
 * (target_sections only makes it visible), within the viewer's scope.
 */
export async function loadQuizRoster(
  supabase: Supabase,
  assessmentId: string,
  scope: readonly string[] | null,
): Promise<QuizRoster | null> {
  const { data: quiz } = await supabase.from('assessments').select('id, title').eq('id', assessmentId).maybeSingle();
  if (!quiz) return null;

  const [{ data: assigned }, { data: attempts }] = await Promise.all([
    supabase
      .from('assessment_assignments')
      .select('student_id, users!assessment_assignments_student_id_fkey(name, section_id)')
      .eq('assessment_id', assessmentId),
    supabase
      .from('assessment_attempts')
      .select('student_id, status, score, users(name, section_id)')
      .eq('assessment_id', assessmentId),
  ]);

  type Person = { name: string | null; section_id: string | null } | null;
  const people = new Map<string, { name: string; section_id: string | null; scores: number[] }>();
  const person = (id: string, user: Person) => {
    const e = people.get(id) ?? { name: user?.name ?? 'Unknown student', section_id: user?.section_id ?? null, scores: [] };
    people.set(id, e);
    return e;
  };
  for (const a of assigned ?? []) person(a.student_id as string, (a as unknown as { users: Person }).users);
  for (const a of attempts ?? []) {
    const e = person(a.student_id as string, (a as unknown as { users: Person }).users);
    if (a.status === 'submitted' && a.score !== null) e.scores.push(Number(a.score));
  }

  const inScope = [...people.entries()].filter(([id]) => !scope || scope.includes(id));
  const groupings = await loadGroupings(
    supabase,
    inScope.map(([id, p]) => ({ id, section_id: p.section_id })),
  );
  const performers = inScope
    .map(([id, p]): QuizPerformer => {
      const g = groupings.get(id);
      const grade = quizGrade(p.scores);
      return {
        studentId: id,
        name: p.name,
        teamId: g?.teamId ?? null,
        groupLabel: g?.groupLabel ?? 'No group',
        tries: p.scores.length,
        grade: grade === null ? null : Math.round(grade),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { title: quiz.title as string, performers };
}

/** The quiz's questions in order. */
export async function loadQuizQuestions(supabase: Supabase, assessmentId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('id, content, options, correct_index, criteria_id, position')
    .eq('assessment_id', assessmentId)
    .order('position');
  if (error) throw new Error(`Unable to read the questions: ${error.message}`);
  return ((data ?? []) as { id: string; content: string; options: unknown; correct_index: number; criteria_id?: string | null }[]).map((q) => ({
    id: q.id,
    text: q.content,
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctIndex: q.correct_index,
    criteriaId: q.criteria_id ?? null,
  }));
}

/** The quiz's scoring criteria in order; none before migration 016. */
export async function loadQuizCriteria(supabase: Supabase, assessmentId: string): Promise<QuizCriterion[]> {
  const { data, error } = await supabase
    .from('assessment_criteria')
    .select('id, name, weight, sort_order')
    .eq('assessment_id', assessmentId)
    .order('sort_order');
  if (error) return [];
  return ((data ?? []) as { id: string; name: string; weight: number | string }[]).map((c) => ({
    id: c.id,
    name: c.name,
    weight: Number(c.weight),
  }));
}

/** Each given student's graded tries, oldest first, with what they answered. */
export async function loadQuizTries(
  supabase: Supabase,
  assessmentId: string,
  studentIds: readonly string[],
): Promise<Map<string, QuizTry[]>> {
  const out = new Map<string, QuizTry[]>();
  if (studentIds.length === 0) return out;

  const { data: attempts, error } = await supabase
    .from('assessment_attempts')
    .select('id, student_id, score, submitted_at')
    .eq('assessment_id', assessmentId)
    .eq('status', 'submitted')
    .in('student_id', [...studentIds])
    .order('submitted_at');
  if (error) throw new Error(`Unable to read the tries: ${error.message}`);
  const rows = ((attempts ?? []) as { id: string; student_id: string; score: number | null; submitted_at: string | null }[]).filter(
    (a) => a.score !== null,
  );
  if (rows.length === 0) return out;
  const ids = rows.map((a) => a.id);

  const [answers, served] = await Promise.all([
    supabase.from('attempt_answers').select('attempt_id, question_id, selected_index, is_correct').in('attempt_id', ids),
    // Before 026 there is no record of what was served; the answers stand in.
    supabase.from('attempt_questions').select('attempt_id, question_id, criteria_id, position').in('attempt_id', ids).order('position'),
  ]);
  if (answers.error) throw new Error(`Unable to read the answers: ${answers.error.message}`);

  const answerOf = new Map<string, Map<string, { selected: number | null; ok: boolean }>>();
  for (const a of (answers.data ?? []) as { attempt_id: string; question_id: string; selected_index: number | null; is_correct: boolean }[]) {
    const m = answerOf.get(a.attempt_id) ?? new Map();
    m.set(a.question_id, { selected: a.selected_index, ok: a.is_correct });
    answerOf.set(a.attempt_id, m);
  }
  const servedOf = new Map<string, string[]>();
  const criteriaOf = new Map<string, Map<string, string | null>>();
  for (const q of (served.error ? [] : (served.data ?? [])) as { attempt_id: string; question_id: string; criteria_id: string | null }[]) {
    servedOf.set(q.attempt_id, [...(servedOf.get(q.attempt_id) ?? []), q.question_id]);
    const m = criteriaOf.get(q.attempt_id) ?? new Map<string, string | null>();
    m.set(q.question_id, q.criteria_id);
    criteriaOf.set(q.attempt_id, m);
  }

  for (const a of rows) {
    const list = out.get(a.student_id) ?? [];
    list.push({
      number: list.length + 1,
      submittedAt: a.submitted_at,
      score: a.score === null ? null : Number(a.score),
      served: servedOf.get(a.id) ?? [],
      criteria: criteriaOf.get(a.id) ?? new Map(),
      answers: answerOf.get(a.id) ?? new Map(),
    });
    out.set(a.student_id, list);
  }
  return out;
}
