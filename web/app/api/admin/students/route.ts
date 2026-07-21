import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * Cohort roster with per-student performance aggregates for the admin
 * Student Management page: submitted-attempt counts and averages plus the
 * latest ML risk flag.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [studentsRes, attemptsRes, predictionsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, name, picture_url, created_at, last_login_at, section_id, sections(name)')
        .eq('role', 'student')
        .order('name'),
      supabase
        .from('assessment_attempts')
        .select('student_id, score')
        .eq('status', 'submitted'),
      supabase
        .from('performance_predictions')
        .select('student_id, risk, predicted_at')
        .order('predicted_at', { ascending: false }),
    ]);

    if (studentsRes.error) {
      console.error('Failed to list students', studentsRes.error);
      return NextResponse.json({ error: 'Unable to list students' }, { status: 500 });
    }

    const totals = new Map<string, { count: number; sum: number }>();
    for (const a of attemptsRes.data ?? []) {
      const t = totals.get(a.student_id) ?? { count: 0, sum: 0 };
      t.count += 1;
      t.sum += a.score ?? 0;
      totals.set(a.student_id, t);
    }

    // Predictions are ordered newest-first; keep only the latest per student.
    const latestRisk = new Map<string, string>();
    for (const p of predictionsRes.data ?? []) {
      if (!latestRisk.has(p.student_id)) latestRisk.set(p.student_id, p.risk);
    }

    const students = (studentsRes.data ?? []).map((s) => {
      const t = totals.get(s.id);
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        picture_url: s.picture_url,
        created_at: s.created_at,
        last_login_at: s.last_login_at,
        quizzes_completed: t?.count ?? 0,
        average_score: t && t.count > 0 ? Math.round(t.sum / t.count) : null,
        at_risk: latestRisk.get(s.id) === 'at_risk',
        section_id: s.section_id ?? null,
        section: (s as unknown as { sections: { name: string } | null }).sections?.name ?? null,
      };
    });

    return NextResponse.json({ students });
  } catch (err) {
    console.error('List students failed', err);
    return NextResponse.json({ error: 'Unable to list students' }, { status: 500 });
  }
}
