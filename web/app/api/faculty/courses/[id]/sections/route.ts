import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { termStatus } from '@/app/lib/course-progress';
import {
  badRequest,
  courseFailure,
  instructorSectionChoices,
  loadOfferingRosters,
  loadOwnOffering,
  notFound,
  readJson,
  requireRole,
  setOfferingSections,
  stringList,
} from '@/app/lib/courses';
import { loadCourseCatalog } from '@/app/lib/curriculum-server';
import { addedSectionsProblem, catalogCourse, fitsSection } from '@/app/lib/course-rules';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** The curriculum the course's Dean works to, and which sections it lets this course have. */
async function courseRules(supabase: Supabase, courseId: string, code: string) {
  const course = (await supabase.from('courses').select('admin_id').eq('id', courseId).maybeSingle()).data;
  const deanId = (course?.admin_id as string | null) ?? null;
  const catalog = deanId ? await loadCourseCatalog(supabase, deanId) : null;
  const known = catalog ? catalogCourse(catalog, code) : null;
  return { catalog, year: known?.year ?? null, fits: (name: string) => !known || fitsSection(known, name) };
}

/**
 * GET → { sections: [{ id, name, on_course, groups, fits }], course_year }
 * The sections the instructor can teach this course in (instructorSectionChoices),
 * marking the ones it is in now and their own groups in each. Sections of
 * another year than the course's are left out (course-rules.ts).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    const { fits, year } = await courseRules(supabase, offering.course.id, offering.course.code);
    const sections = await instructorSectionChoices(supabase, offering, fits);
    return NextResponse.json({ sections: sections.map((s) => ({ ...s, fits: fits(s.name) })), course_year: year });
  } catch (err) {
    return courseFailure(err, 'Unable to load the sections');
  }
}

/**
 * PUT { section_ids }: the instructor sets the sections they teach this
 * course in. A Dean may assign a course with no sections, leaving this to the
 * instructor. Students come from these sections as everywhere else: their
 * own groups' members, or the whole section where they supervise no group.
 * Taking a section off keeps its students' work and entered scores.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;
  const body = await readJson(request);
  const sectionIds = stringList(body?.section_ids);
  if (!sectionIds) return badRequest('Invalid sections');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return badRequest('This semester has ended, so its roster is locked');

    const all = await instructorSectionChoices(supabase, offering);
    const { catalog, fits } = await courseRules(supabase, offering.course.id, offering.course.code);
    const added = all.filter((s) => sectionIds.includes(s.id) && !offering.section_ids.includes(s.id));
    const problem = catalog ? addedSectionsProblem(catalog, offering.course.code, added.map((s) => s.name)) : null;
    if (problem) return badRequest(problem);
    const choices = all.filter((s) => s.on_course || fits(s.name));
    const byId = new Map(choices.map((s) => [s.id, s]));
    if (sectionIds.some((s) => !byId.has(s))) return badRequest('One of those sections is not open to you');

    await setOfferingSections(supabase, id, sectionIds);
    const roster = (
      await loadOfferingRosters(supabase, [{ id, faculty_id: offering.faculty_id, section_ids: sectionIds }])
    ).get(id);
    const before = new Set(offering.section_ids);
    const names = (ids: string[]) => ids.map((s) => byId.get(s)?.name ?? s);
    await logAudit(
      session,
      {
        action: 'course.sections.update',
        entityType: 'course_offerings',
        entityId: id,
        details: {
          code: offering.course.code,
          added: names(sectionIds.filter((s) => !before.has(s))),
          removed: names(offering.section_ids.filter((s) => !sectionIds.includes(s))),
        },
      },
      request,
    );
    return NextResponse.json({ success: true, student_count: roster?.students.length ?? 0 });
  } catch (err) {
    return courseFailure(err, 'Unable to save the sections');
  }
}
