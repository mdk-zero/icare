import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, must, notFound, readJson } from '@/app/lib/courses';
import { parseCurriculumCourse, requisiteProblem } from '@/app/lib/curriculum';
import {
  curriculumAccess,
  curriculumFailure,
  loadCurriculumCourses,
  ownCurriculum,
  saveCourseRequisites,
} from '@/app/lib/curriculum-server';

interface RouteParams {
  params: Promise<{ id: string; courseId: string }>;
}

/** PATCH a course and its requisites. Moved to another term, it goes to the end of that term. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;
  const { id, courseId } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseCurriculumCourse(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const { prerequisite_ids, corequisite_ids, ...fields } = parsed.value;

  try {
    if (!(await ownCurriculum(supabase, ownerId, id))) return notFound('Curriculum');

    const existing = await loadCurriculumCourses(supabase, id);
    const current = existing.find((c) => c.id === courseId);
    if (!current) return notFound('Course');
    const problem = requisiteProblem(existing, courseId, prerequisite_ids, corequisite_ids);
    if (problem) return badRequest(problem);

    const moved = current.year_level !== fields.year_level || current.term !== fields.term;
    const position = moved ? existing.reduce((max, c) => Math.max(max, c.position + 1), 0) : current.position;
    const { error } = await supabase
      .from('curriculum_courses')
      .update({ ...fields, position })
      .eq('id', courseId);
    if (error?.code === '23505') {
      return NextResponse.json({ error: `This curriculum already has a course with code ${fields.code}` }, { status: 409 });
    }
    if (error) throw error;

    await saveCourseRequisites(supabase, courseId, prerequisite_ids, corequisite_ids);

    await logAudit(
      session,
      {
        action: 'curriculum.course_update',
        entityType: 'curriculum_courses',
        entityId: courseId,
        details: {
          from: { code: current.code, title: current.title },
          to: { code: fields.code, title: fields.title },
        },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return curriculumFailure(err, 'Unable to save the course');
  }
}

/** Deleting a course takes it off the requisites of the courses that named it (cascade). */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;
  const { id, courseId } = await params;

  try {
    if (!(await ownCurriculum(supabase, ownerId, id))) return notFound('Curriculum');
    const course = must(
      await supabase
        .from('curriculum_courses')
        .select('id, code, title')
        .eq('id', courseId)
        .eq('curriculum_id', id)
        .maybeSingle(),
    ) as { id: string; code: string; title: string } | null;
    if (!course) return notFound('Course');

    must(await supabase.from('curriculum_courses').delete().eq('id', courseId));

    await logAudit(
      session,
      {
        action: 'curriculum.course_delete',
        entityType: 'curriculum_courses',
        entityId: courseId,
        details: { code: course.code, title: course.title },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return curriculumFailure(err, 'Unable to delete the course');
  }
}
