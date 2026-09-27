import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { GRADE_EDIT_DECISION, GRADE_EDIT_REQUEST, type GradeEditRequestData } from '@/app/lib/grade-edit-requests';

/**
 * Accept or decline a faculty member's request to change a saved grade. Every
 * approver holds a copy, so settling it rewrites them all; the faculty member
 * is told either way.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const status = (body as { status?: unknown }).status;
  if (status !== 'accepted' && status !== 'declined') {
    return NextResponse.json({ error: 'status must be accepted or declined' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from('notifications')
      .select('id, user_id, data, read_at')
      .eq('data->>kind', GRADE_EDIT_REQUEST)
      .eq('data->>request_id', id);
    if (error) throw error;
    // Only an admin the request was sent to may answer it.
    if (!rows?.some((r) => r.user_id === session.uid)) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const current = rows[0].data as GradeEditRequestData;
    if (current.status !== 'pending') {
      return NextResponse.json({ error: `This request was already ${current.status}.` }, { status: 409 });
    }

    const { data: me } = await supabase.from('users').select('name').eq('id', session.uid).maybeSingle();
    const now = new Date().toISOString();
    const resolved: GradeEditRequestData = {
      ...current,
      status,
      resolved_by: session.uid,
      resolved_by_name: me?.name ?? session.email,
      resolved_at: now,
    };
    const results = await Promise.all(
      rows.map((row) =>
        supabase
          .from('notifications')
          .update({ data: resolved, read_at: row.read_at ?? now })
          .eq('id', row.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    const accepted = status === 'accepted';
    const { error: notifyError } = await supabase.from('notifications').insert({
      user_id: current.faculty_id,
      type: accepted ? 'performance_validated' : 'system',
      title: accepted ? 'Grade change approved' : 'Grade change declined',
      body: accepted
        ? `${resolved.resolved_by_name} approved changing ${current.student_name}'s grade on "${current.scenario_title}". Open it in Review Submissions and click Edit.`
        : `${resolved.resolved_by_name} declined changing ${current.student_name}'s grade on "${current.scenario_title}".`,
      data: {
        kind: GRADE_EDIT_DECISION,
        request_id: id,
        assignment_id: current.assignment_id,
        status,
      },
    });
    if (notifyError) console.error('Failed to notify faculty of grade edit decision', notifyError);

    await logAudit(
      session,
      {
        action: `grade_edit.${status}`,
        entityType: 'scenario_assignments',
        entityId: current.assignment_id,
        details: { request_id: id, faculty_id: current.faculty_id, reason: current.reason },
      },
      request,
    );

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('Resolve grade edit request failed', err);
    return NextResponse.json({ error: 'Unable to update the request' }, { status: 500 });
  }
}
