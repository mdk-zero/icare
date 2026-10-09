import type { getSupabaseAdmin } from './supabase/server';
import {
  evaluate,
  studentChecklist,
  summarize,
  termBounds,
  termStatus,
  type GradedCaseFact,
  type ItemProgress,
  type ProgressFacts,
  type QuizAttemptFact,
  type RequirementCheckRow,
  type RequirementRow,
  type RequirementScoreRow,
  type StudentRequirement,
  type TermWindow,
} from './course-progress';
import { fetchStepRatings, fetchTaskCompletions, fetchTaskSteps, stepGradesByTask } from './scenario-tasks';
import { taskCredit } from './task-ratings';
import { isMissingSkillColumn, skillIdFromTitle } from './taylor-skills';
import { isMissingCaseTables } from './cases';
import { loadActivityAttendance } from './activity-attendance';
import {
  labelRequirements,
  loadCourseSkillIds,
  loadOfferingRosters,
  loadRequirements,
  loadStudentOfferings,
  must,
  type OwnOffering,
  type RosterStudent,
} from './courses';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Reads the graded work a requirements checklist is judged on (migration
 * 065) and hands it to evaluate() in course-progress.ts. Only the kinds of
 * work the checklist actually asks about are read, a roster at a time in
 * chunks, inside the term's window.
 */

/** PostgREST puts `in` lists in the URL, so long ones go a chunk at a time. */
const CHUNK = 200;

async function chunked<T>(ids: string[], read: (part: string[]) => PromiseLike<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await read(ids.slice(i, i + CHUNK))));
  return out;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function loadProgressFacts(
  supabase: Supabase,
  requirements: readonly RequirementRow[],
  term: TermWindow,
  studentIds: string[],
): Promise<ProgressFacts> {
  const has = (test: (r: RequirementRow) => boolean) => requirements.some(test);
  const skillItems = has((r) => r.kind === 'skill');
  const wantsCases = skillItems || has((r) => (r.kind === 'activity' || r.kind === 'count') && r.activity_type === 'scenario');
  const wantsCaseSkills = skillItems || has((r) => r.kind === 'count' && r.activity_type === 'scenario' && r.skills_only);
  const wantsAttempts = skillItems || has((r) => (r.kind === 'activity' || r.kind === 'count') && r.activity_type === 'assessment');
  const wantsQuizSkills = skillItems || has((r) => r.kind === 'count' && r.activity_type === 'assessment' && r.skills_only);
  const wantsPresentations = has((r) => (r.kind === 'activity' || r.kind === 'count') && r.activity_type === 'case_presentation');
  const wantsAttendance = has((r) => r.kind === 'count' && r.activity_type === 'shift');

  if (studentIds.length === 0 || requirements.length === 0) {
    return { cases: [], attempts: [], quizSkills: {}, presentations: [], attended: [], checks: [], scores: [] };
  }
  const { from, to } = termBounds(term);

  const requirementIds = requirements.map((r) => r.id);
  const [cases, attempts, presentations, attended, checks, scores] = await Promise.all([
    wantsCases ? loadCases(supabase, studentIds, from, to, wantsCaseSkills, skillItems) : Promise.resolve([]),
    wantsAttempts ? loadAttempts(supabase, studentIds, from, to, skillItems) : Promise.resolve([]),
    wantsPresentations ? loadPresentations(supabase, studentIds, from, to) : Promise.resolve([]),
    wantsAttendance ? loadAttended(supabase, studentIds, from, to) : Promise.resolve([]),
    loadChecks(supabase, requirementIds, studentIds),
    loadScores(supabase, requirementIds, studentIds),
  ]);
  const quizSkills = wantsQuizSkills ? await loadQuizSkills(supabase, [...new Set(attempts.map((a) => a.assessment_id))]) : {};
  return { cases, attempts, quizSkills, presentations, attended, checks, scores };
}

