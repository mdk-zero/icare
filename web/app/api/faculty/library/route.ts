import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getAdminScope } from '@/app/lib/admin-scope';
import { logAudit } from '@/app/lib/audit';
import { isSkillId, listSkills } from '@/app/lib/taylor-skills';
import {
  isMissingLibrary,
  LIBRARY_NEEDS_MIGRATION,
  MATERIAL_COLUMNS,
  notifyPublished,
  parseMaterialInput,
  publishableSections,
  resolveTargetSections,
  type MaterialRow,
} from '@/app/lib/library';

/**
 * GET: the Library as the caller manages it.
 *   { skills, sections, materials, enabled }
 * A faculty member sees their own materials; an admin sees theirs and their
 * instructors'. Each material carries its author's name and view count.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();
    let authors: string[] | null = [session.uid];
    if (session.role === 'admin') {
      const scope = await getAdminScope(supabase, session.uid);
      authors = scope ? [session.uid, ...scope.facultyIds] : null;
    }

    let query = supabase.from('library_materials').select(MATERIAL_COLUMNS).order('created_at', { ascending: false }).limit(1000);
    if (authors) query = query.in('created_by', authors);

    const [skills, sections, materialsRes] = await Promise.all([
      listSkills(supabase),
      publishableSections(supabase, session),
      query,
    ]);

    if (materialsRes.error) {
      if (isMissingLibrary(materialsRes.error)) {
        return NextResponse.json({ skills, sections: sections ?? [], materials: [], enabled: false });
      }
      console.error('Failed to read library materials', materialsRes.error);
      return NextResponse.json({ error: 'Unable to load the Library' }, { status: 500 });
    }
    const rows = (materialsRes.data ?? []) as unknown as MaterialRow[];

    const ids = rows.map((r) => r.id);
    const authorIds = [...new Set(rows.map((r) => r.created_by))];
    const [viewsRes, namesRes] = await Promise.all([
      ids.length ? supabase.from('library_views').select('material_id').in('material_id', ids).limit(50000) : Promise.resolve({ data: [] }),
      authorIds.length ? supabase.from('users').select('id, name').in('id', authorIds) : Promise.resolve({ data: [] }),
    ]);
    const views = new Map<string, number>();
    for (const v of viewsRes.data ?? []) views.set(v.material_id as string, (views.get(v.material_id as string) ?? 0) + 1);
    const names = new Map((namesRes.data ?? []).map((u) => [u.id as string, u.name as string]));

    const materials = rows.map((r) => ({
      ...r,
      author_name: names.get(r.created_by) ?? '',
      mine: r.created_by === session.uid,
      views: views.get(r.id) ?? 0,
    }));

    // null sections: an admin with no limit publishes to every section.
    let sectionList = sections;
    if (sectionList === null) {
      const { data } = await supabase.from('sections').select('id, name').order('name');
      sectionList = (data ?? []) as { id: string; name: string }[];
    }

    return NextResponse.json({ skills, sections: sectionList, materials, enabled: true });
  } catch (err) {
    console.error('Load library failed', err);
    return NextResponse.json({ error: 'Unable to load the Library' }, { status: 500 });
  }
}

/** POST: create a material, as a draft or published straight away (`publish: true`). */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const parsed = await parseMaterialInput(body, session.uid, isSkillId);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const target = resolveTargetSections(body.target_sections, await publishableSections(supabase, session));
    if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 });

    const publish = body.publish === true;
    const { data, error } = await supabase
      .from('library_materials')
      .insert({
        ...parsed.value,
        target_sections: target.value,
        status: publish ? 'published' : 'draft',
        published_at: publish ? new Date().toISOString() : null,
        created_by: session.uid,
      })
      .select(MATERIAL_COLUMNS)
      .single();

    if (error || !data) {
      if (isMissingLibrary(error)) return NextResponse.json({ error: LIBRARY_NEEDS_MIGRATION }, { status: 503 });
      console.error('Failed to create library material', error);
      return NextResponse.json({ error: 'Unable to save the material' }, { status: 500 });
    }
    const material = data as unknown as MaterialRow;

    if (publish) await notifyPublished(supabase, material);
    await logAudit(
      session,
      {
        action: publish ? 'library.publish' : 'library.create',
        entityType: 'library_materials',
        entityId: material.id,
        details: { title: material.title, kind: material.kind, skill_id: material.skill_id },
      },
      request,
    );

    return NextResponse.json({ material }, { status: 201 });
  } catch (err) {
    console.error('Create library material failed', err);
    return NextResponse.json({ error: 'Unable to save the material' }, { status: 500 });
  }
}
