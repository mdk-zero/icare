import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadSkillFocus } from '@/app/lib/skill-focus';
import { loadSkillMastery } from '@/app/lib/skill-mastery';
import { loadStudyProfile } from '@/app/lib/study-profile';

/**
 * GET: the student's skills that need improvement, for the top of the mobile
 * Library — each with the quiz, Patient Case or Return Demonstration results
 * that flag it and the quizzes that cover it (skill-focus.ts has the rules).
 *   { skills: [{ skill_id, title, chapter, area, evidence: [...], quiz_ids, mastery }], overall, at_risk }
 * `overall` is the student's whole standing (study-profile.ts): BKT mastery
 * across every skill, and each chapter's. `at_risk` is whether their latest
 * at-risk prediction flags them, so the Library can give them more to study.
 * The app pairs each skill with its Library materials, and shows only the
 * quizzes its own quiz list holds, so visibility stays decided in one place.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();
    const mastery = (await loadSkillMastery(supabase, [session.uid])).get(session.uid) ?? [];
    const [skills, overall, latest] = await Promise.all([
      loadSkillFocus(supabase, session.uid, mastery),
      loadStudyProfile(supabase, mastery),
      supabase
        .from('performance_predictions')
        .select('risk')
        .eq('student_id', session.uid)
        .order('predicted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    // No prediction yet (or the table unreadable) reads as not at risk.
    const atRisk = (latest.data as { risk?: string } | null)?.risk === 'at_risk';
    return NextResponse.json({ skills, overall, at_risk: atRisk });
  } catch (err) {
    console.error('Skill focus failed', err);
    return NextResponse.json({ error: 'Unable to work out what needs improvement' }, { status: 500 });
  }
}
