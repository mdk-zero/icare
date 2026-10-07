import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  badRequest,
  courseFailure,
  loadGrading,
  loadOwnOffering,
  loadRequirements,
  notFound,
  readJson,
  requireRole,
  writeGrading,
} from '@/app/lib/courses';
import { termStatus } from '@/app/lib/course-progress';
import {
  GRADING_CHANGED,
  GRADING_ENDED_LOCK,
  GRADING_NEEDS_MIGRATION,
  baseMatches,
  gradingSummary,
  parseGrading,
} from '@/app/lib/course-grading';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT { parts, base }: replace the course's grading split in one write.
 * `base` is gradingSignature() of the split the instructor started editing
 * from, less items since removed or turned into attendance (baseMatches); if
 * the split has changed otherwise (an item filed from the checklist, another
 * tab), the save is refused rather than undoing that change.
 * `{ parts: [] }` clears the split.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return NextResponse.json({ error: GRADING_ENDED_LOCK }, { status: 409 });

    const stored = await loadGrading(supabase, id);
    if (!stored.ready) return NextResponse.json({ error: GRADING_NEEDS_MIGRATION }, { status: 503 });
    const requirements = await loadRequirements(supabase, [id]);
    if (!baseMatches(body.base, stored.grading, requirements)) {
      return NextResponse.json({ error: GRADING_CHANGED }, { status: 409 });
    }

    const parsed = parseGrading(body, requirements);
    if (!parsed.ok) return badRequest(parsed.error);
    await writeGrading(supabase, id, parsed.value);

    await logAudit(
      session,
      {
        action: 'course.grading.update',
        entityType: 'course_offerings',
        entityId: id,
        details: { course: offering.course.code, term: offering.term.name, split: gradingSummary(parsed.value) },
      },
      request,
    );
    return NextResponse.json({ grading: parsed.value });
  } catch (err) {
    return courseFailure(err, 'Unable to save the grading split');
  }
}
