import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: assessmentId } = await params;

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

  const studentIds = Array.isArray(student_ids)
    ? student_ids.filter((s): s is string => typeof s === 'string')
    : [];
  if (studentIds.length === 0) {
    return NextResponse.json({ error: 'student_ids is required' }, { status: 400 });
  }
  const deadlineValue =
    typeof deadline === 'string' && deadline.length > 0 ? new Date(deadline) : null;
  if (deadlineValue && Number.isNaN(deadlineValue.getTime())) {
    return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, title, is_published')
      .eq('id', assessmentId)
      .single();
    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const rows = studentIds.map((student_id) => ({
      assessment_id: assessmentId,
      student_id,
      assigned_by: session.uid,
      deadline: deadlineValue ? deadlineValue.toISOString() : null,
      required: typeof required === 'boolean' ? required : true,
    }));

    const { data: assignments, error } = await supabase
      .from('assessment_assignments')
      .upsert(rows, { onConflict: 'assessment_id,student_id', ignoreDuplicates: false })
      .select();

    if (error) {
      console.error('Failed to assign assessment', error);
      return NextResponse.json({ error: 'Unable to assign assessment' }, { status: 500 });
    }

    // In-app notification for each student (FCM delivery comes later).
    const { error: notifyError } = await supabase.from('notifications').insert(
      studentIds.map((user_id) => ({
        user_id,
        type: 'assignment_created',
        title: 'New quiz assigned',
        body: `You have been assigned "${assessment.title}".`,
        data: { assessment_id: assessmentId },
      })),
    );
    if (notifyError) console.error('Failed to create assignment notifications', notifyError);

    await logAudit(
      session,
      {
        action: 'assessment.assign',
        entityType: 'assessments',
        entityId: assessmentId,
        details: { student_ids: studentIds, deadline: deadlineValue?.toISOString() ?? null },
      },
      request,
    );

    return NextResponse.json({ assignments: assignments ?? [] }, { status: 201 });
  } catch (err) {
    console.error('Assign assessment failed', err);
    return NextResponse.json({ error: 'Unable to assign assessment' }, { status: 500 });
  }
}
