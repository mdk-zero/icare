import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listSkills, skillIdFromTitle, isMissingSkillColumn } from './taylor-skills';
import { fetchStepRatings, fetchTaskCompletions, fetchTaskSteps } from './scenario-tasks';
import { scenarioKinds, kindOf, type ScenarioKind } from './scenario-kind';
import { MASTERY_THRESHOLD, type SkillMastery } from './bkt';
import { loadSkillMastery } from './skill-mastery';

/**
 * The Taylor's skills a student needs to improve on, for the "Needs
 * improvement" section of the mobile Library (with that skill's Library
 * materials) and the AI study tips grounded in it.
 *
 * Bayesian Knowledge Tracing decides: the student's mastery of each skill, from
 * their quiz answers and finished Patient Case and Return Demonstration
 * ratings (skill-mastery.ts, the estimate Progress shows and the ML service
 * fits on). A skill below MASTERY_THRESHOLD is listed, the least mastered
 * first. Case Presentations have no checklist and are not skills laboratory
 * work, so they never count.
 *
 * The results shown under each skill come from every graded activity on it: a
 * quiz through its criteria (`assessment_criteria.skill_id`), a Patient Case
 * or Return Demonstration through its checklist tasks
 * (`scenario_tasks.skill_id`).
 */

/** The quiz passing mark: a skill scored under it needs improvement. */
export const QUIZ_NEEDS_IMPROVEMENT_BELOW = 75;

export type EvidenceKind = 'quiz' | ScenarioKind;

export interface SkillEvidence {
  kind: EvidenceKind;
  /** The quiz's or the scenario's title. */
  title: string;
  /** When the result was given (ISO). */
  at: string;
  weak: boolean;
  /** Quiz only: the percent on this skill's questions. */
  score: number | null;
  correct: number | null;
  total: number | null;
  /** Checklist only: the steps (or whole tasks) rated Needs Practice. */
  needs_practice: string[];
}

export interface FocusSkill {
  skill_id: string;
  title: string;
  chapter: number;
  area: string;
  /** The results that flag it, newest first: every weak one since its last good one. */
  evidence: SkillEvidence[];
  /** Published quizzes with a criterion on this skill; the app shows the ones the student can open. */
  quiz_ids: string[];
  /** BKT's P(the student knows the skill), 0-1. */
  mastery: number;
}

// ---------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------

/**
 * Which skills need improvement: those BKT puts under MASTERY_THRESHOLD, the
 * least mastered first, each with its results newest first.
 */
