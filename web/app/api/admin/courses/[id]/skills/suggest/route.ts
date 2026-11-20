import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { deanFor } from '@/app/lib/dean-scope';
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
    // A Program Chair works in their Dean's space (deanFor).
    const deanId = await deanFor(supabase, session.uid);
    const course = must(
      await supabase
        .from('courses')
        .select('code, title, description')
        .eq('id', id)
        .eq('admin_id', deanId)
        .maybeSingle(),
    );
    if (!course) return notFound('Course');
    return await suggestCourseSkillsResponse(supabase, course);
  } catch (err) {
    return courseFailure(err, 'Unable to suggest skills');
  }
}
