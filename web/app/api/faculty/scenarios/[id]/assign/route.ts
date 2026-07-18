import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: scenarioId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { student_ids, deadline, required } = body as {
    student_ids?: unknown;
    deadline?: unknown;
    required?: unknown;
  };

  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return NextResponse.json({ error: 'student_ids array is required' }, { status: 400 });
  }

  const normalizedStudentIds = student_ids.filter((s): s is string => typeof s === 'string');
  if (normalizedStudentIds.length === 0) {
    return NextResponse.json({ error: 'student_ids must contain valid strings' }, { status: 400 });
  }

  const parsedDeadline = typeof deadline === 'string' && deadline.trim().length > 0
    ? new Date(deadline)
    : null;
  if (deadline && (parsedDeadline === null || isNaN(parsedDeadline.getTime()))) {
    return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Verify the scenario exists.
    const { data: scenario } = await supabase
      .from('scenarios')
      .select('id')
      .eq('id', scenarioId)
      .maybeSingle();

    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    // Faculty can only assign to students in their sections.
    if (session.role === 'faculty') {
      const rosterIds = new Set(await getFacultyStudentIds(supabase, session.uid));
      const invalid = normalizedStudentIds.filter((sid) => !rosterIds.has(sid));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: 'Some students are not in your sections', invalid },
          { status: 403 },
        );
      }
    }

    const rows = normalizedStudentIds.map((studentId) => ({
      scenario_id: scenarioId,
      student_id: studentId,
      assigned_by: session.uid,
      deadline: parsedDeadline ? parsedDeadline.toISOString() : null,
      required: typeof required === 'boolean' ? required : true,
      status: 'pending' as const,
    }));

    const { data: assignments, error } = await supabase
      .from('scenario_assignments')
      .insert(rows)
      .select('id, scenario_id, student_id, assigned_at, deadline, status, required, score, completed_at, time_taken');

    if (error) {
      console.error('Failed to assign scenario', error);
      return NextResponse.json({ error: 'Unable to assign scenario' }, { status: 500 });
    }

    return NextResponse.json({ assignments }, { status: 201 });
  } catch (err) {
    console.error('Assign scenario failed', err);
    return NextResponse.json({ error: 'Unable to assign scenario' }, { status: 500 });
  }
}
