import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, loadOfferingRosters, loadOfferingSections, loadRequirements, must, requireRole } from '@/app/lib/courses';
import { loadOfferingProgress } from '@/app/lib/course-requirements';
import { offeringSummary, termStatus, type OfferingSummary } from '@/app/lib/course-progress';

/**
 * GET: the signed-in instructor's course assignments, newest term first,
 * each with its sections, students and checklist size, and for a running
 * term how far the roster has got and the Lab Activity scores still to enter.
 */
export async function GET() {
  const { session, response } = await requireRole('faculty');
  if (response) return response;

  try {
    const supabase = getSupabaseAdmin();
    const rows = (must(
      await supabase
        .from('course_offerings')
        .select('id, faculty_id, courses(id, code, title), academic_terms(id, name, starts_on, ends_on)')
        .eq('faculty_id', session.uid),
    ) ?? []) as unknown as {
      id: string;
      faculty_id: string;
      courses: { id: string; code: string; title: string };
      academic_terms: { id: string; name: string; starts_on: string; ends_on: string };
    }[];
    const ids = rows.map((r) => r.id);

    const [sectionsByOffering, requirementRows] = await Promise.all([
      loadOfferingSections(supabase, ids),
      loadRequirements(supabase, ids),
    ]);
    const sectionIds = [...new Set([...sectionsByOffering.values()].flat())];
    const [sectionRows, rosters] = await Promise.all([
      sectionIds.length
        ? supabase.from('sections').select('id, name').in('id', sectionIds).then(must)
        : Promise.resolve([] as { id: string; name: string }[]),
      loadOfferingRosters(
        supabase,
        rows.map((r) => ({ id: r.id, faculty_id: r.faculty_id, section_ids: sectionsByOffering.get(r.id) ?? [] })),
      ),
    ]);
    const sectionName = new Map((sectionRows ?? []).map((s) => [s.id as string, s.name as string]));
    const requirementCount = new Map<string, number>();
    for (const r of (requirementRows ?? []) as { offering_id: string }[]) {
      requirementCount.set(r.offering_id, (requirementCount.get(r.offering_id) ?? 0) + 1);
    }

    const offerings = rows
      .map((r) => {
        const roster = rosters.get(r.id);
        const without = new Set(roster?.sectionsWithoutGroup ?? []);
        return {
          id: r.id,
          course: r.courses,
          term: r.academic_terms,
          sections: (sectionsByOffering.get(r.id) ?? [])
            .map((id) => ({ id, name: sectionName.get(id) ?? 'Section', has_group: !without.has(id) }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
          student_count: roster?.students.length ?? 0,
          requirement_count: requirementCount.get(r.id) ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.term.starts_on.localeCompare(a.term.starts_on) ||
          a.course.code.localeCompare(b.course.code, undefined, { numeric: true }),
      );

    // Only for running terms, since it reads the term's graded work for the
    // whole roster.
    const summaries = new Map<string, OfferingSummary>();
    await Promise.all(
      offerings
        .filter((o) => o.requirement_count > 0 && o.student_count > 0 && termStatus(o.term) === 'current')
        .map(async (o) => {
          const result = await loadOfferingProgress(supabase, {
            id: o.id,
            course: { ...o.course, description: '' },
            term: o.term,
            faculty_id: session.uid,
            section_ids: o.sections.map((s) => s.id),
          });
          summaries.set(o.id, offeringSummary(result.requirements, result.students, result.progress));
        }),
    );

    return NextResponse.json({
      offerings: offerings.map((o) => ({ ...o, progress: summaries.get(o.id) ?? null })),
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load your courses');
  }
}
