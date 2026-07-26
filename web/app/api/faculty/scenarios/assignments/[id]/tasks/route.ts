import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
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

// GET: scenario tasks + this assignment's completion state (faculty view).
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

    const [tasksRes, completionsRes] = await Promise.all([
      supabase
        .from('scenario_tasks')
        .select('id, title, description, category, points, verification, system_trigger, sort_order')
        .eq('scenario_id', loaded.assignment.scenario_id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('scenario_task_completions')
        .select('task_id, completed_via, completed_at')
        .eq('assignment_id', assignmentId),
    ]);

    if (tasksRes.error || completionsRes.error) {
      return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
    }

    const completionByTask = new Map((completionsRes.data ?? []).map((c) => [c.task_id, c]));
    const tasks = (tasksRes.data ?? []).map((t) => {
      const completion = completionByTask.get(t.id);
      return {
        ...t,
        is_completed: Boolean(completion),
        completed_via: completion?.completed_via ?? null,
        completed_at: completion?.completed_at ?? null,
      };
    });

    return NextResponse.json({ tasks, status: loaded.assignment.status });
  } catch (err) {
    console.error('Fetch faculty assignment tasks failed', err);
    return NextResponse.json({ error: 'Unable to fetch tasks' }, { status: 500 });
  }
}

// POST: check off one faculty-verified task for this assignment.
export async function POST(request: NextRequest, { params }: RouteParams) {
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
  const { task_id } = body as { task_id?: unknown };
  if (typeof task_id !== 'string' || !task_id) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadAssignment(supabase, session.role, session.uid, assignmentId);
    if ('error' in loaded) return loaded.error;
    if (loaded.assignment.status === 'completed') {
      return NextResponse.json({ error: 'This scenario is already finalized' }, { status: 409 });
    }

    const { data: task } = await supabase
      .from('scenario_tasks')
      .select('id, scenario_id, verification')
      .eq('id', task_id)
      .maybeSingle();
    if (!task || task.scenario_id !== loaded.assignment.scenario_id) {
      return NextResponse.json({ error: 'Task not found for this scenario' }, { status: 404 });
    }
    if (task.verification !== 'faculty') {
      return NextResponse.json(
        { error: 'System tasks are checked off automatically, not by faculty' },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from('scenario_task_completions')
      .upsert(
        { assignment_id: assignmentId, task_id, completed_by: session.uid, completed_via: 'faculty' },
        { onConflict: 'assignment_id,task_id', ignoreDuplicates: true },
      );
    if (error) {
      console.error('Failed to check off task', error);
      return NextResponse.json({ error: 'Unable to check off task' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Check off task failed', err);
    return NextResponse.json({ error: 'Unable to check off task' }, { status: 500 });
  }
}

// DELETE: undo a faculty check-off (?task_id=...).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assignmentId } = await params;
  const taskId = request.nextUrl.searchParams.get('task_id');
  if (!taskId) return NextResponse.json({ error: 'task_id is required' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadAssignment(supabase, session.role, session.uid, assignmentId);
    if ('error' in loaded) return loaded.error;
    if (loaded.assignment.status === 'completed') {
      return NextResponse.json({ error: 'This scenario is already finalized' }, { status: 409 });
    }

    const { error } = await supabase
      .from('scenario_task_completions')
      .delete()
      .eq('assignment_id', assignmentId)
      .eq('task_id', taskId)
      .eq('completed_via', 'faculty');
    if (error) {
      return NextResponse.json({ error: 'Unable to undo check-off' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Undo check off failed', err);
    return NextResponse.json({ error: 'Unable to undo check-off' }, { status: 500 });
  }
}
