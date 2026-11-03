import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadSkillMastery } from '@/app/lib/skill-mastery';

/** The student's own Bayesian Knowledge Tracing estimates, weakest first (mobile Progress screen). */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const byStudent = await loadSkillMastery(getSupabaseAdmin(), [session.uid]);
    return NextResponse.json({ skills: byStudent.get(session.uid) ?? [] });
  } catch (err) {
    console.error('Fetch skill mastery failed', err);
    return NextResponse.json({ error: 'Unable to fetch skill mastery' }, { status: 500 });
  }
}
