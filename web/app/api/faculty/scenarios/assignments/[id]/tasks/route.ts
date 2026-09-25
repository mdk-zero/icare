import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import {
  fetchStepRatings,
  fetchTaskCompletions,
  fetchTaskSteps,
  isMissingRatingColumns,
  isMissingStepTables,
  isOldRatingScale,
  RATINGS_NEED_MIGRATION,
  SCALE_NEEDS_MIGRATION,
  scoreAssignment,
  STEPS_NEED_MIGRATION,
} from '@/app/lib/scenario-tasks';
import {
  isPerformed,
  isTaskRating,
  MAX_REMARKS_LENGTH,
  ratingForCredit,
  resolveRubric,
  resolveStepRatings,
  storedRating,
  taskCredit,
  wholeTaskLevel,
  type TaskRating,
} from '@/app/lib/task-ratings';
import type { SupabaseClient } from '@supabase/supabase-js';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Assignment = { id: string; student_id: string; scenario_id: string; status: string };

/** Load the assignment and confirm the caller (faculty/admin) may act on it. */
async function loadAssignment(
  supabase: SupabaseClient,
  role: string,
  uid: string,
  assignmentId: string,
): Promise<{ assignment: Assignment } | { error: NextResponse }> {
  const { data: assignment } = await supabase
    .from('scenario_assignments')
    .select('id, student_id, scenario_id, status')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) {
    return { error: NextResponse.json({ error: 'Assignment not found' }, { status: 404 }) };
  }
  if (role !== 'admin') {
    const studentIds = await getFacultyStudentIds(supabase, uid);
    if (!studentIds.includes(assignment.student_id)) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
  }
  return { assignment: assignment as Assignment };
}

// GET: scenario tasks, each with its sub-task checklist, plus this
// assignment's completion state and ratings (faculty view).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadAssignment(supabase, session.role, session.uid, assignmentId);
    if ('error' in loaded) return loaded.error;

    const [tasksRes, completions, stepRatings, rubricRes] = await Promise.all([
      supabase
        .from('scenario_tasks')
        .select('id, title, description, category, points, verification, system_trigger, sort_order')
        .eq('scenario_id', loaded.assignment.scenario_id)
        .order('sort_order', { ascending: true }),
      fetchTaskCompletions(supabase, [assignmentId]),
      fetchStepRatings(supabase, [assignmentId]),
      // Before migration 046 there is no rubric column; the defaults apply.
      supabase.from('scenarios').select('rubric').eq('id', loaded.assignment.scenario_id).maybeSingle(),
    ]);
    const steps = await fetchTaskSteps(supabase, (tasksRes.data ?? []).map((t) => t.id as string));

    if (tasksRes.error || completions.error || stepRatings.error || steps.error) {
      return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
    }

    const completionByTask = new Map(completions.rows.map((c) => [c.task_id, c]));
    const ratingByStep = new Map(stepRatings.rows.map((r) => [r.step_id, r.rating]));
    const stepsByTask = new Map<string, { id: string; title: string; source: string; rating: TaskRating | null }[]>();
    for (const step of steps.steps) {
      const list = stepsByTask.get(step.task_id) ?? [];
      list.push({ id: step.id, title: step.title, source: step.source, rating: ratingByStep.get(step.id) ?? null });
      stepsByTask.set(step.task_id, list);
    }

    const tasks = (tasksRes.data ?? []).map((t) => {
      const completion = completionByTask.get(t.id);
      return {
        ...t,
        is_completed: isPerformed(completion),
        completed_via: completion?.completed_via ?? null,
        completed_at: completion?.completed_at ?? null,
        rating: completion?.rating ?? null,
        remarks: completion?.remarks ?? null,
        steps: stepsByTask.get(t.id) ?? [],
      };
    });

    return NextResponse.json({
      tasks,
      status: loaded.assignment.status,
      ratings_enabled: completions.ratingsEnabled,
      steps_enabled: steps.stepsEnabled,
      rubric: resolveRubric(rubricRes.error ? null : rubricRes.data?.rubric),
    });
  } catch (err) {
    console.error('Fetch faculty assignment tasks failed', err);
    return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
  }
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** A completion row as the whole-task level reads it; a pre-046 "not performed" counts as none. */
function existingLevel(existing: { rating: unknown } | null): { rating: TaskRating | null } | undefined {
  if (!existing) return undefined;
  const rating = storedRating(existing.rating);
  return rating === 'absent' ? undefined : { rating };
}
type StepChange = { step_id: string; rating: TaskRating | null };

