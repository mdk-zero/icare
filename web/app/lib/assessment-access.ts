import { NextResponse } from 'next/server';
import type { getSupabaseAdmin } from './supabase/server';
import type { SessionPayload } from './auth/jwt';
import { getAdminScope, ownsFaculty } from './admin-scope';
import { ownsRow, viewerDeanId } from './dean-scope';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** What is being changed: the assessment itself, or one of its questions or criteria. */
export type AssessmentTarget =
  | { assessmentId: string }
  | { questionId: string }
  | { criterionId: string };

/**
 * Who may change an assessment, its questions and its criteria: the faculty
 * member who created it, or an admin who owns that faculty member (migration
 * 053). Assessments with no recorded creator (seeded ones) are the admins'.
 * Viewing and assigning stay open to all faculty, as scenarios' are.
 *
 * Returns the 404/403 to send, or null when the change may go ahead.
 */
export async function guardAssessmentEdit(
  supabase: Supabase,
  session: SessionPayload,
  target: AssessmentTarget,
  /**
   * Its content (questions, criteria, details) is being changed. Once any
   * student has the quiz, what they were given stays what they are graded
   * on, so that is refused; hiding, assigning and deleting stay open.
   */
  { content = true }: { content?: boolean } = {},
): Promise<NextResponse | null> {
  const assessmentId = await resolveAssessmentId(supabase, target);
  if (!assessmentId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Another Dean's quiz (077) is not found at all.
  if (!(await quizInDeanScope(supabase, session, assessmentId))) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
  }

  const { data: assessment, error } = await supabase
    .from('assessments')
    .select('created_by')
    .eq('id', assessmentId)
    .maybeSingle();
  if (error) throw error;
  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

  const createdBy = assessment.created_by as string | null;
  const owner =
    createdBy === session.uid ||
    (session.role === 'admin' && (!createdBy || ownsFaculty(await getAdminScope(supabase, session.uid), createdBy)));
  if (owner) {
    if (!content) return null;
    const { count } = await supabase
      .from('assessment_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);
    if ((count ?? 0) === 0) return null;
    return NextResponse.json(
      {
        error: `This quiz is already assigned to ${count} student${count === 1 ? '' : 's'}, so it can't be edited. Make a new quiz to change it.`,
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: 'Only the instructor who created this assessment can change it.' },
    { status: 403 },
  );
}

async function resolveAssessmentId(supabase: Supabase, target: AssessmentTarget): Promise<string | null> {
  if ('assessmentId' in target) return target.assessmentId;
  const [table, id] =
    'questionId' in target
      ? (['questions', target.questionId] as const)
      : (['assessment_criteria', target.criterionId] as const);
  const { data, error } = await supabase.from(table).select('assessment_id').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data?.assessment_id as string | undefined) ?? null;
}

/**
 * Whether a quiz belongs to the viewer's Dean (077): their own, or their
 * instructors'. A student's Dean is the one they belong to. Always true
 * before 077 and for a super admin.
 */
export async function quizInDeanScope(
  supabase: Supabase,
  session: { uid: string; role: string },
  assessmentId: string,
): Promise<boolean> {
  return ownsRow(supabase, 'assessments', assessmentId, await viewerDeanId(supabase, session));
}
