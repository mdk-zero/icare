import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { badRequest, must, notFound, readJson } from '@/app/lib/courses';
import { parseCurriculumName, type CurriculumAnalysis } from '@/app/lib/curriculum';
import {
  analysisOf,
  curriculumAccess,
  curriculumFailure,
  loadCurriculumCourses,
  ownCurriculum,
  removeCurriculumFile,
} from '@/app/lib/curriculum-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET: one curriculum with its courses, in curriculum order. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;
  const { id } = await params;

  try {
    const row = await ownCurriculum(supabase, ownerId, id);
    if (!row) return notFound('Curriculum');
    return NextResponse.json({
      curriculum: {
        id: row.id,
        name: row.name,
        is_active: row.is_active,
        source_name: row.source_name,
        has_source: Boolean(row.source_path),
        created_at: row.created_at,
        analysis: analysisOf(row),
      },
      courses: await loadCurriculumCourses(supabase, id),
    });
  } catch (err) {
    return curriculumFailure(err, 'Unable to load the curriculum');
  }
}

/**
 * PATCH with any of: { name } renames it; { is_active } starts or stops using
 * it, and starting takes over from whichever was in use; { dismiss_notes: true }
 * clears the notes from reading the PDF once they have been looked at.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;
  const { id } = await params;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');

  try {
    const row = await ownCurriculum(supabase, ownerId, id);
    if (!row) return notFound('Curriculum');

    const changes: { name?: string; analysis?: CurriculumAnalysis } = {};
    if (body.name !== undefined) {
      const name = parseCurriculumName(body.name);
      if (!name.ok) return badRequest(name.error);
      changes.name = name.value;
    }
    if (body.dismiss_notes === true) changes.analysis = { ...analysisOf(row), notes: [] };
    if (Object.keys(changes).length) must(await supabase.from('curricula').update(changes).eq('id', id));

    if (typeof body.is_active === 'boolean' && body.is_active !== row.is_active) {
      if (body.is_active) {
        const { count, error } = await supabase
          .from('curriculum_courses')
          .select('id', { count: 'exact', head: true })
          .eq('curriculum_id', id);
        if (error) throw error;
        if (!count) return badRequest('Add a course before using this curriculum');
        // At most one is in use (091's index), so the old one has to stop first.
        must(await supabase.from('curricula').update({ is_active: false }).eq('admin_id', ownerId).eq('is_active', true));
      }
      must(await supabase.from('curricula').update({ is_active: body.is_active }).eq('id', id));
      await logAudit(
        session,
        {
          action: body.is_active ? 'curriculum.activate' : 'curriculum.deactivate',
          entityType: 'curricula',
          entityId: id,
          details: { name: changes.name ?? row.name },
        },
        request,
      );
    }
    if (changes.name) {
      await logAudit(
        session,
        { action: 'curriculum.rename', entityType: 'curricula', entityId: id, details: { from: row.name, to: changes.name } },
        request,
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return curriculumFailure(err, 'Unable to update the curriculum');
  }
}

/** Deleting it removes its courses and its PDF. Course assignments and grades live elsewhere and stay. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;
  const { id } = await params;

  try {
    const row = await ownCurriculum(supabase, ownerId, id);
    if (!row) return notFound('Curriculum');

    must(await supabase.from('curricula').delete().eq('id', id));
    await removeCurriculumFile(supabase, row.source_path);

    await logAudit(
      session,
      { action: 'curriculum.delete', entityType: 'curricula', entityId: id, details: { name: row.name, was_in_use: row.is_active } },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return curriculumFailure(err, 'Unable to delete the curriculum');
  }
}