async function loadCases(
  supabase: Supabase,
  studentIds: string[],
  from: string,
  to: string,
  withSkills: boolean,
  withCredit: boolean,
): Promise<GradedCaseFact[]> {
  const rows = await chunked(studentIds, async (part) =>
    (must(
      await supabase
        .from('scenario_assignments')
        .select('id, student_id, scenario_id, score, completed_at')
        .in('student_id', part)
        .eq('status', 'completed')
        .gte('completed_at', from)
        .lt('completed_at', to),
    ) ?? []) as { id: string; student_id: string; scenario_id: string; score: number | null; completed_at: string }[],
  );
  if (!withSkills || rows.length === 0) {
    return rows.map((r) => ({ student_id: r.student_id, scenario_id: r.scenario_id, score: num(r.score), completed_at: r.completed_at, skills: [] }));
  }

  // The skill each task is (047), or the one its title names on older tasks.
  const scenarioIds = [...new Set(rows.map((r) => r.scenario_id))];
  const readTasks = async (columns: string) =>
    chunked(scenarioIds, async (part) => {
      const res = await supabase.from('scenario_tasks').select(columns).in('scenario_id', part);
      if (res.error) throw res.error;
      return (res.data ?? []) as unknown as { id: string; scenario_id: string; skill_id?: string | null; title: string }[];
    });
  let tasks: { id: string; scenario_id: string; skill_id?: string | null; title: string }[];
  try {
    tasks = await readTasks('id, scenario_id, skill_id, title');
  } catch (err) {
    if (!isMissingSkillColumn(err as { code?: string })) throw err;
    tasks = await readTasks('id, scenario_id, title');
  }
  const skillTasks = tasks
    .map((t) => ({ id: t.id, scenario_id: t.scenario_id, skill_id: t.skill_id ?? skillIdFromTitle(t.title) }))
    .filter((t): t is { id: string; scenario_id: string; skill_id: string } => !!t.skill_id);

  // Credit per skill task per assignment, the way the grade itself is scored.
  const credit = new Map<string, number>();
  if (withCredit && skillTasks.length > 0) {
    const assignmentIds = rows.map((r) => r.id);
    const [completions, steps, ratings] = await Promise.all([
      chunked(assignmentIds, async (part) => {
        const res = await fetchTaskCompletions(supabase, part);
        if (res.error) throw res.error;
        return res.rows;
      }),
      chunked(
        skillTasks.map((t) => t.id),
        async (part) => {
          const res = await fetchTaskSteps(supabase, part);
          if (res.error) throw res.error;
          return res.steps;
        },
      ),
      chunked(assignmentIds, async (part) => {
        const res = await fetchStepRatings(supabase, part);
        if (res.error) throw res.error;
        return res.rows;
      }),
    ]);
    const completion = new Map(completions.map((c) => [`${c.assignment_id}:${c.task_id}`, c]));
    for (const r of rows) {
      const stepsByTask = stepGradesByTask(steps, ratings.filter((x) => x.assignment_id === r.id));
      for (const t of skillTasks) {
        if (t.scenario_id !== r.scenario_id) continue;
        credit.set(`${r.id}:${t.id}`, taskCredit(completion.get(`${r.id}:${t.id}`), stepsByTask.get(t.id)));
      }
    }
  }

  return rows.map((r) => ({
    student_id: r.student_id,
    scenario_id: r.scenario_id,
    score: num(r.score),
    completed_at: r.completed_at,
    skills: skillTasks
      .filter((t) => t.scenario_id === r.scenario_id)
      .map((t) => ({ skill_id: t.skill_id, credit: withCredit ? (credit.get(`${r.id}:${t.id}`) ?? 0) : 1 })),
  }));
}

async function loadAttempts(
  supabase: Supabase,
  studentIds: string[],
  from: string,
  to: string,
  withSkillScores: boolean,
): Promise<QuizAttemptFact[]> {
  const rows = await chunked(studentIds, async (part) =>
    (must(
      await supabase
        .from('assessment_attempts')
        .select('id, student_id, assessment_id, score, submitted_at')
        .in('student_id', part)
        .eq('status', 'submitted')
        .gte('submitted_at', from)
        .lt('submitted_at', to),
    ) ?? []) as { id: string; student_id: string; assessment_id: string; score: number | null; submitted_at: string }[],
  );

  // A criterion tied to a skill (049) scores the attempt on that skill.
  const skillScores = new Map<string, Record<string, number>>();
  if (withSkillScores && rows.length > 0) {
    const assessmentIds = [...new Set(rows.map((r) => r.assessment_id))];
    const criteria = await chunked(assessmentIds, async (part) => {
      const res = await supabase.from('assessment_criteria').select('id, skill_id').in('assessment_id', part).not('skill_id', 'is', null);
      if (res.error) {
        if (isMissingSkillColumn(res.error)) return [];
        throw res.error;
      }
      return (res.data ?? []) as { id: string; skill_id: string }[];
    });
    if (criteria.length > 0) {
      const skillOf = new Map(criteria.map((c) => [c.id, c.skill_id]));
      const scores = await chunked(
        rows.map((r) => r.id),
        async (part) =>
          (must(
            await supabase
              .from('attempt_criteria_scores')
              .select('attempt_id, criteria_id, score')
              .in('attempt_id', part)
              .in('criteria_id', [...skillOf.keys()]),
          ) ?? []) as { attempt_id: string; criteria_id: string; score: number }[],
      );
      for (const s of scores) {
        const skill = skillOf.get(s.criteria_id);
        if (!skill) continue;
        const entry = skillScores.get(s.attempt_id) ?? {};
        entry[skill] = Number(s.score);
        skillScores.set(s.attempt_id, entry);
      }
    }
  }

  return rows.map((r) => ({
    student_id: r.student_id,
    assessment_id: r.assessment_id,
    score: num(r.score),
    submitted_at: r.submitted_at,
    skill_scores: skillScores.get(r.id) ?? {},
  }));
}

