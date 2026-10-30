import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadSkillFocus } from '@/app/lib/skill-focus';

/**
 * GET: the student's skills that need improvement, for the top of the mobile
 * Library — each with the quiz, Patient Case or Return Demonstration results
 * that flag it and the quizzes that cover it (skill-focus.ts has the rules).
 *   { skills: [{ skill_id, title, chapter, area, evidence: [...], quiz_ids }] }
 * The app pairs each skill with its Library materials, and shows only the
 * quizzes its own quiz list holds, so visibility stays decided in one place.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const skills = await loadSkillFocus(getSupabaseAdmin(), session.uid);
    return NextResponse.json({ skills });
  } catch (err) {
    console.error('Skill focus failed', err);
    return NextResponse.json({ error: 'Unable to work out what needs improvement' }, { status: 500 });
  }
}
