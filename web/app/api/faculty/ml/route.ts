import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { callMlService, isMlAction } from '@/app/lib/ml';
import { getFacultyStudentIds } from '@/app/lib/roster';

/**
 * On-demand ML runs for a faculty member's own sections.
 *
 * The same jobs as /api/admin/ml, scoped rather than cohort-wide. That
 * matters for `predict`: it notifies a student's roster faculty whenever
 * someone newly flags at-risk, so an unscoped run by one faculty member
 * would generate notifications about students they don't teach.
 *
 * The roster is resolved server-side from the session, never from the
 * request, so this cannot be pointed at another faculty member's students.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'faculty') {
    // Admins have their own cohort-wide route; sending them here would
    // silently narrow the run to sections they probably don't have.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;
  if (!isMlAction(action)) {
    return NextResponse.json({ error: 'action must be "predict" or "recommend"' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const studentIds = await getFacultyStudentIds(supabase, session.uid);

    // Must short-circuit rather than call with an empty list: the service
    // treats `[]` as "no filter" and would score the whole cohort.
    if (studentIds.length === 0) {
      return NextResponse.json(
        {
          error:
            'No students in your sections yet — assign students to a section before running ML jobs.',
        },
        { status: 400 },
      );
    }

    const outcome = await callMlService(action, studentIds);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    await logAudit(
      session,
      {
        action: action === 'predict' ? 'ml.predict_run' : 'ml.recommend_run',
        entityType: 'ml_service',
        details: { ...outcome.result, scope: 'faculty_sections', students: studentIds.length },
      },
      request,
    );

    return NextResponse.json({ result: outcome.result, students: studentIds.length });
  } catch (err) {
    console.error('Faculty ML run failed', err);
    return NextResponse.json({ error: 'ML run failed' }, { status: 500 });
  }
}
