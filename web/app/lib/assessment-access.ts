import { NextResponse } from 'next/server';
import type { getSupabaseAdmin } from './supabase/server';
import type { SessionPayload } from './auth/jwt';
import { getAdminScope, ownsFaculty } from './admin-scope';

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
): Promise<NextResponse | null> {
  const assessmentId = await resolveAssessmentId(supabase, target);
  if (!assessmentId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: assessment, error } = await supabase
    .from('assessments')
    .select('created_by')
    .eq('id', assessmentId)
    .maybeSingle();
  if (error) throw error;
  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

  const createdBy = assessment.created_by as string | null;
  if (createdBy === session.uid) return null;
  if (session.role === 'admin') {
    if (!createdBy) return null;
    if (ownsFaculty(await getAdminScope(supabase, session.uid), createdBy)) return null;
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
