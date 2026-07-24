import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudents, buildFacultyAlerts } from '@/app/lib/faculty-dashboard';

/**
 * Students needing attention, derived from assistance requests, at-risk
 * predictions and flagged vitals — see buildFacultyAlerts for why there is no
 * `alerts` table. Scoped to the caller's sections; admins see every student.
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get('status');

  try {
    const supabase = getSupabaseAdmin();
    const students = await getScopedStudents(supabase, session);
    const all = await buildFacultyAlerts(supabase, students);

    const alerts = status && status !== 'all' ? all.filter((a) => a.status === status) : all;

    return NextResponse.json({
      alerts,
      total: all.length,
      pending: all.filter((a) => a.status === 'pending').length,
    });
  } catch (err) {
    console.error('Fetch faculty alerts failed', err);
    return NextResponse.json({ error: 'Unable to fetch alerts' }, { status: 500 });
  }
}
