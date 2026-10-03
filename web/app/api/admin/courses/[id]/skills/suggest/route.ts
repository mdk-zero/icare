import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, must, notFound, requireRole, suggestCourseSkillsResponse } from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST → { suggestions: [{ id, reason }], source: 'ai' | 'keywords' }
 * Detects the Taylor's skills a course covers from its code, title and
 * description, for the Dean to confirm. Runs only when asked: AI quota is
 * scarce.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const course = must(
      await supabase
        .from('courses')
        .select('code, title, description')
        .eq('id', id)
        .eq('admin_id', session.uid)
        .maybeSingle(),
    );
    if (!course) return notFound('Course');
    return await suggestCourseSkillsResponse(supabase, course);
  } catch (err) {
    return courseFailure(err, 'Unable to suggest skills');
  }
}