/** Each Quiz's skills, from its criteria and its questions (049). */
async function loadQuizSkills(supabase: Supabase, assessmentIds: string[]): Promise<Record<string, string[]>> {
  if (assessmentIds.length === 0) return {};
  const read = (table: 'assessment_criteria' | 'questions') =>
    chunked(assessmentIds, async (part) => {
      const res = await supabase.from(table).select('assessment_id, skill_id').in('assessment_id', part).not('skill_id', 'is', null);
      if (res.error) {
        if (isMissingSkillColumn(res.error)) return [];
        throw res.error;
      }
      return (res.data ?? []) as { assessment_id: string; skill_id: string }[];
    });
  const [criteria, questions] = await Promise.all([read('assessment_criteria'), read('questions')]);
  const out: Record<string, string[]> = {};
  for (const row of [...criteria, ...questions]) {
    const list = (out[row.assessment_id] ??= []);
    if (!list.includes(row.skill_id)) list.push(row.skill_id);
  }
  return out;
}

async function loadPresentations(supabase: Supabase, studentIds: string[], from: string, to: string) {
  return chunked(studentIds, async (part) => {
    const res = await supabase
      .from('case_submissions')
      .select('student_id, presentation_id, score, graded_at')
      .in('student_id', part)
      .eq('status', 'graded')
      .gte('graded_at', from)
      .lt('graded_at', to);
    if (res.error) {
      // Before 056 there are no case presentations to count.
      if (isMissingCaseTables(res.error)) return [];
      throw res.error;
    }
    return ((res.data ?? []) as { student_id: string; presentation_id: string; score: number | null; graded_at: string }[]).map((p) => ({
      ...p,
      score: num(p.score),
    }));
  });
}

/** Activities due inside the term that the students did on time or late (lib/attendance.ts). */
async function loadAttended(supabase: Supabase, studentIds: string[], from: string, to: string) {
  const { rows } = await loadActivityAttendance(supabase, studentIds, { from, to });
  return rows
    .filter((r) => r.status === 'present' || r.status === 'late')
    .map((r) => ({ student_id: r.student_id, deadline: r.deadline as string }));
}

async function loadChecks(supabase: Supabase, requirementIds: string[], studentIds: string[]): Promise<RequirementCheckRow[]> {
  if (requirementIds.length === 0) return [];
  return chunked(studentIds, async (part) =>
    (must(
      await supabase
        .from('course_requirement_checks')
        .select('requirement_id, student_id, checked_by, checked_at, note')
        .in('requirement_id', requirementIds)
        .in('student_id', part),
    ) ?? []) as RequirementCheckRow[],
  );
}

/** One item as it now stands for one student: graded work, entered scores and ticks. */
export async function loadItemProgress(
  supabase: Supabase,
  offering: OwnOffering,
  requirement: RequirementRow,
  studentId: string,
): Promise<ItemProgress> {
  const [facts, skills] = await Promise.all([
    loadProgressFacts(supabase, [requirement], offering.term, [studentId]),
    loadCourseSkillIds(supabase, [offering.course.id]),
  ]);
  return evaluate([requirement], skills.get(offering.course.id) ?? [], offering.term, [studentId], facts)[studentId][requirement.id];
}