/** A body's `steps`, or an error message saying why it isn't one. */
function parseStepChanges(value: unknown): StepChange[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'steps must be a non-empty list';
  const changes: StepChange[] = [];
  for (const item of value) {
    const { step_id, rating } = (item ?? {}) as { step_id?: unknown; rating?: unknown };
    if (typeof step_id !== 'string' || !step_id) return 'each step needs a step_id';
    if (rating !== null && !isTaskRating(rating)) return 'each step rating must be a rating level or null';
    changes.push({ step_id, rating: rating as TaskRating | null });
  }
  return changes;
}

// PUT: grade one task, as a whole or sub-task by sub-task.
//   { task_id, rating?: TaskRating | null, remarks?: string | null }
//   { task_id, steps: [{ step_id, rating: TaskRating | null }, ...] }
//
// A field left out is kept, so a note and a rating saved back to back can't
// overwrite each other. Any task can be rated, including system tasks the
// student's charting auto-completed: the check-off records that it was done,
// the rating how well. Clearing a rating on an auto-completed task keeps the
// completion (full credit again); clearing one faculty created removes the row.
// A note needs a completion to hang on, so an unrated task is rated first.
//
// A task with sub-tasks is only rated through `steps` (one sub-task per click,
// or all of them at once); its overall level is derived from them. See
// saveStepRatings.
//
// Finalizing doesn't lock grading — faculty can keep correcting ratings and
// notes afterward. When the assignment is already finalized, this recomputes
// and persists its score from the edit, so what students and analytics read
// stays in sync; the response's `score` lets the client mirror that without
// a second round trip.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { task_id, rating, remarks, steps } = body as {
    task_id?: unknown;
    rating?: unknown;
    remarks?: unknown;
    steps?: unknown;
  };
  if (typeof task_id !== 'string' || !task_id) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  }
  let stepChanges: StepChange[] | undefined;
  if (steps !== undefined) {
    if (rating !== undefined || remarks !== undefined) {
      return NextResponse.json({ error: 'Send steps on their own' }, { status: 400 });
    }
    const parsed = parseStepChanges(steps);
    if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });
    stepChanges = parsed;
  }
  if (rating !== undefined && rating !== null && !isTaskRating(rating)) {
    return NextResponse.json({ error: 'rating must be a rating level or null' }, { status: 400 });
  }
  if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
    return NextResponse.json({ error: 'remarks must be text' }, { status: 400 });
  }
  if (rating === undefined && remarks === undefined && !stepChanges) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
  }
  const nextRating = rating as TaskRating | null | undefined;
  // Undefined leaves the saved note alone; blank clears it.
  const nextRemarks =
    typeof remarks === 'string' ? remarks.trim().slice(0, MAX_REMARKS_LENGTH) || null : remarks;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadAssignment(supabase, session.role, session.uid, assignmentId);
    if ('error' in loaded) return loaded.error;

    const { data: task } = await supabase
      .from('scenario_tasks')
      .select('id, scenario_id')
      .eq('id', task_id)
      .maybeSingle();
    if (!task || task.scenario_id !== loaded.assignment.scenario_id) {
      return NextResponse.json({ error: 'Task not found for this scenario' }, { status: 404 });
    }

    const taskSteps = await fetchTaskSteps(supabase, [task_id]);
    if (taskSteps.error) {
      console.error('Failed to read sub-tasks', taskSteps.error);
      return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
    }

    let saved: NextResponse | { level: TaskRating | null };
    if (stepChanges) {
      if (!taskSteps.stepsEnabled) {
        return NextResponse.json({ error: STEPS_NEED_MIGRATION }, { status: 503 });
      }
      saved = await saveStepRatings(
        supabase,
        assignmentId,
        task_id,
        taskSteps.steps.map((s) => s.id),
        stepChanges,
        session.uid,
      );
    } else {
      if (nextRating !== undefined && taskSteps.steps.length > 0) {
        return NextResponse.json(
          { error: 'This task is graded by its sub-tasks — rate those instead' },
          { status: 409 },
        );
      }
      saved = await saveTaskGrade(supabase, assignmentId, task_id, nextRating, nextRemarks, session.uid);
    }
    if (saved instanceof NextResponse) return saved;

    // Already finalized: keep the stored score current with this edit.
    let score: number | undefined;
    if (loaded.assignment.status === 'completed') {
      const graded = await scoreAssignment(supabase, assignmentId, loaded.assignment.scenario_id);
      if (!graded.error) {
        score = graded.score;
        const { error: scoreError } = await supabase
          .from('scenario_assignments')
          .update({ score })
          .eq('id', assignmentId);
        if (scoreError) console.error('Failed to sync score after edit', scoreError);
      } else {
        console.error('Failed to recompute score after edit', graded.error);
      }
    }

    return NextResponse.json({ ok: true, score, rating: saved.level });
  } catch (err) {
    console.error('Save task rating failed', err);
    return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
  }
}

