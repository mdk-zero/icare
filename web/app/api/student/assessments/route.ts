import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get the student's section name (target_sections stores names)
    const { data: studentUser } = await supabase
      .from('users')
      .select('section_id, sections(name)')
      .eq('id', session.uid)
      .single();

    const studentSection: string | null =
      (studentUser?.sections as unknown as { name?: string } | null)?.name ?? null;

    const [{ data: published, error: pubError }, { data: assignments, error: asgError }, { data: allAttempts, error: attError }] =
      await Promise.all([
        supabase
          .from('assessments')
          .select('id, title, description, difficulty, category, time_limit_seconds, target_sections, total_questions, max_attempts, questions(count)')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('assessment_assignments')
          .select('id, assessment_id, status, deadline, required, assigned_at, max_attempts')
          .eq('student_id', session.uid),
        // Expired attempts spend a retry the same way submitted ones do, but
        // they carry no score, so the two are counted separately below.
        supabase
          .from('assessment_attempts')
          .select('assessment_id, score, submitted_at, status')
          .eq('student_id', session.uid)
          .in('status', ['submitted', 'expired'])
          .order('submitted_at', { ascending: false }),
      ]);

    const attempts = (allAttempts ?? []).filter((a) => a.status === 'submitted');

    if (pubError || asgError || attError) {
      console.error('Failed to fetch student assessments', pubError ?? asgError ?? attError);
      return NextResponse.json({ error: 'Unable to fetch assessments' }, { status: 500 });
    }

    // Filter by section: null/empty target_sections = visible to all
    const filteredPublished = (published ?? []).filter((a) => {
      const target = a.target_sections as string[] | null | undefined;
      if (!target || target.length === 0) return true;
      if (!studentSection) return false;
      return target.includes(studentSection);
    });

    const assignmentByAssessment = new Map(
      (assignments ?? []).map((a) => [a.assessment_id, a]),
    );
    // Everything that has run its course, which is what the limit counts.
    const spentByAssessment = new Map<string, number>();
    for (const at of allAttempts ?? []) {
      spentByAssessment.set(at.assessment_id, (spentByAssessment.get(at.assessment_id) ?? 0) + 1);
    }

    const bestByAssessment = new Map<string, { score: number | null; submitted_at: string; attempts: number }>();
    for (const at of attempts ?? []) {
      const cur = bestByAssessment.get(at.assessment_id);
      if (!cur) {
        bestByAssessment.set(at.assessment_id, {
          score: at.score,
          submitted_at: at.submitted_at,
          attempts: 1,
        });
      } else {
        cur.attempts += 1;
        if ((at.score ?? -1) > (cur.score ?? -1)) cur.score = at.score;
      }
    }

    const assessments = filteredPublished.map((a) => {
      const assignment = assignmentByAssessment.get(a.id) ?? null;
      const best = bestByAssessment.get(a.id) ?? null;
      const bankSize = Number(
        (a as unknown as { questions: [{ count: number }] }).questions?.[0]?.count ?? 0,
      );
      // A per-student override beats the assessment default; null at both
      // levels is unlimited.
      const maxAttempts = assignment?.max_attempts ?? a.max_attempts ?? null;
      const spent = spentByAssessment.get(a.id) ?? 0;

      return {
        id: a.id,
        title: a.title,
        description: a.description,
        difficulty: a.difficulty,
        category: a.category,
        time_limit_seconds: a.time_limit_seconds,
        // What this student will actually be asked, not how big the bank is —
        // the surplus is held back for later attempts.
        question_count: a.total_questions ?? bankSize,
        assignment: assignment
          ? {
              id: assignment.id,
              status: assignment.status,
              deadline: assignment.deadline,
              required: assignment.required,
            }
          : null,
        best_score: best?.score ?? null,
        attempt_count: best?.attempts ?? 0,
        last_submitted_at: best?.submitted_at ?? null,
        max_attempts: maxAttempts,
        attempts_used: spent,
        attempts_remaining: maxAttempts === null ? null : Math.max(0, maxAttempts - spent),
      };
    });

    // Assigned quizzes first, then by pending deadline.
    assessments.sort((a, b) => {
      if (!!a.assignment !== !!b.assignment) return a.assignment ? -1 : 1;
      const ad = a.assignment?.deadline ?? '9999';
      const bd = b.assignment?.deadline ?? '9999';
      return ad.localeCompare(bd);
    });

    return NextResponse.json({ assessments });
  } catch (err) {
    console.error('Fetch student assessments failed', err);
    return NextResponse.json({ error: 'Unable to fetch assessments' }, { status: 500 });
  }
}
