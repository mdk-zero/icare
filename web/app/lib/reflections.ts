import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callAI } from '@/app/lib/ai/generate';
import {
  fetchStepRatings,
  fetchTaskCompletions,
  fetchTaskSteps,
  stepGradesByTask,
} from '@/app/lib/scenario-tasks';
import { ratingForCredit, ratingLabel, taskCredit } from '@/app/lib/task-ratings';
import { isSkillId } from '@/app/lib/taylor-skills';

/**
 * Reflection on graded work. After a scenario is finalized or a skill
 * assessment is scored, the student reads feedback on each Taylor's skill —
 * the level faculty gave it and any remark, plus an AI summary of strengths
 * and what to improve — then writes a reflection and sets goals.
 *
 * The AI summary is generated on request and cached on the reflection row
 * with a signature of the grades it describes (migration 050): the same
 * grades never cost a second call, and changed grades mark it stale.
 */

export type SourceType = 'scenario' | 'assessment';

export const MAX_REFLECTION_LENGTH = 4000;
export const MAX_GOAL_LENGTH = 300;
export const MAX_GOALS = 3;

export const REFLECTIONS_NEED_MIGRATION =
  'Reflections and goals need database migration 050 applied first.';

export function isMissingReflectionTables(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export function isSourceType(value: unknown): value is SourceType {
  return value === 'scenario' || value === 'assessment';
}

/** One graded item: a scenario task or an assessment criterion. */
export interface GradedItem {
  title: string;
  skill_id: string | null;
  /** 0–100. */
  score: number;
  /** "Excellent" / "Satisfactory" / "Needs Practice". */
  level: string;
  remarks: string | null;
}

export interface GradedWork {
  source_type: SourceType;
  source_id: string;
  title: string;
  score: number | null;
  graded_at: string | null;
  items: GradedItem[];
}

export interface Feedback {
  summary: string;
  strengths: { skill_id: string | null; note: string }[];
  improvements: { skill_id: string | null; note: string }[];
  suggested_goals: string[];
  /** 'ai', or 'rules' when the AI was unavailable. */
  source: 'ai' | 'rules';
}

/** "Assessing Body Temperature (Skill 1-1)" / "Skill 1-1 · …" → "1-1". */
function skillFromTitle(title: string): string | null {
  const id = /\bSkills? (\d{1,2}-\d{1,2})\b/.exec(title)?.[1] ?? null;
  return id && isSkillId(id) ? id : null;
}

/**
 * The graded work a reflection is about, if it belongs to the student and has
 * been released to them: a finalized scenario, or a submitted attempt.
 */
export async function loadGradedWork(
  supabase: SupabaseClient,
  studentId: string,
  sourceType: SourceType,
  sourceId: string,
): Promise<GradedWork | null> {
  if (sourceType === 'scenario') {
    const { data: assignment } = await supabase
      .from('scenario_assignments')
      .select('id, student_id, scenario_id, status, score, completed_at, scenarios(title)')
      .eq('id', sourceId)
      .maybeSingle();
    if (!assignment || assignment.student_id !== studentId || assignment.status !== 'completed') return null;

    const { data: tasks } = await supabase
      .from('scenario_tasks')
      .select('id, title, points, sort_order')
      .eq('scenario_id', assignment.scenario_id)
      .order('sort_order');
    const taskIds = (tasks ?? []).map((t) => t.id as string);
    const [completions, steps, stepRatings] = await Promise.all([
      fetchTaskCompletions(supabase, [sourceId]),
      fetchTaskSteps(supabase, taskIds),
      fetchStepRatings(supabase, [sourceId]),
    ]);
    const byTask = new Map(completions.rows.map((c) => [c.task_id, c]));
    const stepsByTask = stepGradesByTask(steps.steps, stepRatings.rows);

    const items = (tasks ?? []).map((t) => {
      const completion = byTask.get(t.id as string);
      const credit = taskCredit(completion, stepsByTask.get(t.id as string));
      return {
        title: t.title as string,
        skill_id: skillFromTitle(t.title as string),
        score: Math.round(credit * 100),
        level: credit > 0 ? ratingLabel(ratingForCredit(credit)) : 'Not performed',
        remarks: completion?.remarks ?? null,
      };
    });
    return {
      source_type: 'scenario',
      source_id: sourceId,
      title: (assignment.scenarios as unknown as { title: string } | null)?.title ?? 'Scenario',
      score: assignment.score as number | null,
      graded_at: assignment.completed_at as string | null,
      items,
    };
  }

  const { data: attempt } = await supabase
    .from('assessment_attempts')
    .select('id, student_id, status, score, submitted_at, assessments(title)')
    .eq('id', sourceId)
    .maybeSingle();
  if (!attempt || attempt.student_id !== studentId || attempt.status !== 'submitted') return null;

  const { data: criteria } = await supabase
    .from('attempt_criteria_scores')
    .select('criteria_name, correct, total, score')
    .eq('attempt_id', sourceId);
  const items = (criteria ?? []).map((c) => {
    const score = c.total ? Math.round(((c.correct as number) / (c.total as number)) * 100) : Number(c.score ?? 0);
    return {
      title: c.criteria_name as string,
      skill_id: skillFromTitle(c.criteria_name as string),
      score,
      level: ratingLabel(ratingForCredit(score / 100)),
      remarks: null,
    };
  });
  return {
    source_type: 'assessment',
    source_id: sourceId,
    title: (attempt.assessments as unknown as { title: string } | null)?.title ?? 'Skill assessment',
    score: attempt.score === null ? null : Number(attempt.score),
    graded_at: attempt.submitted_at as string | null,
    items,
  };
}

/** Changes whenever a grade or remark the feedback describes changes. */
export function workSignature(work: GradedWork): string {
  const basis = JSON.stringify([work.score, work.items.map((i) => [i.title, i.score, i.remarks])]);
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

/** Feedback without the AI: the best and weakest skills, straight from the grades. */
export function ruleFeedback(work: GradedWork): Feedback {
  const sorted = [...work.items].sort((a, b) => b.score - a.score);
  const strong = sorted.filter((i) => i.score >= 88).slice(0, 3);
  const weak = [...sorted].reverse().filter((i) => i.score < 75).slice(0, 3);
  return {
    summary:
      work.score === null
        ? `Your ${work.source_type === 'scenario' ? 'scenario' : 'skill assessment'} has been graded.`
        : `You scored ${work.score}% on ${work.title}.${weak.length > 0 ? ` Focus next on ${weak.map((w) => w.title).join(', ')}.` : ' Every skill was at or above Satisfactory.'}`,
    strengths: strong.map((i) => ({ skill_id: i.skill_id, note: `${i.title}: ${i.level} (${i.score}%).` })),
    improvements: weak.map((i) => ({
      skill_id: i.skill_id,
      note: `${i.title}: ${i.level} (${i.score}%)${i.remarks ? ` — your instructor noted: "${i.remarks}"` : ''}. Review the checklist steps for this skill.`,
    })),
    suggested_goals: weak.map((i) => `Practise ${i.title.replace(/\s*\(Skill [\d-]+\)$/, '')} until I can perform every step without prompting.`),
    source: 'rules',
  };
}

function feedbackPrompt(work: GradedWork): string {
  const lines = work.items
    .map((i) => `- ${i.title}: ${i.level} (${i.score}%)${i.remarks ? `; instructor remark: "${i.remarks}"` : ''}`)
    .join('\n');
  return `You are a clinical nursing instructor giving a nursing student feedback on graded work, based on Taylor's clinical nursing skill checklists.

${work.source_type === 'scenario' ? 'Simulation scenario' : 'Skill assessment'}: ${work.title}
Overall score: ${work.score ?? 'not scored'}%
Per skill (levels are Excellent, Satisfactory, Needs Practice):
${lines}

Write encouraging, specific feedback addressed to the student ("you"). Base every point on the grades and remarks above; do not invent observations. Return ONLY JSON, no markdown:
{
  "summary": "2-3 sentences",
  "strengths": [{"skill": "1-7 or null", "note": "one sentence"}],
  "improvements": [{"skill": "1-4 or null", "note": "one sentence naming what to practise"}],
  "suggested_goals": ["a specific, measurable goal", "…"]
}
Give at most 3 strengths, 3 improvements and 3 goals. Use the skill numbers shown in the titles above.`;
}

/** AI feedback on the work, falling back to ruleFeedback when the AI is unavailable. */
export async function generateFeedback(work: GradedWork): Promise<Feedback> {
  if (work.items.length === 0) return ruleFeedback(work);
  try {
    const raw = await callAI(feedbackPrompt(work));
    const known = new Set(work.items.map((i) => i.skill_id).filter(Boolean));
    const points = (v: unknown) =>
      (Array.isArray(v) ? v : [])
        .map((p) => {
          const note = typeof p?.note === 'string' ? p.note.trim().slice(0, 400) : '';
          const skill = typeof p?.skill === 'string' ? p.skill.replace(/^skill\s*/i, '').trim() : '';
          return note ? { skill_id: known.has(skill) ? skill : null, note } : null;
        })
        .filter((p): p is { skill_id: string | null; note: string } => p !== null)
        .slice(0, 3);
    const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 800) : '';
    if (!summary) throw new Error('AI returned no summary');
    return {
      summary,
      strengths: points(raw.strengths),
      improvements: points(raw.improvements),
      suggested_goals: (Array.isArray(raw.suggested_goals) ? raw.suggested_goals : [])
        .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        .map((g) => g.trim().slice(0, MAX_GOAL_LENGTH))
        .slice(0, MAX_GOALS),
      source: 'ai',
    };
  } catch (err) {
    console.warn('AI feedback unavailable, using the grades alone', err instanceof Error ? err.message : err);
    return ruleFeedback(work);
  }
}

export interface GoalInput {
  text: string;
  skill_id: string | null;
}

/** Goals from a request body: trimmed, non-empty, at most MAX_GOALS. */
export function parseGoals(value: unknown): GoalInput[] | string {
  if (!Array.isArray(value)) return [];
  const goals: GoalInput[] = [];
  for (const g of value) {
    const text = typeof g?.text === 'string' ? g.text.trim() : typeof g === 'string' ? g.trim() : '';
    if (!text) continue;
    if (text.length > MAX_GOAL_LENGTH) return `Each goal can be at most ${MAX_GOAL_LENGTH} characters`;
    goals.push({ text, skill_id: isSkillId(g?.skill_id) ? g.skill_id : null });
  }
  if (goals.length > MAX_GOALS) return `Set at most ${MAX_GOALS} goals`;
  return goals;
}