export function rankByMastery(
  mastery: readonly Pick<SkillMastery, 'skill_id' | 'mastery'>[],
  evidenceBySkill: ReadonlyMap<string, readonly SkillEvidence[]>,
): { skillId: string; mastery: number; evidence: SkillEvidence[] }[] {
  return mastery
    .filter((m) => m.mastery < MASTERY_THRESHOLD)
    .map((m) => ({
      skillId: m.skill_id,
      mastery: m.mastery,
      evidence: [...(evidenceBySkill.get(m.skill_id) ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
    }))
    .sort((a, b) => a.mastery - b.mastery || a.skillId.localeCompare(b.skillId, undefined, { numeric: true }));
}

/** A quiz criterion's result on one skill. */
export function quizEvidence(
  title: string,
  at: string,
  correct: number,
  total: number,
): SkillEvidence | null {
  if (total <= 0) return null;
  const score = Math.round((correct / total) * 10000) / 100;
  return {
    kind: 'quiz',
    title,
    at,
    weak: score < QUIZ_NEEDS_IMPROVEMENT_BELOW,
    score,
    correct,
    total,
    needs_practice: [],
  };
}

/**
 * A checklist's result on one skill, from the ratings released on it. N/A is
 * no evidence either way, so a skill rated only N/A gives none.
 */
export function checklistEvidence(
  kind: ScenarioKind,
  title: string,
  at: string,
  rated: readonly { label: string; rating: string }[],
): SkillEvidence | null {
  const counted = rated.filter((r) => r.rating !== 'not_applicable');
  if (counted.length === 0) return null;
  const needsPractice = counted.filter((r) => r.rating === 'needs_practice').map((r) => r.label);
  return {
    kind,
    title,
    at,
    weak: needsPractice.length > 0,
    score: null,
    correct: null,
    total: null,
    needs_practice: [...new Set(needsPractice)],
  };
}

/** Identifies a focus list for caching what is derived from it (the AI tips). */
export function focusFingerprint(
  skills: readonly FocusSkill[],
  overall?: { mastery: number | null; chapters: readonly { chapter: number; mastery: number }[] },
  materialIds: readonly string[] = [],
): string {
  const parts = skills.map((s) =>
    [s.skill_id, ...s.evidence.map((e) => `${e.kind}:${e.at}:${e.score ?? e.needs_practice.join('/')}`)].join('|'),
  );
  if (overall) {
    parts.push([`overall:${overall.mastery ?? '-'}`, ...overall.chapters.map((c) => `${c.chapter}:${c.mastery}`)].join('|'));
  }
  if (materialIds.length) parts.push(`materials:${[...materialIds].sort().join(',')}`);
  return createHash('sha1').update(parts.join('#')).digest('hex');
}

// ---------------------------------------------------------------
// Loading
// ---------------------------------------------------------------

function push(map: Map<string, SkillEvidence[]>, skillId: string, evidence: SkillEvidence | null) {
  if (!evidence) return;
  map.set(skillId, [...(map.get(skillId) ?? []), evidence]);
}

/** Graded quiz results per skill. */
async function quizResults(supabase: SupabaseClient, studentId: string, into: Map<string, SkillEvidence[]>) {
  const { data: attempts, error } = await supabase
    .from('assessment_attempts')
    .select('id, submitted_at, assessments(title)')
    .eq('student_id', studentId)
    .eq('status', 'submitted');
  if (error) throw error;
  if (!attempts?.length) return;

  const attemptById = new Map(attempts.map((a) => [a.id as string, a]));
  const { data: scores, error: scoresError } = await supabase
    .from('attempt_criteria_scores')
    .select('attempt_id, criteria_id, criteria_name, correct, total')
    .in('attempt_id', [...attemptById.keys()]);
  if (scoresError) throw scoresError;
  if (!scores?.length) return;

  // The skill a criterion is on: its skill_id (049), else the one its name cites.
  const criteriaIds = [...new Set(scores.map((s) => s.criteria_id as string))];
  const skillOfCriterion = new Map<string, string>();
  const criteria = await supabase.from('assessment_criteria').select('id, skill_id').in('id', criteriaIds);
  if (criteria.error && !isMissingSkillColumn(criteria.error)) throw criteria.error;
  for (const c of criteria.data ?? []) {
    if (c.skill_id) skillOfCriterion.set(c.id as string, c.skill_id as string);
  }

  // One result per attempt and skill, summed over the criteria on it.
  const perAttemptSkill = new Map<string, { attemptId: string; skillId: string; correct: number; total: number }>();
  for (const s of scores) {
    const skillId = skillOfCriterion.get(s.criteria_id as string) ?? skillIdFromTitle(String(s.criteria_name ?? ''));
    if (!skillId) continue;
    const key = `${s.attempt_id}:${skillId}`;
    const entry = perAttemptSkill.get(key) ?? { attemptId: s.attempt_id as string, skillId, correct: 0, total: 0 };
    entry.correct += Number(s.correct ?? 0);
    entry.total += Number(s.total ?? 0);
    perAttemptSkill.set(key, entry);
  }
  for (const { attemptId, skillId, correct, total } of perAttemptSkill.values()) {
    const attempt = attemptById.get(attemptId);
    const title = (attempt?.assessments as unknown as { title?: string } | null)?.title ?? 'Quiz';
    push(into, skillId, quizEvidence(title, (attempt?.submitted_at as string) ?? '', correct, total));
  }
}

/** Released checklist ratings per skill, from Patient Cases and Return Demonstrations. */
async function checklistResults(supabase: SupabaseClient, studentId: string, into: Map<string, SkillEvidence[]>) {
  const { data: assignments, error } = await supabase
    .from('scenario_assignments')
    .select('id, scenario_id, status, assigned_at, completed_at')
    .eq('student_id', studentId);
  if (error) throw error;
  if (!assignments?.length) return;

  const scenarioIds = [...new Set(assignments.map((a) => a.scenario_id as string))];
  const assignmentIds = assignments.map((a) => a.id as string);

  let tasksRes = await supabase
    .from('scenario_tasks')
    .select('id, scenario_id, title, skill_id')
    .in('scenario_id', scenarioIds);
  if (tasksRes.error && isMissingSkillColumn(tasksRes.error)) {
    tasksRes = (await supabase
      .from('scenario_tasks')
      .select('id, scenario_id, title')
      .in('scenario_id', scenarioIds)) as typeof tasksRes;
  }
  if (tasksRes.error) throw tasksRes.error;
  const tasks = (tasksRes.data ?? []) as { id: string; scenario_id: string; title: string; skill_id?: string | null }[];
  if (tasks.length === 0) return;

  const [scenariosRes, kinds, completions, steps, stepRatings] = await Promise.all([
    supabase.from('scenarios').select('id, title').in('id', scenarioIds),
    scenarioKinds(supabase, scenarioIds),
    fetchTaskCompletions(supabase, assignmentIds),
    fetchTaskSteps(supabase, tasks.map((t) => t.id)),
    fetchStepRatings(supabase, assignmentIds),
  ]);
  if (scenariosRes.error) throw scenariosRes.error;
  if (completions.error) throw completions.error;
  if (steps.error) throw steps.error;
  if (stepRatings.error) throw stepRatings.error;

  const titleOf = new Map((scenariosRes.data ?? []).map((s) => [s.id as string, s.title as string]));
  const tasksByScenario = new Map<string, typeof tasks>();
  for (const t of tasks) tasksByScenario.set(t.scenario_id, [...(tasksByScenario.get(t.scenario_id) ?? []), t]);
  const stepsByTask = new Map<string, typeof steps.steps>();
  for (const s of steps.steps) stepsByTask.set(s.task_id, [...(stepsByTask.get(s.task_id) ?? []), s]);
  const completionOf = new Map(completions.rows.map((c) => [`${c.assignment_id}:${c.task_id}`, c]));
  const stepRatingOf = new Map(stepRatings.rows.map((r) => [`${r.assignment_id}:${r.step_id}`, r.rating]));

  for (const a of assignments) {
    const completedCase = a.status === 'completed';
    const bySkill = new Map<string, { label: string; rating: string }[]>();
    let lastGraded: string | null = null;
    for (const task of tasksByScenario.get(a.scenario_id as string) ?? []) {
      const skillId = task.skill_id ?? skillIdFromTitle(task.title);
      if (!skillId) continue;
      const completion = completionOf.get(`${a.id}:${task.id}`);
      // The student sees a task's ratings once it is graded, or once the case
      // is finalized — the rule the tasks route follows.
      if (!completedCase && !completion?.rating) continue;
      const rated: { label: string; rating: string }[] = [];
      for (const step of stepsByTask.get(task.id) ?? []) {
        const rating = stepRatingOf.get(`${a.id}:${step.id}`);
        if (rating) rated.push({ label: step.title, rating });
      }
      // A task graded as a whole stands for itself; one graded by its steps
      // is described by them.
      if (rated.length === 0 && completion?.rating) rated.push({ label: task.title, rating: completion.rating });
      if (rated.length === 0) continue;
      bySkill.set(skillId, [...(bySkill.get(skillId) ?? []), ...rated]);
      if (completion?.completed_at && (!lastGraded || completion.completed_at > lastGraded)) {
        lastGraded = completion.completed_at;
      }
    }
    const at = (a.completed_at as string | null) ?? lastGraded ?? (a.assigned_at as string);
    const kind = kindOf(kinds, a.scenario_id as string);
    const title = titleOf.get(a.scenario_id as string) ?? (kind === 'return_demo' ? 'Return Demonstration' : 'Patient Case');
    for (const [skillId, rated] of bySkill) push(into, skillId, checklistEvidence(kind, title, at, rated));
  }
}

/** The student's skills that need improvement, least mastered first. */
export async function loadSkillFocus(
  supabase: SupabaseClient,
  studentId: string,
  /** The student's BKT estimates when the caller already has them (loadSkillMastery). */
  known?: readonly SkillMastery[],
): Promise<FocusSkill[]> {
  const evidence = new Map<string, SkillEvidence[]>();
  const [, , mastery] = await Promise.all([
    quizResults(supabase, studentId, evidence),
    checklistResults(supabase, studentId, evidence),
    known ? Promise.resolve(known) : loadSkillMastery(supabase, [studentId]).then((m) => m.get(studentId) ?? []),
  ]);
  const judged = rankByMastery(mastery, evidence);
  if (judged.length === 0) return [];

  const weakIds = judged.map((j) => j.skillId);
  const [skills, criteriaRes] = await Promise.all([
    listSkills(supabase),
    supabase
      .from('assessment_criteria')
      .select('assessment_id, skill_id, assessments!inner(is_published)')
      .in('skill_id', weakIds)
      .eq('assessments.is_published', true),
  ]);
  if (criteriaRes.error && !isMissingSkillColumn(criteriaRes.error)) throw criteriaRes.error;
  const quizzesBySkill = new Map<string, Set<string>>();
  for (const c of criteriaRes.data ?? []) {
    const set = quizzesBySkill.get(c.skill_id as string) ?? new Set<string>();
    set.add(c.assessment_id as string);
    quizzesBySkill.set(c.skill_id as string, set);
  }
  const skillById = new Map(skills.map((s) => [s.id, s]));

  return judged.flatMap(({ skillId, mastery, evidence: results }) => {
    const skill = skillById.get(skillId);
    if (!skill) return [];
    return [
      {
        skill_id: skillId,
        title: skill.title,
        chapter: skill.chapter,
        area: skill.area,
        evidence: results,
        quiz_ids: [...(quizzesBySkill.get(skillId) ?? [])],
        mastery: Math.round(mastery * 1000) / 1000,
      },
    ];
  });
}
