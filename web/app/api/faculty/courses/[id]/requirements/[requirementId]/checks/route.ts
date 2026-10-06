import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, courseFailure, labelRequirements, loadStudentTarget, must, readJson, requireRole } from '@/app/lib/courses';
import { loadItemProgress } from '@/app/lib/course-requirements';

interface RouteParams {
  params: Promise<{ id: string; requirementId: string }>;
}

const MAX_NOTE = 500;

/**
 * POST { student_id, checked, note? }: tick or untick one student on one item.
 *
 * On a manual item this is the tick itself. On an automatic item, checking
 * marks it done for work the system cannot see and needs a note; unchecking
 * removes only that mark, never graded work. The web portal now enters a
 * score instead (/scores, 066) and uses this only for shift counts and to
 * remove earlier ticks and marks; the mobile app still ticks and marks here.
 *
 * Idempotent, so the mobile app can replay it from its offline outbox.
 * Allowed after the term ends: only the item list is locked then.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id, requirementId } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const studentId = body.student_id;
  const checked = body.checked;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (typeof studentId !== 'string' || !studentId) return badRequest('student_id is required');
  if (typeof checked !== 'boolean') return badRequest('checked must be true or false');
  if (note.length > MAX_NOTE) return badRequest(`The note is too long (max ${MAX_NOTE} characters)`);

  try {
    const supabase = getSupabaseAdmin();
    const target = await loadStudentTarget(supabase, session.uid, id, requirementId, studentId);
    if ('response' in target) return target.response;
    const { offering, requirement, student } = target;

    const manual = requirement.kind === 'manual';
    if (checked) {
      if (!manual && !note) {
        return badRequest('Say why it is done: a note is needed to mark an automatic item done');
      }
      must(
        await supabase.from('course_requirement_checks').upsert(
          {
            requirement_id: requirementId,
            student_id: studentId,
            checked_by: session.uid,
            checked_at: new Date().toISOString(),
            note,
          },
          { onConflict: 'requirement_id,student_id' },
        ),
      );
    } else {
      must(
        await supabase
          .from('course_requirement_checks')
          .delete()
          .eq('requirement_id', requirementId)
          .eq('student_id', studentId),
      );
    }

    const [item, [labelled]] = await Promise.all([
      loadItemProgress(supabase, offering, requirement, studentId),
      labelRequirements(supabase, [requirement]),
    ]);

    await logAudit(
      session,
      {
        action: checked ? (manual ? 'course.requirement.check' : 'course.requirement.mark_done') : 'course.requirement.uncheck',
        entityType: 'course_requirements',
        entityId: requirementId,
        details: { course: offering.course.code, student: student.name, label: labelled.label, ...(note ? { note } : {}) },
      },
      request,
    );
    return NextResponse.json({ progress: item });
  } catch (err) {
    return courseFailure(err, 'Unable to save the tick');
  }
}
