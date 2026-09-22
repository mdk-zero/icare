import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import {
  fetchTaskCompletions,
  isMissingRatingColumns,
  RATINGS_NEED_MIGRATION,
} from '@/app/lib/scenario-tasks';
import { isPerformed, isTaskRating, MAX_REMARKS_LENGTH, type TaskRating } from '@/app/lib/task-ratings';
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

// GET: scenario tasks + this assignment's completion state and ratings (faculty view).
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

    const [tasksRes, completions] = await Promise.all([
      supabase
        .from('scenario_tasks')
        .select('id, title, description, category, points, verification, system_trigger, sort_order')
        .eq('scenario_id', loaded.assignment.scenario_id)
        .order('sort_order', { ascending: true }),
      fetchTaskCompletions(supabase, [assignmentId]),
    ]);

    if (tasksRes.error || completions.error) {
      return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
    }

    const completionByTask = new Map(completions.rows.map((c) => [c.task_id, c]));
    const tasks = (tasksRes.data ?? []).map((t) => {
      const completion = completionByTask.get(t.id);
      return {
        ...t,
        is_completed: isPerformed(completion),
        completed_via: completion?.completed_via ?? null,
        completed_at: completion?.completed_at ?? null,
        rating: completion?.rating ?? null,
        remarks: completion?.remarks ?? null,
      };
    });

    return NextResponse.json({
      tasks,
      status: loaded.assignment.status,
      ratings_enabled: completions.ratingsEnabled,
    });
  } catch (err) {
    console.error('Fetch faculty assignment tasks failed', err);
    return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
  }
}

// PUT: set (or clear) the faculty's verbal rating and/or note for one task.
//   { task_id, rating?: TaskRating | null, remarks?: string | null }
// A field left out is kept, so a note and a rating saved back to back can't
// overwrite each other. Any task can be rated, including system tasks the
// student's charting auto-completed: the check-off records that it was done,
// the rating how well. Clearing a rating on an auto-completed task keeps the
// completion (full credit again); clearing one faculty created removes the row.
// A note needs a completion to hang on, so an unrated task is rated first.
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
  const { task_id, rating, remarks } = body as {
    task_id?: unknown;
    rating?: unknown;
    remarks?: unknown;
  };
  if (typeof task_id !== 'string' || !task_id) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  }
  if (rating !== undefined && rating !== null && !isTaskRating(rating)) {
    return NextResponse.json({ error: 'rating must be a rating level or null' }, { status: 400 });
  }
  if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
    return NextResponse.json({ error: 'remarks must be text' }, { status: 400 });
  }
  if (rating === undefined && remarks === undefined) {
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
    if (loaded.assignment.status === 'completed') {
      return NextResponse.json({ error: 'This scenario is already finalized' }, { status: 409 });
    }

    const { data: task } = await supabase
      .from('scenario_tasks')
      .select('id, scenario_id')
      .eq('id', task_id)
      .maybeSingle();
    if (!task || task.scenario_id !== loaded.assignment.scenario_id) {
      return NextResponse.json({ error: 'Task not found for this scenario' }, { status: 404 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('scenario_task_completions')
      .select('id, completed_via')
      .eq('assignment_id', assignmentId)
      .eq('task_id', task_id)
      .maybeSingle();
    if (existingError) {
      console.error('Failed to read task completion', existingError);
      return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
    }

    const graded = {
      ...(nextRating !== undefined ? { rating: nextRating } : {}),
      ...(nextRemarks !== undefined ? { remarks: nextRemarks } : {}),
      rated_by: session.uid,
    };

    const update = (id: string) =>
      supabase.from('scenario_task_completions').update(graded).eq('id', id);

    let error: { code?: string; message?: string } | null = null;
    if (nextRating === undefined) {
      if (!existing) {
        return NextResponse.json(
          { error: 'Rate this criterion before adding a note' },
          { status: 409 },
        );
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
        task_id,
        completed_by: session.uid,
        completed_via: 'faculty',
        ...graded,
      }));
      // The student's charting auto-completed it in the meantime: rate that row.
      if (error?.code === '23505') {
        ({ error } = await supabase
          .from('scenario_task_completions')
          .update(graded)
          .eq('assignment_id', assignmentId)
          .eq('task_id', task_id));
      }
    }

    if (error) {
      if (isMissingRatingColumns(error)) {
        return NextResponse.json({ error: RATINGS_NEED_MIGRATION }, { status: 503 });
      }
      console.error('Failed to save task rating', error);
      return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Save task rating failed', err);
    return NextResponse.json({ error: 'Unable to save rating' }, { status: 500 });
  }
}
