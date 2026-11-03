import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent } from '@/app/lib/admin-scope';
import { resolveSummaryArgs } from '@/app/lib/analytics';
import { loadCourseScope } from '@/app/lib/analytics-course';
import { summariseCohort } from '@/app/lib/bkt';
import { analyticsStudentIds, loadSkillMastery } from '@/app/lib/skill-mastery';

/**
 * Bayesian Knowledge Tracing estimates of skill mastery (see skill-mastery.ts).
 * ?student_id=... returns that student's skills. Without it, the skills rolled
 * up for the analytics filter: section_ids, or offering_id for an instructor's
 * course roster. No date range: mastery reads a student's whole quiz record.
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const studentId = params.get('student_id');

  try {
    const supabase = getSupabaseAdmin();

    if (studentId) {
      if (!(await canSeeStudent(supabase, session, studentId))) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
      const byStudent = await loadSkillMastery(supabase, [studentId]);
      return NextResponse.json({ skills: byStudent.get(studentId) ?? [] });
    }

    const args = await resolveSummaryArgs(params, session, supabase);
    if ('error' in args) return NextResponse.json({ error: args.error }, { status: 500 });
    const course = await loadCourseScope(supabase, session, params);
    if (course === 'not_found') return NextResponse.json({ error: 'Course not found' }, { status: 404 });

    const studentIds = await analyticsStudentIds(supabase, args, course);
    const byStudent = await loadSkillMastery(supabase, studentIds);
    return NextResponse.json({ cohort: summariseCohort(byStudent, studentIds.length) });
  } catch (err) {
    console.error('Fetch skill mastery failed', err);
    return NextResponse.json({ error: 'Unable to fetch skill mastery' }, { status: 500 });
  }
}
