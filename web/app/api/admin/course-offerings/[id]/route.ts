import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  badRequest,
  checkAssignmentTarget,
  countInstructorEntries,
  courseFailure,
  loadDeanOffering,
  loadOfferingRosters,
  loadOfferingSections,
  must,
  notFound,
  notifyCourseAssigned,
  readJson,
  requireRole,
  stringList,
} from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** The checklist an assignment carries: what removing it deletes. */
async function offeringImpact(supabase: Supabase, offeringId: string) {
  const requirements = (must(
    await supabase.from('course_requirements').select('id').eq('offering_id', offeringId),
  ) ?? []) as { id: string }[];
  const entries = await countInstructorEntries(
    supabase,
    requirements.map((r) => r.id),
  );
  return { requirement_count: requirements.length, check_count: entries };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadDeanOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course assignment');
    return NextResponse.json({ offering, ...(await offeringImpact(supabase, id)) });
  } catch (err) {
    return courseFailure(err, 'Unable to load course assignment');
  }
}

/**
 * PATCH { faculty_id, section_ids }: hand the assignment to another of the
 * Dean's instructors, or change its sections. The checklist stays with the
 * assignment. The course and term are fixed; to change those, remove the
 * assignment and make a new one.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadDeanOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course assignment');

    const target = await checkAssignmentTarget(supabase, session.uid, body.faculty_id, stringList(body.section_ids));
    if (!target.ok) return badRequest(target.error);
    const { faculty, sections } = target.value;

    const reassigned = faculty.id !== offering.faculty_id;
    if (reassigned) {
      const { error } = await supabase.from('course_offerings').update({ faculty_id: faculty.id }).eq('id', id);
      if (error?.code === '23505') {
        return NextResponse.json(
          { error: `${faculty.name} already teaches ${offering.course.code} in ${offering.term.name}.` },
          { status: 409 },
        );
      }
      if (error) throw error;
    }

    const before = (await loadOfferingSections(supabase, [id])).get(id) ?? [];
    const wanted = new Set(sections.map((s) => s.id));
    const removed = before.filter((s) => !wanted.has(s));
    const added = sections.map((s) => s.id).filter((s) => !before.includes(s));
    if (removed.length) {
      must(await supabase.from('course_offering_sections').delete().eq('offering_id', id).in('section_id', removed));
    }
    if (added.length) {
      must(await supabase.from('course_offering_sections').insert(added.map((section_id) => ({ offering_id: id, section_id }))));
    }

    const roster = (
      await loadOfferingRosters(supabase, [{ id, faculty_id: faculty.id, section_ids: sections.map((s) => s.id) }])
    ).get(id);
    const without = new Set(roster?.sectionsWithoutGroup ?? []);

    if (reassigned) {
      await notifyCourseAssigned(supabase, faculty.id, id, offering.course, offering.term.name, sections.map((s) => s.name));
    }
    await logAudit(
      session,
      {
        action: 'course.assignment.update',
        entityType: 'course_offerings',
        entityId: id,
        details: {
          course: offering.course.code,
          term: offering.term.name,
          instructor: faculty.name,
          reassigned,
          sections: sections.map((s) => s.name),
        },
      },
      request,
    );

    return NextResponse.json({
      offering: {
        id,
        course_id: offering.course_id,
        term_id: offering.term_id,
        faculty_id: faculty.id,
        faculty_name: faculty.name,
        sections: sections.map((s) => ({ ...s, has_group: !without.has(s.id) })),
        student_count: roster?.students.length ?? 0,
      },
      warnings: sections
        .filter((s) => without.has(s.id))
        .map((s) => `${faculty.name} supervises no group in ${s.name}, so no students come from it yet.`),
    });
  } catch (err) {
    return courseFailure(err, 'Unable to update course assignment');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadDeanOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course assignment');
    const impact = await offeringImpact(supabase, id);

    must(await supabase.from('course_offerings').delete().eq('id', id));

    await logAudit(
      session,
      {
        action: 'course.unassign',
        entityType: 'course_offerings',
        entityId: id,
        details: { course: offering.course.code, term: offering.term.name, ...impact },
      },
      request,
    );
    return NextResponse.json({ success: true, ...impact });
  } catch (err) {
    return courseFailure(err, 'Unable to remove course assignment');
  }
}
