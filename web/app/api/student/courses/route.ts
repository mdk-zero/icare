import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure } from '@/app/lib/courses';
import { loadStudentCourses } from '@/app/lib/course-requirements';

/**
 * GET: the signed-in student's checklist in each course of a running term
 * (mobile Home), so they can see which requirements they're still missing.
 * Judged the same way as the instructor's Progress tab; notes, entered
 * scores and grades are left out.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const courses = await loadStudentCourses(getSupabaseAdmin(), session.uid);
    return NextResponse.json({ courses });
  } catch (err) {
    return courseFailure(err, 'Unable to load your course requirements');
  }
}
