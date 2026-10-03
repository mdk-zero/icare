import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure, loadOwnOffering, must, notFound, requireRole } from '@/app/lib/courses';
import { loadOfferingProgress } from '@/app/lib/course-requirements';
import { termStatus } from '@/app/lib/course-progress';
import { isStudentInFacultySections } from '@/app/lib/roster';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: one student's requirements in each of the instructor's courses that
 * cover them, current term first.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id: studentId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    if (!(await isStudentInFacultySections(supabase, session.uid, studentId))) return notFound('Student');

    const { data: member } = await supabase
      .from('team_members')
      .select('teams!inner(section_id)')
      .eq('student_id', studentId)
      .maybeSingle();
    const sectionId = (member?.teams as unknown as { section_id: string } | null)?.section_id ?? null;
    if (!sectionId) return NextResponse.json({ courses: [] });

    const offeringIds = (
      (must(
        await supabase
          .from('course_offerings')
          .select('id, course_offering_sections!inner(section_id)')
          .eq('faculty_id', session.uid)
          .eq('course_offering_sections.section_id', sectionId),
      ) ?? []) as { id: string }[]
    ).map((o) => o.id);

    const courses = [];
    for (const offeringId of offeringIds) {
      const offering = await loadOwnOffering(supabase, session.uid, offeringId);
      if (!offering) continue;
      const result = await loadOfferingProgress(supabase, offering, studentId);
      const student = result.students.find((s) => s.id === studentId);
      if (!student) continue;
      courses.push({
        offering: {
          id: offering.id,
          course: { id: offering.course.id, code: offering.course.code, title: offering.course.title },
          term: offering.term,
          status: termStatus(offering.term),
        },
        requirements: result.requirements,
        progress: result.progress[studentId] ?? {},
        done: student.done,
        total: student.total,
      });
    }
    const order = { current: 0, upcoming: 1, ended: 2 } as const;
    courses.sort(
      (a, b) =>
        order[a.offering.status] - order[b.offering.status] ||
        b.offering.term.starts_on.localeCompare(a.offering.term.starts_on) ||
        a.offering.course.code.localeCompare(b.offering.course.code, undefined, { numeric: true }),
    );
    return NextResponse.json({ courses });
  } catch (err) {
    return courseFailure(err, "Unable to load the student's requirements");
  }
}
