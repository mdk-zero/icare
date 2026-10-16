import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, loadOfferingRosters, loadOwnOffering, must, notFound, requireRole } from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET → { students: [{ id, name, email, picture_url, section, group, source }] }
 * The course's roster as the instructor handles it, by section then group:
 * who a patient case or quiz for this course can be assigned to.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');

    const rosters = await loadOfferingRosters(supabase, [
      { id, faculty_id: offering.faculty_id, section_ids: offering.section_ids },
    ]);
    const roster = rosters.get(id)?.students ?? [];
    const emails = roster.length
      ? ((must(await supabase.from('users').select('id, email').in('id', roster.map((s) => s.id))) ?? []) as {
          id: string;
          email: string;
        }[])
      : [];
    const emailOf = new Map(emails.map((u) => [u.id, u.email]));

    return NextResponse.json({
      students: roster.map((s) => {
        // "BSN 1101 · Group A": the section, then the group.
        const [section, ...group] = s.group_label.split(' · ');
        return {
          id: s.id,
          name: s.name,
          email: emailOf.get(s.id) ?? '',
          picture_url: s.picture_url,
          section,
          group: group.join(' · ') || 'No group',
          source: s.source,
        };
      }),
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load the course roster');
  }
}
