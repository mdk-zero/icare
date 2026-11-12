import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadMasteryHistory } from '@/app/lib/skill-mastery';

/** The student's own mastery of each skill over time, one point per day (Profile's Performance History). */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    return NextResponse.json({ skills: await loadMasteryHistory(getSupabaseAdmin(), session.uid) });
  } catch (err) {
    console.error('Fetch mastery history failed', err);
    return NextResponse.json({ error: 'Unable to fetch your mastery history' }, { status: 500 });
  }
}
