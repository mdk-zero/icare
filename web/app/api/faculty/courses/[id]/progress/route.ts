import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, loadOwnOffering, notFound, requireRole } from '@/app/lib/courses';
import { loadOfferingProgress } from '@/app/lib/course-requirements';
import { termStatus } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: every student on the course's roster against every checklist item.
 * Automatic items are judged from graded work inside the term on each read;
 * manual ticks and the instructor's mark-dones come from
 * course_requirement_checks.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    const result = await loadOfferingProgress(supabase, offering);
    return NextResponse.json({
      offering: {
        id,
        course: { id: offering.course.id, code: offering.course.code, title: offering.course.title },
        term: offering.term,
        status: termStatus(offering.term),
      },
      requirements: result.requirements,
      students: result.students,
      progress: result.progress,
      totals: result.totals,
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load progress');
  }
}