export const SCORES_NEED_MIGRATION = 'Entering scores needs database migration 066 (course requirement scores) applied first.';

/** Before 066 the scores table doesn't exist, and there are no entered scores to read. */
export function isMissingScoresTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function loadScores(supabase: Supabase, requirementIds: string[], studentIds: string[]): Promise<RequirementScoreRow[]> {
  if (requirementIds.length === 0) return [];
  return chunked(studentIds, async (part) => {
    const res = await supabase
      .from('course_requirement_scores')
      .select('id, requirement_id, student_id, score, note, entered_by, entered_at')
      .in('requirement_id', requirementIds)
      .in('student_id', part);
    if (res.error) {
      if (isMissingScoresTable(res.error)) return [];
      throw res.error;
    }
    return ((res.data ?? []) as RequirementScoreRow[]).map((r) => ({ ...r, score: Number(r.score) }));
  });
}

// ---------------------------------------------------------------------------
// Whole-offering progress
// ---------------------------------------------------------------------------

export interface OfferingProgress {
  requirements: Awaited<ReturnType<typeof labelRequirements>>;
  students: (RosterStudent & { done: number; total: number })[];
  progress: Record<string, Record<string, ItemProgress>>;
  /** Students who met each item. */
  totals: Record<string, number>;
  sectionsWithoutGroup: string[];
}

/** One offering's checklist, judged for every student on its roster, or just `onlyStudentId`. */
export async function loadOfferingProgress(
  supabase: Supabase,
  offering: OwnOffering,
  onlyStudentId?: string,
): Promise<OfferingProgress> {
  const [requirements, skills, rosters] = await Promise.all([
    loadRequirements(supabase, [offering.id]),
    loadCourseSkillIds(supabase, [offering.course.id]),
    loadOfferingRosters(supabase, [{ id: offering.id, faculty_id: offering.faculty_id, section_ids: offering.section_ids }]),
  ]);
  const roster = rosters.get(offering.id) ?? { students: [], sectionsWithoutGroup: [] };
  const students = onlyStudentId ? roster.students.filter((s) => s.id === onlyStudentId) : roster.students;
  const ids = students.map((s) => s.id);
  const facts = await loadProgressFacts(supabase, requirements, offering.term, ids);
  const progress = evaluate(requirements, skills.get(offering.course.id) ?? [], offering.term, ids, facts);
  const totals = Object.fromEntries(
    requirements.map((r) => [r.id, ids.filter((id) => progress[id]?.[r.id]?.done).length]),
  );
  return {
    requirements: await labelRequirements(supabase, requirements),
    students: students.map((s) => ({ ...s, ...summarize(progress[s.id], requirements) })),
    progress,
    totals,
    sectionsWithoutGroup: roster.sectionsWithoutGroup,
  };
}

// ---------------------------------------------------------------------------
// The student's own checklists
// ---------------------------------------------------------------------------

export interface StudentCourse {
  id: string;
  course: { code: string; title: string };
  term: { name: string; starts_on: string; ends_on: string };
  instructor: string;
  requirements: StudentRequirement[];
}

/** The student's checklist in each course of a running term, judged from their own work only. */
export async function loadStudentCourses(supabase: Supabase, studentId: string): Promise<StudentCourse[]> {
  const offerings = (await loadStudentOfferings(supabase, studentId)).filter((o) => termStatus(o.term) === 'current');
  if (offerings.length === 0) return [];
  const [requirements, skills] = await Promise.all([
    loadRequirements(supabase, offerings.map((o) => o.id)),
    loadCourseSkillIds(supabase, [...new Set(offerings.map((o) => o.course.id))]),
  ]);
  const labelled = await labelRequirements(supabase, requirements);
  const courses = await Promise.all(
    offerings.map(async (o): Promise<StudentCourse> => {
      const own = labelled.filter((r) => r.offering_id === o.id);
      const facts = await loadProgressFacts(supabase, own, o.term, [studentId]);
      const row = evaluate(own, skills.get(o.course.id) ?? [], o.term, [studentId], facts)[studentId];
      return {
        id: o.id,
        course: { code: o.course.code, title: o.course.title },
        term: { name: o.term.name, starts_on: o.term.starts_on, ends_on: o.term.ends_on },
        instructor: o.instructor,
        requirements: studentChecklist(own, row),
      };
    }),
  );
  return courses.sort((a, b) => a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
}
