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
  notFound,
  readJson,
  requireRole,
} from '@/app/lib/courses';
import { MAX_REQUIREMENTS, parseRequirement, termStatus, type RequirementRow } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const COLUMNS =
  'id, offering_id, position, kind, title, activity_type, scenario_id, assessment_id, presentation_id, target_count, skill_id, min_score, skills_only';

/** POST: add an item to the end of the course's requirements checklist. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseRequirement(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return NextResponse.json({ error: TERM_ENDED_LOCK }, { status: 409 });

    const existing = await loadRequirements(supabase, [id]);
    if (existing.length >= MAX_REQUIREMENTS) return badRequest(`A checklist can have at most ${MAX_REQUIREMENTS} items`);
    const problem = await checkRequirementLinks(supabase, session.uid, offering, parsed.value);
    if (problem) return badRequest(problem);

    const { data, error } = await supabase
      .from('course_requirements')
      .insert({
        ...parsed.value,
        offering_id: id,
        position: existing.reduce((max, r) => Math.max(max, r.position + 1), 0),
        created_by: session.uid,
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    const [requirement] = await labelRequirements(supabase, [data as RequirementRow]);

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
