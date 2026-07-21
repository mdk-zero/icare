import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_NAME_LENGTH = 50;

/**
 * What a section is wired into, so the admin can see the blast radius before
 * renaming or deleting it.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: section } = await supabase
      .from('sections')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    const [studentsRes, facultyRes, assessmentsRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('section_id', id),
      supabase.from('faculty_sections').select('users:faculty_id(id, name)').eq('section_id', id),
      supabase
        .from('assessments')
        .select('id', { count: 'exact', head: true })
        .contains('target_sections', [section.name]),
    ]);

    const faculty = (facultyRes.data ?? [])
      .map((row) => (row as unknown as { users: { id: string; name: string } | null }).users)
      .filter((f): f is { id: string; name: string } => Boolean(f));

    return NextResponse.json({
      section,
      student_count: studentsRes.count ?? 0,
      faculty,
      assessment_count: assessmentsRes.count ?? 0,
    });
  } catch (err) {
    console.error('Section impact lookup failed', err);
    return NextResponse.json({ error: 'Unable to load section' }, { status: 500 });
  }
}

/**
 * Rename a section. Students and faculty follow by id, but
 * `assessments.target_sections` stores section *names* — so the rename has to
 * be mirrored there or every assessment aimed at this section quietly stops
 * reaching it.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name } = body as { name?: unknown };
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Section name is required' }, { status: 400 });
  }
  const trimmedName = name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Section name is too long (max ${MAX_NAME_LENGTH} characters)` },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: current } = await supabase
      .from('sections')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    if (current.name === trimmedName) {
      return NextResponse.json({ section: current, assessments_retargeted: 0 });
    }

    const { data: clash } = await supabase
      .from('sections')
      .select('id')
      .ilike('name', trimmedName)
      .neq('id', id)
      .maybeSingle();
    if (clash) {
      return NextResponse.json({ error: 'A section with this name already exists' }, { status: 409 });
    }

    const { data: section, error } = await supabase
      .from('sections')
      .update({ name: trimmedName })
      .eq('id', id)
      .select('id, name')
      .single();

    if (error || !section) {
      console.error('Failed to rename section', error);
      return NextResponse.json({ error: 'Unable to rename section' }, { status: 500 });
    }

    // Swap the old name for the new one in place: replacing rather than
    // dropping matters because an emptied target_sections means "visible to
    // every section" rather than "visible to none". Deduped because the new
    // name may already sit in the array as a stale entry left by a section
    // that was deleted.
    let retargeted = 0;
    const { data: targeted } = await supabase
      .from('assessments')
      .select('id, target_sections')
      .contains('target_sections', [current.name]);

    for (const assessment of targeted ?? []) {
      const next = [
        ...new Set(
          (assessment.target_sections as string[]).map((s) =>
            s === current.name ? trimmedName : s,
          ),
        ),
      ];
      const { error: retargetError } = await supabase
        .from('assessments')
        .update({ target_sections: next })
        .eq('id', assessment.id);
      if (retargetError) {
        console.error('Failed to retarget assessment after section rename', retargetError);
      } else {
        retargeted++;
      }
    }

    await logAudit(
      session,
      {
        action: 'section.update',
        entityType: 'sections',
        entityId: id,
        details: { from: current.name, to: trimmedName, assessments_retargeted: retargeted },
      },
      request,
    );

    return NextResponse.json({ section, assessments_retargeted: retargeted });
  } catch (err) {
    console.error('Rename section failed', err);
    return NextResponse.json({ error: 'Unable to rename section' }, { status: 500 });
  }
}

/**
 * Deleting a section unassigns its students (users.section_id -> null) and
 * removes faculty links (faculty_sections cascade).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: section } = await supabase
      .from('sections')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Counted before the delete, while the rows still point here.
    const { count: studentCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', id);

    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete section', error);
      return NextResponse.json({ error: 'Unable to delete section' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'section.delete',
        entityType: 'sections',
        entityId: id,
        details: { name: section.name, unassigned_students: studentCount ?? 0 },
      },
      request,
    );

    return NextResponse.json({ success: true, unassigned_students: studentCount ?? 0 });
  } catch (err) {
    console.error('Delete section failed', err);
    return NextResponse.json({ error: 'Unable to delete section' }, { status: 500 });
  }
}
