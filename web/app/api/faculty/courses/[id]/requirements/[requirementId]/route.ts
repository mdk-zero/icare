import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  TERM_ENDED_LOCK,
  badRequest,
  checkRequirementLinks,
  courseFailure,
  labelRequirements,
  loadOwnOffering,
  loadRequirements,
  must,
  notFound,
  readJson,
  requireRole,
} from '@/app/lib/courses';
import { parseRequirement, termStatus, type RequirementRow } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string; requirementId: string }>;
}

const COLUMNS =
  'id, offering_id, position, kind, title, activity_type, scenario_id, assessment_id, presentation_id, target_count, skill_id, min_score, skills_only';

/** PATCH: replace an item's fields (its place in the checklist stays). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id, requirementId } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseRequirement(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return NextResponse.json({ error: TERM_ENDED_LOCK }, { status: 409 });
    const current = (await loadRequirements(supabase, [id])).find((r) => r.id === requirementId);
    if (!current) return notFound('Requirement');

    const problem = await checkRequirementLinks(supabase, session.uid, offering, parsed.value);
    if (problem) return badRequest(problem);

    const data = must(
      await supabase.from('course_requirements').update(parsed.value).eq('id', requirementId).select(COLUMNS).single(),
    );
    const [requirement] = await labelRequirements(supabase, [data as RequirementRow]);

    await logAudit(
      session,
      {
        action: 'course.requirement.update',
        entityType: 'course_requirements',
        entityId: requirementId,
        details: { course: offering.course.code, term: offering.term.name, label: requirement.label },
      },
      request,
    );
    return NextResponse.json({ requirement });
  } catch (err) {
    return courseFailure(err, 'Unable to save the requirement');
  }
}

/** DELETE: remove an item, with any ticks on it. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id, requirementId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return NextResponse.json({ error: TERM_ENDED_LOCK }, { status: 409 });
    const current = (await loadRequirements(supabase, [id])).find((r) => r.id === requirementId);
    if (!current) return notFound('Requirement');
    const [labelled] = await labelRequirements(supabase, [current]);

    must(await supabase.from('course_requirements').delete().eq('id', requirementId));

    await logAudit(
      session,
      {
        action: 'course.requirement.delete',
        entityType: 'course_requirements',
        entityId: requirementId,
        details: { course: offering.course.code, term: offering.term.name, label: labelled.label },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return courseFailure(err, 'Unable to remove the requirement');
  }
}
