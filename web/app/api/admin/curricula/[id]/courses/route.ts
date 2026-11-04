import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, notFound, readJson } from '@/app/lib/courses';
import { parseCurriculumCourse, requisiteProblem } from '@/app/lib/curriculum';
import {
  curriculumAccess,
  curriculumFailure,
  loadCurriculumCourses,
  ownCurriculum,
  saveCourseRequisites,
} from '@/app/lib/curriculum-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST a course, with its pre-requisites and co-requisites, at the end of its term. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseCurriculumCourse(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const { prerequisite_ids, corequisite_ids, ...fields } = parsed.value;

  try {
    if (!(await ownCurriculum(supabase, ownerId, id))) return notFound('Curriculum');

    const existing = await loadCurriculumCourses(supabase, id);
    const problem = requisiteProblem(existing, null, prerequisite_ids, corequisite_ids);
    if (problem) return badRequest(problem);

    const position = existing.reduce((max, c) => Math.max(max, c.position + 1), 0);
    const { data: course, error } = await supabase
      .from('curriculum_courses')
      .insert({ ...fields, curriculum_id: id, position })
      .select('id')
      .single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: `This curriculum already has a course with code ${fields.code}` }, { status: 409 });
    }
    if (error) throw error;

    await saveCourseRequisites(supabase, course.id, prerequisite_ids, corequisite_ids);

    await logAudit(
      session,
      {
        action: 'curriculum.course_create',
        entityType: 'curriculum_courses',
        entityId: course.id,
        details: { code: fields.code, title: fields.title },
      },
      request,
    );
    return NextResponse.json({ course: { id: course.id } }, { status: 201 });
  } catch (err) {
    return curriculumFailure(err, 'Unable to add the course');
  }
}
