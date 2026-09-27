import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingCaseTables } from '@/app/lib/cases';
import { isLateSubmission } from '@/app/lib/case-rubric';

// GET /api/student/cases — the case presentations the student was given.
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('case_submissions')
      .select('id, status, patient_initials, submitted_at, graded_at, score, updated_at, case_presentations!inner(id, title, instructions, deadline)')
      .eq('student_id', session.uid);
    if (error) {
      // Before 056 there is nothing to show, not an error for the student.
      if (isMissingCaseTables(error)) return NextResponse.json({ cases: [] });
      throw error;
    }

    const cases = (data ?? [])
      .map((row) => {
        const p = row.case_presentations as unknown as { id: string; title: string; instructions: string; deadline: string | null };
        return {
          id: row.id,
          status: row.status,
          patient_initials: row.patient_initials,
          submitted_at: row.submitted_at,
          graded_at: row.graded_at,
          score: row.status === 'graded' && row.score !== null ? Number(row.score) : null,
          updated_at: row.updated_at,
          presentation: p,
          late: isLateSubmission(row.submitted_at as string | null, p.deadline),
        };
      })
      // Open work first, soonest deadline first; graded cases sink.
      .sort((a, b) => {
        const done = (s: string) => (s === 'graded' ? 1 : 0);
        if (done(a.status) !== done(b.status)) return done(a.status) - done(b.status);
        const da = a.presentation.deadline ? Date.parse(a.presentation.deadline) : Infinity;
        const db = b.presentation.deadline ? Date.parse(b.presentation.deadline) : Infinity;
        return da - db;
      });

    return NextResponse.json({ cases });
  } catch (err) {
    console.error('Failed to list student cases', err);
    return NextResponse.json({ error: 'Unable to load your cases' }, { status: 500 });
  }
}
