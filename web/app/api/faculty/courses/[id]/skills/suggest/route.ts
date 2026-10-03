import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, loadOwnOffering, notFound, requireRole, suggestCourseSkillsResponse } from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST → { suggestions: [{ id, reason }], source: 'ai' | 'keywords' }
 * Detects the skills this assignment's course covers, for the instructor to
 * confirm. Runs only when asked: AI quota is scarce.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    return await suggestCourseSkillsResponse(supabase, offering.course);
  } catch (err) {
    return courseFailure(err, 'Unable to suggest skills');
  }
}
