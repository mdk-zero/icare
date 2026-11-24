import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { quizInDeanScope } from '@/app/lib/assessment-access';
import {
  ESSAY_ANSWER_COLUMNS,
  ESSAYS_NEED_MIGRATION,
  isMissingEssayTable,
  type EssayAnswerRow,
} from '@/app/lib/essay-grading';

/**
 * GET: the essays (097) written on this quiz, by attempt, for the students
 * this instructor handles (everyone for an admin). `?student_id=` narrows it
 * to one student. Each essay comes with its question, what it is worth and the
 * instructor's grading notes (the question's explanation), which the student
 * never sees before it is graded.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const studentId = request.nextUrl.searchParams.get('student_id');

  try {
    const supabase = getSupabaseAdmin();
    if (!(await quizInDeanScope(supabase, session, id))) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }
    const scopedIds = await getScopedStudentIds(supabase, session);
    if (studentId && scopedIds !== null && !scopedIds.includes(studentId)) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    let attemptQuery = supabase
      .from('assessment_attempts')
      .select('id, student_id, submitted_at, score, awaiting_grading, users!student_id(name, email, picture_url, sex)')
      .eq('assessment_id', id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });
    if (studentId) attemptQuery = attemptQuery.eq('student_id', studentId);
    else if (scopedIds !== null) attemptQuery = attemptQuery.in('student_id', scopedIds.length ? scopedIds : ['']);
    const { data: attempts, error: attemptsError } = await attemptQuery;
    if (attemptsError) {
      if (/awaiting_grading/.test(attemptsError.message ?? '')) {
        return NextResponse.json({ attempts: [], enabled: false, error: ESSAYS_NEED_MIGRATION });
      }
      throw attemptsError;
    }

    const attemptIds = (attempts ?? []).map((a) => a.id as string);
    if (attemptIds.length === 0) return NextResponse.json({ attempts: [], enabled: true });

    const { data: essays, error: essaysError } = await supabase
      .from('essay_answers')
      .select(ESSAY_ANSWER_COLUMNS)
      .in('attempt_id', attemptIds);
    if (essaysError) {
      if (isMissingEssayTable(essaysError)) return NextResponse.json({ attempts: [], enabled: false, error: ESSAYS_NEED_MIGRATION });
      throw essaysError;
    }
    const rows = (essays ?? []) as EssayAnswerRow[];
    if (rows.length === 0) return NextResponse.json({ attempts: [], enabled: true });

    const questionIds = [...new Set(rows.map((r) => r.question_id))];
    const { data: questions } = await supabase
      .from('questions')
      .select('id, content, explanation, position')
      .in('id', questionIds);
    const questionById = new Map(
      ((questions ?? []) as { id: string; content: string; explanation: string | null; position: number }[]).map((q) => [q.id, q]),
    );

    const byAttempt = new Map<string, EssayAnswerRow[]>();
    for (const r of rows) byAttempt.set(r.attempt_id, [...(byAttempt.get(r.attempt_id) ?? []), r]);

    const result = (attempts ?? [])
      .filter((a) => byAttempt.has(a.id as string))
      .map((a) => {
        const student = a.users as unknown as { name: string; email: string; picture_url: string | null; sex: 'male' | 'female' | null } | null;
        return {
          attempt_id: a.id as string,
          student_id: a.student_id as string,
          student_name: student?.name ?? 'Student',
          student_email: student?.email ?? '',
          picture_url: student?.picture_url ?? null,
          sex: student?.sex ?? null,
          submitted_at: a.submitted_at as string | null,
          score: a.score === null ? null : Number(a.score),
          awaiting_grading: Boolean(a.awaiting_grading),
          essays: (byAttempt.get(a.id as string) ?? [])
            .map((e) => {
              const q = questionById.get(e.question_id);
              return {
                question_id: e.question_id,
                question: q?.content ?? '',
                guidance: q?.explanation?.trim() || null,
                position: q?.position ?? 0,
                answer_text: e.answer_text,
                max_points: e.max_points,
                points_awarded: e.points_awarded,
                feedback: e.feedback,
                graded_at: e.graded_at,
                // Graded with no instructor's name on it: Claude did, right after the student handed it in.
                // (A blank essay is also graded without a name, at 0, but nothing was written for the AI to read.)
                ai_graded: e.graded_at !== null && e.graded_by === null && e.answer_text.trim().length > 0,
              };
            })
            .sort((x, y) => x.position - y.position),
        };
      });

    return NextResponse.json({ attempts: result, enabled: true });
  } catch (err) {
    console.error('List essays failed', err);
    return NextResponse.json({ error: 'Unable to load the essays' }, { status: 500 });
  }
}
