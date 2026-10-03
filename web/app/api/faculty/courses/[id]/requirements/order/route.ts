import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  TERM_ENDED_LOCK,
  badRequest,
  courseFailure,
  loadOwnOffering,
  loadRequirements,
  must,
  notFound,
  readJson,
  requireRole,
  stringList,
} from '@/app/lib/courses';
import { termStatus } from '@/app/lib/course-progress';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PUT { ids }: put the checklist in this order. Every item must be listed once. */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;

  const ids = stringList((await readJson(request))?.ids);
  if (!ids) return badRequest('ids must be the list of requirement ids');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return NextResponse.json({ error: TERM_ENDED_LOCK }, { status: 409 });

    const current = await loadRequirements(supabase, [id]);
    const known = new Set(current.map((r) => r.id));
    if (ids.length !== current.length || ids.some((r) => !known.has(r))) {
      return badRequest('The checklist changed; reload and try again');
    }
    const moved = ids.filter((reqId, position) => current.find((r) => r.id === reqId)?.position !== position);
    await Promise.all(
      moved.map(async (reqId) =>
        must(await supabase.from('course_requirements').update({ position: ids.indexOf(reqId) }).eq('id', reqId)),
      ),
    );
    return NextResponse.json({ ids });
  } catch (err) {
    return courseFailure(err, 'Unable to reorder the checklist');
  }
}
