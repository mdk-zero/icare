import type { SupabaseClient } from '@supabase/supabase-js';
import { ratingAsAnswer, type SkillAnswer } from './bkt';
import { readMatching } from './fetch-all';
import { storedRating } from './task-ratings';
import { isMissingSkillColumn, skillIdFromTitle } from './taylor-skills';

/**
 * What Patient Cases and Return Demonstrations tell Bayesian Knowledge Tracing:
 * one answer per rated skill on a finished grade, dated when the grade was
 * finished. Same rules as load_sequences in ml/app/bkt.py.
 *
 * The unit is the task, not its sub-tasks. A task is one performance of a skill
 * and its sub-tasks are rated in one sitting, so counting each would read one
 * performance as twenty chances to learn it.
 *
 * Only a completed assignment counts. Until then a task graded by its sub-tasks
 * can hold a level worked out from the few rated so far, the rest counting as
 * zero (taskCredit), which would read as a wrong answer.
 */

interface AssignmentRow {
  id: string;
  student_id: string;
  scenario_id: string;
  completed_at: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  skill_id: string | null;
  sort_order: number | null;
}

interface CompletionRow {
  assignment_id: string;
  task_id: string;
  rating: unknown;
}

/** The students' rated skills, in no particular time order: merge with oldestFirst. */
export async function loadChecklistAnswers(
  supabase: SupabaseClient,
  studentIds: readonly string[],
): Promise<SkillAnswer[]> {
  if (studentIds.length === 0) return [];

  try {
    const assignments = (
      await readMatching<AssignmentRow>(studentIds, (part, from, to) =>
        supabase
          .from('scenario_assignments')
          .select('id, student_id, scenario_id, completed_at')
          .in('student_id', part)
          .eq('status', 'completed')
          .order('id')
          .range(from, to),
      )
    ).filter((a) => a.completed_at);
    if (assignments.length === 0) return [];

    const [tasks, completions] = await Promise.all([
      readMatching<TaskRow>([...new Set(assignments.map((a) => a.scenario_id))], (part, from, to) =>
        supabase
          .from('scenario_tasks')
          .select('id, title, skill_id, sort_order')
          .in('scenario_id', part)
          .order('id')
          .range(from, to),
      ),
      readMatching<CompletionRow>(assignments.map((a) => a.id), (part, from, to) =>
        supabase
          .from('scenario_task_completions')
          .select('assignment_id, task_id, rating')
          .in('assignment_id', part)
          .order('id')
          .range(from, to),
      ),
    ]);

    const assignmentById = new Map(assignments.map((a) => [a.id, a]));
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    return completions
      .flatMap((c) => {
        const assignment = assignmentById.get(c.assignment_id);
        const task = taskById.get(c.task_id);
        const correct = ratingAsAnswer(storedRating(c.rating));
        const skill = task && (task.skill_id ?? skillIdFromTitle(task.title));
        if (!assignment || !skill || correct === null) return [];
        return [
          {
            student_id: assignment.student_id,
            skill_id: skill,
            at: assignment.completed_at as string,
            correct,
            assignment: assignment.id,
            order: task.sort_order ?? 0,
          },
        ];
      })
      .sort((a, b) => a.assignment.localeCompare(b.assignment) || a.order - b.order);
  } catch (err) {
    // Before 043 and 047 there are no ratings or skill links to read.
    if (isMissingSkillColumn(err as { code?: string })) return [];
    throw err;
  }
}
