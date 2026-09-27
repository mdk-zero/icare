import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { getStudentSupervisorIds } from '@/app/lib/roster';
import { isMissingCaseTables, CASES_NOT_READY, SUBMISSION_COLUMNS } from '@/app/lib/cases';
import { missingCaseFields } from '@/app/lib/case-rubric';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/student/cases/:id/submit
// Hands the case in for grading. Late is allowed — it is flagged, never blocked.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('case_submissions')
      .select(`${SUBMISSION_COLUMNS}, case_presentations!inner(title, created_by)`)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      if (isMissingCaseTables(error)) return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    if (!data) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    const row = data as unknown as Record<string, unknown> & {
      student_id: string;
      status: string;
      presentation_id: string;
      case_presentations: { title: string; created_by: string | null };
    };
    if (row.student_id !== session.uid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (row.status === 'submitted' || row.status === 'graded') {
      return NextResponse.json({ error: 'This case has already been handed in' }, { status: 409 });
    }
    const missing = missingCaseFields(row);
    if (missing.length > 0) {
      return NextResponse.json({ error: 'Fill in the required fields before handing in', missing }, { status: 400 });
    }

    const submittedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('case_submissions')
      .update({ status: 'submitted', submitted_at: submittedAt })
      .eq('id', id)
      .in('status', ['not_started', 'draft'])
      .select('id, status, submitted_at')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ error: 'This case has already been handed in' }, { status: 409 });

    // The instructor who set it, and the student's group supervisor.
    const recipients = new Set(await getStudentSupervisorIds(supabase, session.uid));
    if (row.case_presentations.created_by) recipients.add(row.case_presentations.created_by);
    if (recipients.size > 0) {
      const { data: student } = await supabase.from('users').select('name').eq('id', session.uid).single();
      const { error: notifyError } = await supabase.from('notifications').insert(
        [...recipients].map((user_id) => ({
          user_id,
          type: 'system',
          title: 'Case presentation handed in',
          body: `${student?.name ?? 'A student'} handed in their case for "${row.case_presentations.title}".`,
          data: { case_submission_id: id, case_presentation_id: row.presentation_id, student_id: session.uid },
        })),
      );
      if (notifyError) console.error('Failed to notify faculty of case submission', notifyError);
    }

    await logAudit(
      session,
      { action: 'case.submit', entityType: 'case_submissions', entityId: id, details: { presentation_id: row.presentation_id } },
      request,
    );

    return NextResponse.json({ ok: true, submission: updated });
  } catch (err) {
    console.error('Failed to submit case', err);
    return NextResponse.json({ error: 'Unable to hand in your case' }, { status: 500 });
  }
}
