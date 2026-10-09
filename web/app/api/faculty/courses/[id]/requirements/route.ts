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
  normaliseRequirement,
  notFound,
  readJson,
  refileRequirement,
  requireRole,
  requirementQuery,
} from '@/app/lib/courses';
import { requirementWrite } from '@/app/lib/course-schema';
import { MAX_REQUIREMENTS, parseRequirement, termStatus } from '@/app/lib/course-progress';
import { gradeLeafProblem, parseGradeLeaf, refile } from '@/app/lib/course-grading';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST: add an item to the end of the course's requirements checklist,
 * filed under the grading split's `grade_leaf_id` when one is sent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

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

    // Since 070 a course's items are its activities; there are no hand-made items.
    if ((await loadGrading(supabase, id)).grading?.auto) {
      return NextResponse.json(
        { error: 'Items are added automatically: make a Patient Case, Quiz or Case Presentation for this course.' },
        { status: 409 },
      );
    }
    const existing = await loadRequirements(supabase, [id]);
    if (existing.length >= MAX_REQUIREMENTS) return badRequest(`A checklist can have at most ${MAX_REQUIREMENTS} items`);
    const problem = await checkRequirementLinks(supabase, session.uid, offering, parsed.value);
    if (problem) return badRequest(problem);
    const grading = await loadGrading(supabase, id);
    const leafProblem = typeof leaf.value === 'string' ? gradeLeafProblem(grading.grading, leaf.value) : null;
    if (leafProblem) return badRequest(leafProblem);

    const data = await requirementQuery((columns, legacy) =>
      supabase
        .from('course_requirements')
        .insert({
          ...requirementWrite(parsed.value, legacy),
          offering_id: id,
          position: existing.reduce((max, r) => Math.max(max, r.position + 1), 0),
          created_by: session.uid,
        })
        .select(columns)
        .single(),
    );
    const row = normaliseRequirement(data as unknown as Record<string, unknown>);
    await refileRequirement(supabase, id, grading, (split) => refile(split, row, leaf.value));
    const [requirement] = await labelRequirements(supabase, [row]);

    await logAudit(
      session,
      {
        action: 'course.requirement.create',
        entityType: 'course_requirements',
        entityId: requirement.id,
        details: { course: offering.course.code, term: offering.term.name, label: requirement.label },
      },
      request,
    );
    return NextResponse.json({ requirement }, { status: 201 });
  } catch (err) {
    return courseFailure(err, 'Unable to add the requirement');
  }
}
