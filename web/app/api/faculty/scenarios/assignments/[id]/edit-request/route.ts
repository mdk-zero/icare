import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { logAudit } from '@/app/lib/audit';
import {
  GRADE_EDIT_REQUEST,
  MAX_REASON_LENGTH,
  latestGradeEditRequest,
  needsEditApproval,
  type GradeEditRequestData,
} from '@/app/lib/grade-edit-requests';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** What the review page needs to know about changing this saved grade. */
function toState(data: GradeEditRequestData | null) {
  if (!data) return { status: 'none' as const };
  // A used approval is spent: the next change starts from scratch.
  if (data.status === 'accepted' && data.used_at) return { status: 'none' as const };
  return {
    status: data.status,
    reason: data.reason,
    requested_at: data.requested_at,
    resolved_by_name: data.resolved_by_name ?? null,
    resolved_at: data.resolved_at ?? null,
  };
}

async function loadCompletedAssignment(assignmentId: string, uid: string) {
  const supabase = getSupabaseAdmin();
  const { data: assignment } = await supabase
    .from('scenario_assignments')
    .select('id, student_id, scenario_id, status')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return { response: NextResponse.json({ error: 'Assignment not found' }, { status: 404 }) };
  const studentIds = await getFacultyStudentIds(supabase, uid);
  if (!studentIds.includes(assignment.student_id)) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { supabase, assignment };
}

// GET /api/faculty/scenarios/assignments/:id/edit-request
// Whether the caller may change this saved grade, has asked, or was turned down.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!needsEditApproval(session.role)) return NextResponse.json({ status: 'not_required' });

  const { id } = await params;
  try {
    const loaded = await loadCompletedAssignment(id, session.uid);
    if (loaded.response) return loaded.response;
    const latest = await latestGradeEditRequest(loaded.supabase, id, session.uid);
    return NextResponse.json(toState(latest?.data ?? null));
  } catch (err) {
    console.error('Failed to read grade edit request', err);
    return NextResponse.json({ error: 'Unable to check the edit request' }, { status: 500 });
  }
}

// POST /api/faculty/scenarios/assignments/:id/edit-request  { reason }
// Asks the caller's admin for permission to change a saved grade.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!needsEditApproval(session.role)) {
    return NextResponse.json({ error: 'Only instructors need permission to change a grade' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = (body as { reason?: unknown }).reason;
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (!reason) return NextResponse.json({ error: 'Give a reason for changing the grade' }, { status: 400 });
  if (reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json({ error: `Keep the reason under ${MAX_REASON_LENGTH} characters` }, { status: 400 });
  }

  const { id } = await params;
  try {
    const loaded = await loadCompletedAssignment(id, session.uid);
    if (loaded.response) return loaded.response;
    const { supabase, assignment } = loaded;
    if (assignment.status !== 'completed') {
      return NextResponse.json({ error: 'This grade is not saved yet, so it can be changed freely' }, { status: 409 });
    }

    const latest = await latestGradeEditRequest(supabase, id, session.uid);
    const state = toState(latest?.data ?? null);
    if (state.status === 'pending') {
      return NextResponse.json({ error: 'You already asked; wait for your dean to answer' }, { status: 409 });
    }
    if (state.status === 'accepted') {
      return NextResponse.json({ error: 'You already have permission to change this grade' }, { status: 409 });
    }

    const [{ data: me }, { data: student }, { data: scenario }] = await Promise.all([
      supabase.from('users').select('name, admin_id').eq('id', session.uid).single(),
      supabase.from('users').select('name').eq('id', assignment.student_id).single(),
      supabase.from('scenarios').select('title').eq('id', assignment.scenario_id).single(),
    ]);

    // Their own admin (053); every admin when they have none.
    let approvers: string[] = [];
    if (me?.admin_id) {
      const { data: admin } = await supabase.from('users').select('id').eq('id', me.admin_id).eq('role', 'admin').maybeSingle();
      if (admin) approvers = [admin.id as string];
    }
    if (approvers.length === 0) {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
      approvers = (admins ?? []).map((a) => a.id as string);
    }
    if (approvers.length === 0) {
      return NextResponse.json({ error: 'There is no dean to ask' }, { status: 409 });
    }

    const facultyName = me?.name ?? session.email;
    const studentName = student?.name ?? 'a student';
    const scenarioTitle = scenario?.title ?? 'a patient case';
    const data: GradeEditRequestData = {
      kind: GRADE_EDIT_REQUEST,
      request_id: randomUUID(),
      status: 'pending',
      assignment_id: id,
      faculty_id: session.uid,
      faculty_name: facultyName,
      student_name: studentName,
      scenario_title: scenarioTitle,
      reason,
      requested_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('notifications').insert(
      approvers.map((user_id) => ({
        user_id,
        type: 'system',
        title: 'Grade change request',
        body: `${facultyName} wants to change ${studentName}'s grade on "${scenarioTitle}". Reason: ${reason}`,
        data,
      })),
    );
    if (error) throw error;

    await logAudit(
      session,
      {
        action: 'grade_edit.request',
        entityType: 'scenario_assignments',
        entityId: id,
        details: { request_id: data.request_id, reason, approvers },
      },
      request,
    );

    return NextResponse.json(toState(data), { status: 201 });
  } catch (err) {
    console.error('Failed to request a grade edit', err);
    return NextResponse.json({ error: 'Unable to send the request' }, { status: 500 });
  }
}
