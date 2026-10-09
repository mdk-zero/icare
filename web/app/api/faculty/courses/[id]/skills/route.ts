import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { isSkillId } from '@/app/lib/taylor-skills';
import {
  MAX_COURSE_SKILLS,
  OFFERING_SKILLS_ACTION,
  badRequest,
  courseFailure,
  loadOwnOffering,
  notFound,
  readJson,
  replaceOfferingSkills,
  requireRole,
  stringList,
} from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT { skill_ids, ai_skill_ids? }: replace the instructor's own skill list
 * for this assignment. Other instructors teaching the course keep theirs.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  const skillIds = stringList(body?.skill_ids);
  const aiIds = stringList(body?.ai_skill_ids ?? []) ?? [];
  if (!skillIds) return badRequest('skill_ids must be a list of skill ids');
  if (skillIds.length > MAX_COURSE_SKILLS) return badRequest(`A course can have at most ${MAX_COURSE_SKILLS} skills`);
  if (skillIds.some((s) => !isSkillId(s))) return badRequest('Unknown skill');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');

    const { added, removed } = await replaceOfferingSkills(supabase, id, skillIds, aiIds, session.uid);
    if (added.length || removed.length) {
      await logAudit(
        session,
        {
          action: OFFERING_SKILLS_ACTION,
          entityType: 'course_offerings',
          entityId: id,
          details: { code: offering.course.code, added, removed },
        },
        request,
      );
    }
    return NextResponse.json({ skill_ids: skillIds });
  } catch (err) {
    return courseFailure(err, 'Unable to save course skills');
  }
}