/** Rate (or clear) a task as a whole, and/or its note. */
async function saveTaskGrade(
  supabase: Supabase,
  assignmentId: string,
  taskId: string,
  nextRating: TaskRating | null | undefined,
  nextRemarks: string | null | undefined,
  uid: string,
): Promise<NextResponse | { level: TaskRating | null }> {
  const { data: existing, error: existingError } = await supabase
    .from('scenario_task_completions')
    .select('id, completed_via')
    .eq('assignment_id', assignmentId)
    .eq('task_id', taskId)
    .maybeSingle();
  if (existingError) {
    console.error('Failed to read task completion', existingError);
    return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
  }

  const graded = {
    ...(nextRating !== undefined ? { rating: nextRating } : {}),
    ...(nextRemarks !== undefined ? { remarks: nextRemarks } : {}),
    rated_by: uid,
  };

  const update = (id: string) =>
    supabase.from('scenario_task_completions').update(graded).eq('id', id);

  let error: { code?: string; message?: string } | null = null;
  if (nextRating === undefined) {
    if (!existing) {
      return NextResponse.json({ error: 'Rate this criterion before adding a note' }, { status: 409 });
    }
    ({ error } = await update(existing.id));
  } else if (nextRating === null) {
    if (existing?.completed_via === 'faculty') {
      ({ error } = await supabase.from('scenario_task_completions').delete().eq('id', existing.id));
    } else if (existing) {
      ({ error } = await update(existing.id));
    }
  } else if (existing) {
    ({ error } = await update(existing.id));
  } else {
    ({ error } = await supabase.from('scenario_task_completions').insert({
      assignment_id: assignmentId,
      task_id: taskId,
      completed_by: uid,
      completed_via: 'faculty',
      ...graded,
    }));
    // The student's charting auto-completed it in the meantime: rate that row.
    if (error?.code === '23505') {
      ({ error } = await supabase
        .from('scenario_task_completions')
        .update(graded)
        .eq('assignment_id', assignmentId)
        .eq('task_id', taskId));
    }
  }

  if (error) {
    if (isMissingRatingColumns(error)) {
      return NextResponse.json({ error: RATINGS_NEED_MIGRATION }, { status: 503 });
    }
    if (isOldRatingScale(error)) {
      return NextResponse.json({ error: SCALE_NEEDS_MIGRATION }, { status: 503 });
    }
    console.error('Failed to save task rating', error);
    return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
  }
  return { level: nextRating ?? null };
}

/**
 * Rate (or clear) some of a task's sub-tasks, then store the task's overall
 * level on its completion row, where the task-only readers (the student's
 * list, ward progress, tips) find it.
 *
 * A task graded as a whole so far — auto-completed, or rated before it had
 * sub-tasks — shows that level on every sub-task. The first sub-task rating
 * writes the others down at that level (resolveStepRatings), so rating one
 * sub-task doesn't silently zero the rest. Those implied rows are inserted
 * without overwriting, so a rating saved at the same moment for another
 * sub-task wins over them.
 *
 * Clearing every sub-task returns the task to ungraded: an auto-completion
 * keeps its row at full credit, a faculty-created row is removed.
 */
