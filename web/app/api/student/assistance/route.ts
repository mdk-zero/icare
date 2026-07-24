import { NextResponse, type NextRequest } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { isPatientAssigned } from '@/app/lib/assigned-patients';
import { getFacultySectionIds } from '@/app/lib/roster';

/**
 * Student help flag raised during simulation (ERD `assistance_requests`,
 * Phase 1.10). The table has existed since migration 013 but nothing could
 * write to it, so the faculty dashboard's assistance alerts were unreachable.
 *
 * Raising one notifies every faculty member who handles the student's section,
 * which is the same roster rule the vitals-anomaly notification uses.
 */

const MAX_MESSAGE = 500;

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('assistance_requests')
      .select('id, message, status, created_at, resolved_at, patient_id, room_id, patients(name, room_number)')
      .eq('student_id', session.uid)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to fetch assistance requests', error);
      return NextResponse.json({ error: 'Unable to fetch requests' }, { status: 500 });
    }
    return NextResponse.json({ requests: data ?? [] });
  } catch (err) {
    console.error('Fetch assistance requests failed', err);
    return NextResponse.json({ error: 'Unable to fetch requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, patient_id, room_id } = body as {
    message?: unknown;
    patient_id?: unknown;
    room_id?: unknown;
  };

  const text = typeof message === 'string' ? message.trim().slice(0, MAX_MESSAGE) : '';
  if (!text) {
    return NextResponse.json({ error: 'Describe what you need help with' }, { status: 400 });
  }

  const patientId = typeof patient_id === 'string' && patient_id ? patient_id : null;
  const roomId = typeof room_id === 'string' && room_id ? room_id : null;

  try {
    const supabase = getSupabaseAdmin();

    // Same scoping as vitals/EHR: a student may only flag a patient that one
    // of their assigned scenarios covers.
    if (patientId && !(await isPatientAssigned(supabase, session.uid, patientId))) {
      return NextResponse.json({ error: 'That patient is not assigned to you' }, { status: 403 });
    }

    // One open request at a time — repeated taps should not spam the faculty
    // feed with duplicates of the same call for help.
    const { data: existing } = await supabase
      .from('assistance_requests')
      .select('id')
      .eq('student_id', session.uid)
      .eq('status', 'open')
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'You already have an open request. Your instructor has been notified.' },
        { status: 409 },
      );
    }

    const { data: created, error } = await supabase
      .from('assistance_requests')
      .insert({
        student_id: session.uid,
        patient_id: patientId,
        room_id: roomId,
        message: text,
      })
      .select('id, message, status, created_at, patient_id, room_id')
      .single();

    if (error) {
      console.error('Failed to create assistance request', error);
      return NextResponse.json({ error: 'Unable to send request' }, { status: 500 });
    }

    await notifySectionFaculty(supabase, session.uid, text, created.id);

    await logAudit(
      session,
      {
        action: 'assistance_requested',
        entityType: 'assistance_request',
        entityId: created.id,
        details: { message: text, patient_id: patientId },
      },
      request,
    );

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err) {
    console.error('Create assistance request failed', err);
    return NextResponse.json({ error: 'Unable to send request' }, { status: 500 });
  }
}

/** Notifies the faculty who handle the student's section. */
async function notifySectionFaculty(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  studentId: string,
  message: string,
  requestId: string,
): Promise<void> {
  try {
    const { data: student } = await supabase
      .from('users')
      .select('name, section_id')
      .eq('id', studentId)
      .maybeSingle();
    if (!student?.section_id) return;

    const { data: links } = await supabase
      .from('faculty_sections')
      .select('faculty_id')
      .eq('section_id', student.section_id);

    const facultyIds = [...new Set((links ?? []).map((l) => l.faculty_id as string))];
    if (facultyIds.length === 0) return;

    await supabase.from('notifications').insert(
      facultyIds.map((facultyId) => ({
        user_id: facultyId,
        type: 'assistance_request' as const,
        title: `${student.name} needs assistance`,
        body: message,
        data: { student_id: studentId, request_id: requestId },
      })),
    );
  } catch (err) {
    // A failed notification must not fail the help request itself.
    console.error('Failed to notify faculty of assistance request', err);
  }
}

/** Faculty/admin acknowledge or resolve; students may cancel their own. */
export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, status } = body as { id?: unknown; status?: unknown };
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Request id is required' }, { status: 400 });
  }
  if (status !== 'acknowledged' && status !== 'resolved') {
    return NextResponse.json({ error: 'status must be acknowledged or resolved' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('assistance_requests')
      .select('id, student_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // A student may only close their own request; faculty only ones from a
    // section they handle.
    if (session.role === 'student') {
      if (existing.student_id !== session.uid || status !== 'resolved') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (session.role === 'faculty') {
      const { data: student } = await supabase
        .from('users')
        .select('section_id')
        .eq('id', existing.student_id)
        .maybeSingle();
      const sections = await getFacultySectionIds(supabase, session.uid);
      if (!student?.section_id || !sections.includes(student.section_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: updated, error } = await supabase
      .from('assistance_requests')
      .update({
        status,
        resolved_by: status === 'resolved' ? session.uid : null,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('id, status, resolved_at')
      .single();

    if (error) {
      console.error('Failed to update assistance request', error);
      return NextResponse.json({ error: 'Unable to update request' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: `assistance_${status}`,
        entityType: 'assistance_request',
        entityId: id,
        details: { status },
      },
      request,
    );

    return NextResponse.json({ request: updated });
  } catch (err) {
    console.error('Update assistance request failed', err);
    return NextResponse.json({ error: 'Unable to update request' }, { status: 500 });
  }
}
