import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { courseFailure, labelRequirements, loadStudentTarget, must, notFound, requireRole } from '@/app/lib/courses';
import { SCORES_NEED_MIGRATION, isMissingScoresTable, loadItemProgress } from '@/app/lib/course-requirements';

interface RouteParams {
  params: Promise<{ id: string; requirementId: string; scoreId: string }>;
}

/** DELETE: remove a score the instructor entered; graded work is never touched. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id, requirementId, scoreId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const row = must(
      await supabase
        .from('course_requirement_scores')
        .select('id, student_id, score')
        .eq('id', scoreId)
        .eq('requirement_id', requirementId)
        .maybeSingle(),
    ) as { id: string; student_id: string; score: number } | null;
    if (!row) return notFound('Score');

    const target = await loadStudentTarget(supabase, session.uid, id, requirementId, row.student_id);
    if ('response' in target) return target.response;
    const { offering, requirement, student } = target;

    must(await supabase.from('course_requirement_scores').delete().eq('id', scoreId));

    const [item, [labelled]] = await Promise.all([
      loadItemProgress(supabase, offering, requirement, row.student_id),
      labelRequirements(supabase, [requirement]),
    ]);
    await logAudit(
      session,
      {
        action: 'course.requirement.score_remove',
        entityType: 'course_requirements',
        entityId: requirementId,
        details: { course: offering.course.code, student: student.name, label: labelled.label, score: Number(row.score) },
      },
      request,
    );
    return NextResponse.json({ progress: item });
  } catch (err) {
    if (isMissingScoresTable(err as { code?: string })) {
      return NextResponse.json({ error: SCORES_NEED_MIGRATION }, { status: 503 });
    }
    return courseFailure(err, 'Unable to remove the score');
  }
}
