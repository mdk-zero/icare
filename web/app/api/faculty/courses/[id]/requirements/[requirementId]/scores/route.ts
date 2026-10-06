import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, courseFailure, labelRequirements, loadStudentTarget, must, readJson, requireRole } from '@/app/lib/courses';
import { SCORES_NEED_MIGRATION, isMissingScoresTable, loadItemProgress } from '@/app/lib/course-requirements';
import { MAX_SCORE_NOTE, parseScore, scoreBlock } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string; requirementId: string }>;
}

/**
 * POST { student_id, score, note? }: the score a student earned on work the
 * app has no grade for, such as a return demonstration or a Quiz taken on
 * paper (migration 066). On a Lab Activity, Patient Case, Quiz, Case
 * Presentation or skill item it is the student's one score, replacing an
 * earlier entry; on a count it is one more piece of work. Shift counts take
 * no score: they are marked done on /checks.
 *
 * Allowed after the term ends: only the item list is locked then.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id, requirementId } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const studentId = body.student_id;
  const score = parseScore(body.score);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (typeof studentId !== 'string' || !studentId) return badRequest('student_id is required');
  if (score === null) return badRequest('The score must be a number from 0 to 100');
  if (note.length > MAX_SCORE_NOTE) return badRequest(`The note is too long (max ${MAX_SCORE_NOTE} characters)`);

  try {
    const supabase = getSupabaseAdmin();
    const target = await loadStudentTarget(supabase, session.uid, id, requirementId, studentId);
    if ('response' in target) return target.response;
    const { offering, requirement, student } = target;

    const before = await loadItemProgress(supabase, offering, requirement, studentId);
    const blocked = scoreBlock(requirement, before);
    if (blocked) return badRequest(blocked);

    // One score per student, except on a count, where each is a piece of work.
    const replaced = requirement.kind === 'count' ? [] : before.entries;
    if (replaced.length > 0) {
      must(
        await supabase
          .from('course_requirement_scores')
          .delete()
          .in(
            'id',
            replaced.map((e) => e.id),
          ),
      );
    }
    must(
      await supabase.from('course_requirement_scores').insert({
        requirement_id: requirementId,
        student_id: studentId,
        score,
        note,
        entered_by: session.uid,
        entered_at: new Date().toISOString(),
      }),
    );

    const [item, [labelled]] = await Promise.all([
      loadItemProgress(supabase, offering, requirement, studentId),
      labelRequirements(supabase, [requirement]),
    ]);
    await logAudit(
      session,
      {
        action: 'course.requirement.score',
        entityType: 'course_requirements',
        entityId: requirementId,
        details: {
          course: offering.course.code,
          student: student.name,
          label: labelled.label,
          score,
          ...(replaced.length > 0 ? { replaced: replaced.map((e) => e.score) } : {}),
          ...(note ? { note } : {}),
        },
      },
      request,
    );
    return NextResponse.json({ progress: item });
  } catch (err) {
    if (isMissingScoresTable(err as { code?: string })) {
      return NextResponse.json({ error: SCORES_NEED_MIGRATION }, { status: 503 });
    }
    return courseFailure(err, 'Unable to save the score');
  }
}
