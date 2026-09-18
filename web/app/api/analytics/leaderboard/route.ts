import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { resolveSummaryArgs } from '@/app/lib/analytics';

/**
 * Every student in scope, ranked the way the analytics summary's
 * `top_students` is (public.dw_student_leaderboard, migration 038). Takes the
 * summary's section_ids/from/to params and scoping — a faculty member only
 * ever sees their own sections. Reads the warehouse as-is: the summary route
 * is what keeps it fresh, and this page is only reached from there.
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const args = await resolveSummaryArgs(request.nextUrl.searchParams, session, supabase);
    if ('error' in args) {
      return NextResponse.json({ error: 'Unable to fetch leaderboard' }, { status: 500 });
    }

    const { data, error } = await supabase.rpc('dw_student_leaderboard', {
      p_section_ids: args.p_section_ids,
      p_from: args.p_from,
      p_to: args.p_to,
    });

    if (error) {
      console.error('Failed to fetch student leaderboard', error);
      return NextResponse.json({ error: 'Unable to fetch leaderboard' }, { status: 500 });
    }

    return NextResponse.json({ students: data ?? [] });
  } catch (err) {
    console.error('Fetch student leaderboard failed', err);
    return NextResponse.json({ error: 'Unable to fetch leaderboard' }, { status: 500 });
  }
}
