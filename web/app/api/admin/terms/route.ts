import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, courseFailure, parseTerm, readJson, requireRole } from '@/app/lib/courses';

/** POST { name, starts_on, ends_on }: add an academic term. The list itself comes with GET /api/admin/courses. */
export async function POST(request: NextRequest) {
  const { session, response } = await requireRole('admin');
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseTerm(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const supabase = getSupabaseAdmin();
    const { data: term, error } = await supabase
      .from('academic_terms')
      .insert({ ...parsed.value, admin_id: session.uid })
      .select('id, name, starts_on, ends_on')
      .single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: `You already have a term named "${parsed.value.name}"` }, { status: 409 });
    }
    if (error) throw error;

    await logAudit(
      session,
      { action: 'term.create', entityType: 'academic_terms', entityId: term.id, details: { ...parsed.value } },
      request,
    );
    return NextResponse.json({ term: { ...term, offering_count: 0 } }, { status: 201 });
  } catch (err) {
    return courseFailure(err, 'Unable to create term');
  }
}
