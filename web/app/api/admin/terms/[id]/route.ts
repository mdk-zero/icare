import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, courseFailure, must, notFound, parseTerm, readJson, requireRole } from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** The term's course assignments and their checklist items: what a delete removes, and what a date change re-judges. */
async function termImpact(supabase: Supabase, termId: string) {
  const offerings = (must(await supabase.from('course_offerings').select('id').eq('term_id', termId)) ?? []) as {
    id: string;
  }[];
  if (offerings.length === 0) return { offering_count: 0, requirement_count: 0 };
  const { count } = await supabase
    .from('course_requirements')
    .select('id', { count: 'exact', head: true })
    .in('offering_id', offerings.map((o) => o.id));
  return { offering_count: offerings.length, requirement_count: count ?? 0 };
}

async function ownTerm(supabase: Supabase, adminId: string, id: string) {
  return must(
    await supabase
      .from('academic_terms')
      .select('id, name, starts_on, ends_on')
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
    const term = await ownTerm(supabase, session.uid, id);
    if (!term) return notFound('Term');
    return NextResponse.json({ term, ...(await termImpact(supabase, id)) });
  } catch (err) {
    return courseFailure(err, 'Unable to load term');
  }
}

/** Changing the dates re-judges every checklist in the term straight away: progress is computed on read. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseTerm(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const supabase = getSupabaseAdmin();
    const current = await ownTerm(supabase, session.uid, id);
    if (!current) return notFound('Term');

    const { data: term, error } = await supabase
      .from('academic_terms')
      .update(parsed.value)
      .eq('id', id)
      .select('id, name, starts_on, ends_on')
      .single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: `You already have a term named "${parsed.value.name}"` }, { status: 409 });
    }
    if (error) throw error;

    await logAudit(
      session,
      {
        action: 'term.update',
        entityType: 'academic_terms',
        entityId: id,
        details: { from: { name: current.name, starts_on: current.starts_on, ends_on: current.ends_on }, to: parsed.value },
      },
      request,
    );
    return NextResponse.json({ term });
  } catch (err) {
    return courseFailure(err, 'Unable to update term');
  }
}

/** Deleting a term removes its course assignments, checklists and ticks (cascade); graded work is untouched. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const term = await ownTerm(supabase, session.uid, id);
    if (!term) return notFound('Term');
    const impact = await termImpact(supabase, id);

    must(await supabase.from('academic_terms').delete().eq('id', id));

    await logAudit(
      session,
      { action: 'term.delete', entityType: 'academic_terms', entityId: id, details: { name: term.name, ...impact } },
      request,
    );
    return NextResponse.json({ success: true, ...impact });
  } catch (err) {
    return courseFailure(err, 'Unable to delete term');
  }
}
