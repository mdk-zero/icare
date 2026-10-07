import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  TERM_ENDED_LOCK,
  badRequest,
  checkRequirementLinks,
  courseFailure,
  labelRequirements,
  loadGrading,
  loadOwnOffering,
  loadRequirements,
  must,
  normaliseRequirement,
  notFound,
  readJson,
  refileRequirement,
  requireRole,
  requirementQuery,
} from '@/app/lib/courses';
import { requirementWrite } from '@/app/lib/course-schema';
import { parseRequirement, termStatus } from '@/app/lib/course-progress';
import { fileItem, gradeLeafProblem, parseGradeLeaf, refile } from '@/app/lib/course-grading';

interface RouteParams {
  params: Promise<{ id: string; requirementId: string }>;
}

/**
 * PATCH: replace an item's fields (its place in the checklist stays). A
 * `grade_leaf_id` moves it in the grading split (null: not counted); an item
 * that becomes an attendance count is taken out of the split either way.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id, requirementId } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseRequirement(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const leaf = parseGradeLeaf(body.grade_leaf_id);
  if (!leaf.ok) return badRequest(leaf.error);

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return NextResponse.json({ error: TERM_ENDED_LOCK }, { status: 409 });
    const current = (await loadRequirements(supabase, [id])).find((r) => r.id === requirementId);
    if (!current) return notFound('Requirement');

    const problem = await checkRequirementLinks(supabase, session.uid, offering, parsed.value);
    if (problem) return badRequest(problem);
    const grading = await loadGrading(supabase, id);
    const leafProblem = typeof leaf.value === 'string' ? gradeLeafProblem(grading.grading, leaf.value) : null;
    if (leafProblem) return badRequest(leafProblem);

    const data = await requirementQuery((columns, legacy) =>
      supabase
        .from('course_requirements')
        .update(requirementWrite(parsed.value, legacy))
        .eq('id', requirementId)
        .select(columns)
        .single(),
    );
    const row = normaliseRequirement(data as unknown as Record<string, unknown>);
    await refileRequirement(supabase, id, grading, (split) => refile(split, row, leaf.value));
    const [requirement] = await labelRequirements(supabase, [row]);

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

/** DELETE: remove an item, with any ticks on it, and take it out of the grading split. */
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

    // Out of the grading split first: if the delete then fails, the item is
    // merely uncounted, where the other order could leave a stale id behind.
    await refileRequirement(supabase, id, await loadGrading(supabase, id), (split) => fileItem(split, requirementId, null));
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
