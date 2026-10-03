import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  badRequest,
  courseFailure,
  labelRequirements,
  loadCourseSkillIds,
  loadOfferingRosters,
  loadOwnOffering,
  loadRequirements,
  must,
  notFound,
  readJson,
  requireRole,
} from '@/app/lib/courses';
import { loadProgressFacts } from '@/app/lib/course-requirements';
import { evaluate } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string; requirementId: string }>;
}

const MAX_NOTE = 500;

/**
 * POST { student_id, checked, note? }: tick or untick one student on one item.
 *
 * On a manual item this is the tick itself. On an automatic item, checking
 * marks it done for work the system cannot see (a quiz taken on paper) and
 * needs a note; unchecking removes only that mark, never graded work.
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
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    const requirement = (await loadRequirements(supabase, [id])).find((r) => r.id === requirementId);
    if (!requirement) return notFound('Requirement');

    const roster = (
      await loadOfferingRosters(supabase, [{ id, faculty_id: offering.faculty_id, section_ids: offering.section_ids }])
    ).get(id);
    const student = roster?.students.find((s) => s.id === studentId);
    if (!student) return notFound('Student');

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

    // The item as it now stands for this student, graded work included.
    const [facts, skills, [labelled]] = await Promise.all([
      loadProgressFacts(supabase, [requirement], offering.term, [studentId]),
      loadCourseSkillIds(supabase, [offering.course.id]),
      labelRequirements(supabase, [requirement]),
    ]);
    const item = evaluate([requirement], skills.get(offering.course.id) ?? [], offering.term, [studentId], facts)[studentId][
      requirementId
    ];

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
