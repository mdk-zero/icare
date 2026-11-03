import type { SupabaseClient } from '@supabase/supabase-js';
import type { SummaryArgs } from './analytics';
import type { CourseScope } from './analytics-course';
import { criterionSkill } from './assessment-selection';
import { DEFAULT_BKT, answersInOrder, loadBktParameters, traceMastery, type SkillMastery } from './bkt';
import { fetchAll } from './fetch-all';
import { chunks } from './graded-work';
import { scoredStatuses } from './quiz-practice';
import { isMissingSkillColumn, listSkills } from './taylor-skills';

/**
 * Bayesian Knowledge Tracing as the portal shows it: what each student's quiz
 * answers say about each Taylor's skill, through the same update rules and
 * fitted parameters as the adaptive review (bkt.ts, assessment-selection.ts).
 * Worked out on request rather than stored, so an estimate is current as soon
 * as a quiz is handed in. Only answers on a question whose criterion names a
 * skill count, as in the ML service's fit (ml/app/bkt.py).
 */

interface AttemptRow {
  id: string;
  student_id: string;
  submitted_at: string | null;
}

interface AnswerRow {
  attempt_id: string;
  question_id: string;
  is_correct: boolean | null;
}

interface ServedRow {
  attempt_id: string;
  question_id: string;
  position: number;
}

/** Rows matching many ids: split to keep the URL short, paged past the row cap. */
async function readMatching<T>(
  ids: readonly string[],
  page: (part: string[], from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const parts = await Promise.all(chunks(ids).map((part) => fetchAll<T>((from, to) => page(part, from, to))));
  return parts.flat();
}

/** Question id -> the skill its criterion names, for the questions that have one. */
async function loadQuestionSkills(supabase: SupabaseClient, questionIds: readonly string[]): Promise<Map<string, string>> {
  const questions = await readMatching<{ id: string; criteria_id: string | null }>(questionIds, (part, from, to) =>
    supabase.from('questions').select('id, criteria_id').in('id', part).order('id').range(from, to),
  );
  const criteriaIds = [...new Set(questions.map((q) => q.criteria_id).filter((id): id is string => !!id))];
  const readCriteria = (columns: string) =>
    readMatching<{ id: string; name: string; skill_id?: string | null }>(criteriaIds, (part, from, to) =>
      supabase.from('assessment_criteria').select(columns).in('id', part).order('id').range(from, to),
    );
  // Before 049 there is no skill_id; the skill then comes from the name.
  const criteria = await readCriteria('id, name, skill_id').catch((err) => {
    if (isMissingSkillColumn(err)) return readCriteria('id, name');
    throw err;
  });

  const skillOfCriterion = new Map(criteria.map((c) => [c.id, criterionSkill(c)]));
  const skills = new Map<string, string>();
  for (const q of questions) {
    const skill = q.criteria_id ? skillOfCriterion.get(q.criteria_id) : null;
    if (skill) skills.set(q.id, skill);
  }
  return skills;
}

/** Each student's estimate per skill they have answered on, weakest first. */
export async function loadSkillMastery(
  supabase: SupabaseClient,
  studentIds: readonly string[],
): Promise<Map<string, SkillMastery[]>> {
  const out = new Map<string, SkillMastery[]>();
  if (studentIds.length === 0) return out;

  const statuses = await scoredStatuses(supabase);
  const attempts = await readMatching<AttemptRow>(studentIds, (part, from, to) =>
    supabase
      .from('assessment_attempts')
      .select('id, student_id, submitted_at')
      .in('student_id', part)
      .in('status', statuses)
      .order('id')
      .range(from, to),
  );
  if (attempts.length === 0) return out;

  const attemptIds = attempts.map((a) => a.id);
  const [answers, served] = await Promise.all([
    readMatching<AnswerRow>(attemptIds, (part, from, to) =>
      supabase
        .from('attempt_answers')
        .select('attempt_id, question_id, is_correct')
        .in('attempt_id', part)
        .order('id')
        .range(from, to),
    ),
    readMatching<ServedRow>(attemptIds, (part, from, to) =>
      supabase
        .from('attempt_questions')
        .select('attempt_id, question_id, position')
        .in('attempt_id', part)
        .order('attempt_id')
        .order('position')
        .range(from, to),
    ),
  ]);
  if (answers.length === 0) return out;

  const skillOfQuestion = await loadQuestionSkills(supabase, [...new Set(answers.map((a) => a.question_id))]);
  const studentOfAttempt = new Map(attempts.map((a) => [a.id, a.student_id]));

  // student -> skill -> answers, oldest first
  const sequences = new Map<string, Map<string, boolean[]>>();
  for (const answer of answersInOrder(answers, attempts, served)) {
    const skill = skillOfQuestion.get(answer.question_id);
    const student = studentOfAttempt.get(answer.attempt_id);
    if (!skill || !student) continue;
    const perSkill = sequences.get(student) ?? new Map<string, boolean[]>();
    perSkill.set(skill, [...(perSkill.get(skill) ?? []), Boolean(answer.is_correct)]);
    sequences.set(student, perSkill);
  }

  const skillIds = [...new Set([...sequences.values()].flatMap((perSkill) => [...perSkill.keys()]))];
  const [fits, catalog] = await Promise.all([loadBktParameters(supabase, skillIds), listSkills(supabase)]);
  const titles = new Map(catalog.map((s) => [s.id, s.title]));

  for (const [student, perSkill] of sequences) {
    out.set(
      student,
      [...perSkill]
        .map(([skill, sequence]): SkillMastery => {
          const fit = fits.get(skill);
          return {
            skill_id: skill,
            title: titles.get(skill) ?? `Skill ${skill}`,
            mastery: traceMastery(fit ?? DEFAULT_BKT, sequence),
            answers: sequence.length,
            correct: sequence.filter(Boolean).length,
            source: fit?.source ?? 'default',
          };
        })
        .sort((a, b) => a.mastery - b.mastery || a.skill_id.localeCompare(b.skill_id)),
    );
  }
  return out;
}

/**
 * The students an analytics filter covers: the course's roster, or the same
 * students dw_analytics_summary counts for these args (in the sections, among
 * those allowed), so the figures agree with the tiles on the page.
 */
export async function analyticsStudentIds(
  supabase: SupabaseClient,
  args: SummaryArgs,
  course: CourseScope | null,
): Promise<string[]> {
  if (course) return course.students.map((s) => s.id);

  const sections = args.p_section_ids;
  const allowed = args.p_student_ids ?? null;
  if (!sections && allowed) return allowed;

  const rows = sections
    ? await readMatching<{ id: string }>(sections, (part, from, to) =>
        supabase.from('users').select('id').eq('role', 'student').in('section_id', part).order('id').range(from, to),
      )
    : await fetchAll<{ id: string }>((from, to) =>
        supabase.from('users').select('id').eq('role', 'student').order('id').range(from, to),
      );
  const ids = rows.map((r) => r.id);
  if (!allowed) return ids;
  const permitted = new Set(allowed);
  return ids.filter((id) => permitted.has(id));
}
