import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { deanFor } from '@/app/lib/dean-scope';
import { logAudit } from '@/app/lib/audit';
import { badRequest, courseFailure, must, parseTerm, readJson, requireRole } from '@/app/lib/courses';
import { sameSemesterTerm, termNameProblem } from '@/app/lib/course-rules';

/**
 * POST { name, starts_on, ends_on }: add an academic term. The list itself comes with GET /api/admin/courses.
 * The name must say the semester and academic year, and a Dean has one term for each (course-rules.ts).
 */
export async function POST(request: NextRequest) {
  const { session, response } = await requireRole('admin');
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseTerm(body);
  if (!parsed.ok) return badRequest(parsed.error);
  const nameProblem = termNameProblem(parsed.value.name);
  if (nameProblem) return badRequest(nameProblem);

  try {
    const supabase = getSupabaseAdmin();
    // A Program Chair works in their Dean's space (deanFor).
    const deanId = await deanFor(supabase, session.uid);
    const own = (must(await supabase.from('academic_terms').select('id, name').eq('admin_id', deanId)) ?? []) as {
      id: string;
      name: string;
    }[];
    const twin = sameSemesterTerm(own, parsed.value.name);
    if (twin) {
      return NextResponse.json({ error: `You already have this semester, as "${twin.name}". Use that one.` }, { status: 409 });
    }
    const { data: term, error } = await supabase
      .from('academic_terms')
      .insert({ ...parsed.value, admin_id: deanId })
      .select('id, name, starts_on, ends_on')
      .single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: `You already have a semester named "${parsed.value.name}"` }, { status: 409 });
    }
    if (error) throw error;

    await logAudit(
      session,
      { action: 'term.create', entityType: 'academic_terms', entityId: term.id, details: { ...parsed.value } },
      request,
    );
    return NextResponse.json({ term: { ...term, offering_count: 0 } }, { status: 201 });
  } catch (err) {
    return courseFailure(err, 'Unable to create semester');
  }
}
