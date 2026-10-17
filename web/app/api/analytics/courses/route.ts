import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, loadGrading, loadOfferingSections, must, requireRole, type OwnOffering } from '@/app/lib/courses';
import { loadOfferingProgress } from '@/app/lib/course-requirements';
import { classAverage } from '@/app/lib/course-grading';
import { isIsoDate, termsOverlap } from '@/app/lib/course-progress';

/**
 * GET: "Performance per Course" on the instructor's Analytics page. For each
 * of their course assignments whose term overlaps the range, the class
 * average of the grade so far: the same grades the course's Performance tab
 * works out, so the two never disagree.
 *
 * Query params (all optional): section_ids (csv) counts only the students of
 * those sections; from, to (YYYY-MM-DD) keep only the terms that overlap
 * them. A course with no students in scope is left out.
 */
export async function GET(request: NextRequest) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const sectionIds = (params.get('section_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const wanted = sectionIds.length ? new Set(sectionIds) : null;
  const from = params.get('from');
  const to = params.get('to');
  const range = isIsoDate(from) && isIsoDate(to) ? { starts_on: from, ends_on: to } : null;

  try {
    const supabase = getSupabaseAdmin();
    const rows = (must(
      await supabase
        .from('course_offerings')
        .select('id, courses(id, code, title, description), academic_terms(id, name, starts_on, ends_on)')
        .eq('faculty_id', session.uid),
    ) ?? []) as unknown as { id: string; courses: OwnOffering['course']; academic_terms: OwnOffering['term'] }[];
    const inRange = rows.filter((r) => !range || termsOverlap(r.academic_terms, range));
    const sections = await loadOfferingSections(supabase, inRange.map((r) => r.id));

    const courses = await Promise.all(
      inRange.map(async (r) => {
        const offering: OwnOffering = {
          id: r.id,
          course: r.courses,
          term: r.academic_terms,
          faculty_id: session.uid,
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
          students: ids.length,
          ...classAverage(grading.grading, result.requirements, result.progress, ids),
        };
      }),
    );

    return NextResponse.json({
      courses: courses
        .filter((c) => c.students > 0)
        .sort(
          (a, b) =>
            b.term.starts_on.localeCompare(a.term.starts_on) ||
            a.course.code.localeCompare(b.course.code, undefined, { numeric: true }),
        ),
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load course performance');
  }
}
