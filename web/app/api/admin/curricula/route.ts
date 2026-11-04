import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, must, readJson } from '@/app/lib/courses';
import { parseCurriculumName, roundUnits } from '@/app/lib/curriculum';
import { CURRICULUM_COLUMNS, curriculumAccess, curriculumFailure, type CurriculumRow } from '@/app/lib/curriculum-server';

/**
 * GET: the caller's curricula, the one in use first, with their course counts.
 * POST { name }: a blank curriculum to fill in by hand.
 */
export async function GET() {
  const { supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;

  try {
    const rows = (must(
      await supabase
        .from('curricula')
        .select(CURRICULUM_COLUMNS)
        .eq('admin_id', ownerId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false }),
    ) ?? []) as CurriculumRow[];

    const ids = rows.map((r) => r.id);
    const courses = ids.length
      ? ((must(
          await supabase
            .from('curriculum_courses')
            .select('curriculum_id, lecture_units, lab_units')
            .in('curriculum_id', ids),
        ) ?? []) as { curriculum_id: string; lecture_units: number; lab_units: number }[])
      : [];

    return NextResponse.json({
      curricula: rows.map((r) => {
        const mine = courses.filter((c) => c.curriculum_id === r.id);
        return {
          id: r.id,
          name: r.name,
          is_active: r.is_active,
          source_name: r.source_name,
          has_source: Boolean(r.source_path),
          created_at: r.created_at,
          course_count: mine.length,
          total_units: roundUnits(mine.reduce((n, c) => n + Number(c.lecture_units) + Number(c.lab_units), 0)),
        };
      }),
    });
  } catch (err) {
    return curriculumFailure(err, 'Unable to load the curriculum');
  }
}

export async function POST(request: NextRequest) {
  const { session, supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const name = parseCurriculumName(body.name);
  if (!name.ok) return badRequest(name.error);

  try {
    const { data, error } = await supabase
      .from('curricula')
      .insert({ admin_id: ownerId, name: name.value, created_by: session.uid })
      .select('id, name')
      .single();
    if (error) throw error;

    await logAudit(
      session,
      { action: 'curriculum.create', entityType: 'curricula', entityId: data.id, details: { name: data.name } },
      request,
    );
    return NextResponse.json({ curriculum: { id: data.id, name: data.name } }, { status: 201 });
  } catch (err) {
    return curriculumFailure(err, 'Unable to create the curriculum');
  }
}