async function saveStepRatings(
  supabase: Supabase,
  assignmentId: string,
  taskId: string,
  stepIds: string[],
  changes: StepChange[],
  uid: string,
): Promise<NextResponse | { level: TaskRating | null }> {
  if (stepIds.length === 0) {
    return NextResponse.json({ error: 'This task has no sub-tasks' }, { status: 409 });
  }
  const known = new Set(stepIds);
  if (changes.some((c) => !known.has(c.step_id))) {
    return NextResponse.json({ error: 'Sub-task not found for this task' }, { status: 404 });
  }

  // The completion row carries the overall level, so it must have 043's
  // columns before anything is written.
  const { data: existing, error: existingError } = await supabase
    .from('scenario_task_completions')
    .select('id, completed_via, rating')
    .eq('assignment_id', assignmentId)
    .eq('task_id', taskId)
    .maybeSingle();
  if (existingError) {
    if (isMissingRatingColumns(existingError)) {
      return NextResponse.json({ error: RATINGS_NEED_MIGRATION }, { status: 503 });
    }
    console.error('Failed to read task completion', existingError);
    return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
  }

  const { data: currentRows, error: currentError } = await supabase
    .from('scenario_task_step_ratings')
    .select('step_id, rating')
    .eq('assignment_id', assignmentId)
    .in('step_id', stepIds);
  if (currentError) {
    if (isMissingStepTables(currentError)) {
      return NextResponse.json({ error: STEPS_NEED_MIGRATION }, { status: 503 });
    }
    console.error('Failed to read sub-task ratings', currentError);
    return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
  }
  const current = new Map(
    (currentRows ?? []).flatMap((r) => {
      const rating = storedRating(r.rating);
      return rating === null || rating === 'absent' ? [] : [[r.step_id as string, rating] as const];
    }),
  );
  const requested = new Map(changes.map((c) => [c.step_id, c.rating]));
  const final = resolveStepRatings(
    stepIds,
    current,
    wholeTaskLevel(existingLevel(existing)),
    requested,
  );

  const ratedAt = new Date().toISOString();
  const row = (stepId: string, rating: TaskRating) => ({
    assignment_id: assignmentId,
    step_id: stepId,
    rating,
    rated_by: uid,
    rated_at: ratedAt,
  });
  const implied: ReturnType<typeof row>[] = [];
  const explicit: ReturnType<typeof row>[] = [];
  const cleared: string[] = [];
  stepIds.forEach((stepId, i) => {
    const level = final[i];
    if (level === null) {
      if (current.has(stepId)) cleared.push(stepId);
    } else if (requested.has(stepId)) {
      if (current.get(stepId) !== level) explicit.push(row(stepId, level));
    } else if (!current.has(stepId)) {
      implied.push(row(stepId, level));
    }
  });

  const table = () => supabase.from('scenario_task_step_ratings');
  const writes = [
    implied.length > 0
      ? table().upsert(implied, { onConflict: 'assignment_id,step_id', ignoreDuplicates: true })
      : null,
    explicit.length > 0 ? table().upsert(explicit, { onConflict: 'assignment_id,step_id' }) : null,
    cleared.length > 0 ? table().delete().eq('assignment_id', assignmentId).in('step_id', cleared) : null,
  ];
  for (const write of writes) {
    if (!write) continue;
    const { error } = await write;
    if (error) {
      if (isOldRatingScale(error)) {
        return NextResponse.json({ error: SCALE_NEEDS_MIGRATION }, { status: 503 });
      }
      console.error('Failed to save sub-task ratings', error);
      return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
    }
  }

  // The task's overall level, from what its sub-tasks now hold.
  const rated = final.filter((level): level is TaskRating => level !== null);
  let error: { code?: string; message?: string } | null = null;
  let level: TaskRating | null = null;
  if (rated.length > 0) {
    level = ratingForCredit(taskCredit(undefined, { total: stepIds.length, ratings: rated }));
    if (existing) {
      ({ error } = await supabase
        .from('scenario_task_completions')
        .update({ rating: level, rated_by: uid })
        .eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('scenario_task_completions').insert({
        assignment_id: assignmentId,
        task_id: taskId,
        completed_by: uid,
        completed_via: 'faculty',
        rating: level,
        rated_by: uid,
      }));
      if (error?.code === '23505') {
        ({ error } = await supabase
          .from('scenario_task_completions')
          .update({ rating: level, rated_by: uid })
          .eq('assignment_id', assignmentId)
          .eq('task_id', taskId));
      }
    }
  } else if (existing?.completed_via === 'faculty') {
    ({ error } = await supabase.from('scenario_task_completions').delete().eq('id', existing.id));
  } else if (existing) {
    ({ error } = await supabase
      .from('scenario_task_completions')
      .update({ rating: null, rated_by: uid })
      .eq('id', existing.id));
  }
  if (error) {
    // The sub-task ratings are saved and they alone decide the score; the
    // overall level is settled again at finalize.
    console.error('Failed to store the task level from its sub-tasks', error);
  }
  return { level };
}
