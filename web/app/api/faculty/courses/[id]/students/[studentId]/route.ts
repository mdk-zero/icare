import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { termStatus } from '@/app/lib/course-progress';
import { badRequest, courseFailure, loadOwnOffering, notFound, requireRole, setAddedStudent } from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string; studentId: string }>;
}

/**
 * DELETE: take a student the instructor added by hand off this course's
 * roster. Students who are on it through their section or group stay; their
 * work is never deleted.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id, studentId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return badRequest('This semester has ended, so its roster is locked');

    await setAddedStudent(supabase, id, studentId, false, session.uid);
    await logAudit(
      session,
      {
        action: 'course.student.remove',
        entityType: 'course_offerings',
        entityId: id,
        details: { code: offering.course.code, student_id: studentId },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return courseFailure(err, 'Unable to remove the student');
  }
}
