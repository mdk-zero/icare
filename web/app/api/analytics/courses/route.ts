import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { courseFailure } from '@/app/lib/courses';
import { loadCoursePerformance } from '@/app/lib/course-performance';

/** GET: "Performance per Course" on the Analytics page; see loadCoursePerformance. */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'faculty' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const courses = await loadCoursePerformance(getSupabaseAdmin(), session, request.nextUrl.searchParams);
    return NextResponse.json({ courses });
  } catch (err) {
    return courseFailure(err, 'Unable to load course performance');
  }
}
