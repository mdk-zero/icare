import type { getSupabaseAdmin } from './supabase/server';
import { loadGrading, loadOfferingSections, must, type OwnOffering } from './courses';
import { loadOfferingProgress } from './course-requirements';
import { classAverage } from './course-grading';
import { isIsoDate, termsOverlap } from './course-progress';

type OfferingRow = {
  id: string;
  faculty_id: string;
  courses: OwnOffering['course'];
  academic_terms: OwnOffering['term'];
};

const OFFERING_COLUMNS = 'id, faculty_id, courses(id, code, title, description), academic_terms(id, name, starts_on, ends_on)';

/**
 * "Performance per Course" on the Analytics page. For each course assignment
 * whose term overlaps the range, the class average of the grade so far: the
 * same grades the course's Performance tab works out, so the two never
 * disagree. The grade covers every kind of work the course's grading split
 * counts (Patient Cases, Quizzes, Case Presentations, Return Demonstrations
 * and entered scores).
 *
 * An instructor gets their own course assignments. A Dean gets every
 * assignment of their own courses, each naming its instructor.
 *
 * Params (all optional): section_ids (csv) counts only the students of those
 * sections; from, to (YYYY-MM-DD) keep only the terms that overlap them;
 * offering_id keeps only that course assignment. A course with no students in
 * scope is left out.
 */
export async function loadCoursePerformance(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { uid: string; role: string },
  params: URLSearchParams,
) {
  const dean = session.role === 'admin';
  const sectionIds = (params.get('section_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const wanted = sectionIds.length ? new Set(sectionIds) : null;
  const from = params.get('from');
  const to = params.get('to');
  const range = isIsoDate(from) && isIsoDate(to) ? { starts_on: from, ends_on: to } : null;
  const offeringId = params.get('offering_id');

  let rows: OfferingRow[];
  if (dean) {
    const courseIds = ((must(await supabase.from('courses').select('id').eq('admin_id', session.uid)) ?? []) as { id: string }[]).map(
      (c) => c.id,
    );
    rows = courseIds.length
      ? ((must(
          await supabase
            .from('course_offerings')
            .select(OFFERING_COLUMNS)
            .in('course_id', courseIds)
            .not('faculty_id', 'is', null),
        ) ?? []) as unknown as OfferingRow[])
      : [];
  } else {
    rows = (must(await supabase.from('course_offerings').select(OFFERING_COLUMNS).eq('faculty_id', session.uid)) ??
      []) as unknown as OfferingRow[];
  }
  const inRange = rows.filter(
    (r) => (!offeringId || r.id === offeringId) && (!range || termsOverlap(r.academic_terms, range)),
  );
  const [sections, instructors] = await Promise.all([
    loadOfferingSections(supabase, inRange.map((r) => r.id)),
    dean && inRange.length
      ? supabase.from('users').select('id, name').in('id', [...new Set(inRange.map((r) => r.faculty_id))]).then(must)
      : Promise.resolve([]),
  ]);
  const instructorName = new Map(((instructors ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u.name]));

  const courses = await Promise.all(
    inRange.map(async (r) => {
      const offering: OwnOffering = {
        id: r.id,
        course: r.courses,
        term: r.academic_terms,
        faculty_id: r.faculty_id,
        section_ids: sections.get(r.id) ?? [],
      };
      const [result, grading] = await Promise.all([
        loadOfferingProgress(supabase, offering),
        loadGrading(supabase, r.id),
      ]);
      const ids = result.students.filter((s) => !wanted || wanted.has(s.section_id)).map((s) => s.id);
      return {
        id: r.id,
        course: { code: r.courses.code, title: r.courses.title },
        term: { name: r.academic_terms.name, starts_on: r.academic_terms.starts_on, ends_on: r.academic_terms.ends_on },
        ...(dean ? { instructor: instructorName.get(r.faculty_id) ?? null } : {}),
        students: ids.length,
        ...classAverage(grading.grading, result.requirements, result.progress, ids),
      };
    }),
  );

  return courses
    .filter((c) => c.students > 0)
    .sort(
      (a, b) =>
        b.term.starts_on.localeCompare(a.term.starts_on) ||
        a.course.code.localeCompare(b.course.code, undefined, { numeric: true }),
    );
}
