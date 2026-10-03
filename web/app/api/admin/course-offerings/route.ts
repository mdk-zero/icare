import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  badRequest,
  checkAssignmentTarget,
  courseFailure,
  loadOfferingRosters,
  must,
  notifyCourseAssigned,
  readJson,
  requireRole,
  stringList,
} from '@/app/lib/courses';

/**
 * POST { course_id, term_id, faculty_id, section_ids }: assign one of the
 * Dean's courses to one of their instructors for some sections in a term.
 * Answers with warnings for sections where the instructor supervises no
 * group, since no students come from those.
 */
export async function POST(request: NextRequest) {
  const { session, response } = await requireRole('admin');
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const { course_id: courseId, term_id: termId } = body;
  if (typeof courseId !== 'string' || !courseId) return badRequest('Choose a course');
  if (typeof termId !== 'string' || !termId) return badRequest('Choose a term');
  const sectionIds = stringList(body.section_ids);

  try {
    const supabase = getSupabaseAdmin();
    const [course, term] = await Promise.all([
      supabase.from('courses').select('id, code, title').eq('id', courseId).eq('admin_id', session.uid).maybeSingle().then(must),
      supabase.from('academic_terms').select('id, name').eq('id', termId).eq('admin_id', session.uid).maybeSingle().then(must),
    ]);
    if (!course) return badRequest('That course is not one of yours');
    if (!term) return badRequest('That term is not one of yours');

    const target = await checkAssignmentTarget(supabase, session.uid, body.faculty_id, sectionIds);
    if (!target.ok) return badRequest(target.error);
    const { faculty, sections } = target.value;

    const { data: offering, error } = await supabase
      .from('course_offerings')
      .insert({ course_id: courseId, term_id: termId, faculty_id: faculty.id, created_by: session.uid })
      .select('id, course_id, term_id, faculty_id')
      .single();
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: `${faculty.name} already teaches ${course.code} in ${term.name}. Edit that assignment's sections instead.` },
        { status: 409 },
      );
    }
    if (error) throw error;

    const linked = await supabase
      .from('course_offering_sections')
      .insert(sections.map((s) => ({ offering_id: offering.id, section_id: s.id })));
    if (linked.error) {
      // No half-made assignment: an offering without sections covers nobody.
      await supabase.from('course_offerings').delete().eq('id', offering.id);
      throw linked.error;
    }

    const roster = (
      await loadOfferingRosters(supabase, [{ id: offering.id, faculty_id: faculty.id, section_ids: sections.map((s) => s.id) }])
    ).get(offering.id);
    const without = new Set(roster?.sectionsWithoutGroup ?? []);

    await notifyCourseAssigned(supabase, faculty.id, offering.id, course, term.name, sections.map((s) => s.name));
    await logAudit(
      session,
      {
        action: 'course.assign',
        entityType: 'course_offerings',
        entityId: offering.id,
        details: { course: course.code, term: term.name, instructor: faculty.name, sections: sections.map((s) => s.name) },
      },
      request,
    );

    return NextResponse.json(
      {
        offering: {
          ...offering,
          faculty_name: faculty.name,
          sections: sections.map((s) => ({ ...s, has_group: !without.has(s.id) })),
          student_count: roster?.students.length ?? 0,
          requirement_count: 0,
        },
        warnings: sections
          .filter((s) => without.has(s.id))
          .map((s) => `${faculty.name} supervises no group in ${s.name}, so no students come from it yet.`),
      },
      { status: 201 },
    );
  } catch (err) {
    return courseFailure(err, 'Unable to assign course');
  }
}
