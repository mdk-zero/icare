import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  AUTO_SKILLS_ACTION,
  autoPickOfferingSkills,
  courseFailure,
  loadOwnOffering,
  notFound,
  requireRole,
} from '@/app/lib/courses';
import { termStatus } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST → { picked: { skill_ids, source } | null }
 * The system's first pick of the instructor's skills for this assignment,
 * saved for them to add to or trim. Does nothing (picked: null) once they
 * have set the list or the system has picked before.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    // An ended term's checklist is locked, and so is its skill list.
    if (termStatus(offering.term) === 'ended') return NextResponse.json({ picked: null });

    const picked = await autoPickOfferingSkills(supabase, offering, session.uid);
    if (picked) {
      await logAudit(
        session,
        {
          action: AUTO_SKILLS_ACTION,
          entityType: 'course_offerings',
          entityId: id,
          details: { code: offering.course.code, added: picked.skill_ids, source: picked.source },
        },
        request,
      );
    }
    return NextResponse.json({ picked });
  } catch (err) {
    return courseFailure(err, 'Unable to pick the course skills');
  }
}
