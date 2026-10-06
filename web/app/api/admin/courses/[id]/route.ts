import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, countInstructorEntries, courseFailure, must, notFound, parseCourse, readJson, requireRole } from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** What deleting the course would take with it: its assignments, their checklists, scores and ticks. */
async function courseImpact(supabase: Supabase, courseId: string) {
  const offerings = (must(await supabase.from('course_offerings').select('id').eq('course_id', courseId)) ?? []) as {
    id: string;
  }[];
  const offeringIds = offerings.map((o) => o.id);
  if (offeringIds.length === 0) return { offering_count: 0, requirement_count: 0, check_count: 0 };
  const requirements = (must(
    await supabase.from('course_requirements').select('id').in('offering_id', offeringIds),
  ) ?? []) as { id: string }[];
  const entries = await countInstructorEntries(
    supabase,
    requirements.map((r) => r.id),
  );
  return { offering_count: offeringIds.length, requirement_count: requirements.length, check_count: entries };
}

async function ownCourse(supabase: Supabase, adminId: string, id: string) {
  return must(
    await supabase
      .from('courses')
      .select('id, code, title, description')
      .eq('id', id)
      .eq('admin_id', adminId)
      .maybeSingle(),
  );
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const course = await ownCourse(supabase, session.uid, id);
    if (!course) return notFound('Course');
    return NextResponse.json({ course, ...(await courseImpact(supabase, id)) });
  } catch (err) {
    return courseFailure(err, 'Unable to load course');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseCourse(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const supabase = getSupabaseAdmin();
    const current = await ownCourse(supabase, session.uid, id);
    if (!current) return notFound('Course');

    const { data: course, error } = await supabase
      .from('courses')
      .update(parsed.value)
      .eq('id', id)
      .select('id, code, title, description')
      .single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: `You already have a course with code ${parsed.value.code}` }, { status: 409 });
    }
    if (error) throw error;

    await logAudit(
      session,
      {
        action: 'course.update',
        entityType: 'courses',
        entityId: id,
        details: { from: { code: current.code, title: current.title }, to: { code: course.code, title: course.title } },
      },
      request,
    );
    return NextResponse.json({ course });
  } catch (err) {
    return courseFailure(err, 'Unable to update course');
  }
}

/** Deleting a course removes its assignments, checklists and ticks (cascade); graded work is untouched. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const course = await ownCourse(supabase, session.uid, id);
    if (!course) return notFound('Course');
    const impact = await courseImpact(supabase, id);

    must(await supabase.from('courses').delete().eq('id', id));

    await logAudit(
      session,
      { action: 'course.delete', entityType: 'courses', entityId: id, details: { code: course.code, title: course.title, ...impact } },
      request,
    );
    return NextResponse.json({ success: true, ...impact });
  } catch (err) {
    return courseFailure(err, 'Unable to delete course');
  }
}
