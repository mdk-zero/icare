import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getAdminScope, ownsFaculty } from '@/app/lib/admin-scope';
import { logAudit } from '@/app/lib/audit';
import { isSkillId } from '@/app/lib/taylor-skills';
import {
  fileViewerUrls,
  isMissingLibrary,
  LIBRARY_BUCKET,
  LIBRARY_NEEDS_MIGRATION,
  MATERIAL_COLUMNS,
  notifyPublished,
  parseMaterialInput,
  publishableSections,
  resolveTargetSections,
  signedFileUrl,
  type MaterialRow,
} from '@/app/lib/library';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;
type Session = NonNullable<Awaited<ReturnType<typeof readSession>>>;

/**
 * The material, if the caller may see it (its author, or the author's admin)
 * and whether they may change it (its author, or an admin over its author).
 */
async function load(supabase: Supabase, session: Session, id: string) {
  const { data, error } = await supabase.from('library_materials').select(MATERIAL_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    if (isMissingLibrary(error)) return { response: NextResponse.json({ error: LIBRARY_NEEDS_MIGRATION }, { status: 503 }) };
    console.error('Failed to read library material', error);
    return { response: NextResponse.json({ error: 'Unable to read the material' }, { status: 500 }) };
  }
  const material = data as unknown as MaterialRow | null;
  if (!material) return { response: NextResponse.json({ error: 'Material not found' }, { status: 404 }) };
  if (material.created_by !== session.uid) {
    const allowed = session.role === 'admin' && ownsFaculty(await getAdminScope(supabase, session.uid), material.created_by);
    if (!allowed) return { response: NextResponse.json({ error: 'You can only change materials you published' }, { status: 403 }) };
  }
  return { material };
}

/** GET: the material, with a short-lived link to its file for previewing. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const found = await load(supabase, session, id);
  if ('response' in found) return found.response;
  const { material } = found;

  let file: { direct: string; embed: string } | null = null;
  if ((material.kind === 'pdf' || material.kind === 'slides') && material.file_path) {
    const signed = await signedFileUrl(supabase, material.file_path);
    if (signed) file = fileViewerUrls(material.kind, signed);
  }
  return NextResponse.json({ material, file });
}

/**
 * PATCH: edit the material, or change its status.
 *   { action: 'publish' | 'unpublish' }   status only
 *   { ...material fields, target_sections } an edit; content is re-validated
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const found = await load(supabase, session, id);
  if ('response' in found) return found.response;
  const { material } = found;

  let update: Record<string, unknown>;
  let action: string;
  if (body.action === 'publish' || body.action === 'unpublish') {
    const publish = body.action === 'publish';
    update = { status: publish ? 'published' : 'draft', published_at: publish ? new Date().toISOString() : null };
    action = `library.${body.action}`;
  } else {
    // A file kind keeps its file unless a new one was uploaded.
    const merged = { ...body };
    if ((body.kind === 'pdf' || body.kind === 'slides') && body.kind === material.kind && body.file_path === undefined) {
      Object.assign(merged, {
        file_path: material.file_path,
        file_name: material.file_name,
        file_size: material.file_size,
        mime_type: material.mime_type,
      });
    }
    // The file's owner is the author, who may not be the admin editing it.
    const parsed = await parseMaterialInput(merged, merged.file_path === material.file_path ? material.created_by : session.uid, isSkillId);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const target = resolveTargetSections(body.target_sections, await publishableSections(supabase, session));
    if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 });
    update = { ...parsed.value, target_sections: target.value };
    action = 'library.update';
  }

  const { data, error } = await supabase.from('library_materials').update(update).eq('id', id).select(MATERIAL_COLUMNS).single();
  if (error || !data) {
    console.error('Failed to update library material', error);
    return NextResponse.json({ error: 'Unable to save the material' }, { status: 500 });
  }
  const saved = data as unknown as MaterialRow;

  // A replaced file is no longer referenced.
  if (material.file_path && material.file_path !== saved.file_path) {
    await supabase.storage.from(LIBRARY_BUCKET).remove([material.file_path]);
  }
  if (material.status !== 'published' && saved.status === 'published') await notifyPublished(supabase, saved);

  await logAudit(session, { action, entityType: 'library_materials', entityId: id, details: { title: saved.title } }, request);
  return NextResponse.json({ material: saved });
}

/** DELETE: remove the material and its stored file. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const found = await load(supabase, session, id);
  if ('response' in found) return found.response;
  const { material } = found;

  const { error } = await supabase.from('library_materials').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete library material', error);
    return NextResponse.json({ error: 'Unable to delete the material' }, { status: 500 });
  }
  if (material.file_path) await supabase.storage.from(LIBRARY_BUCKET).remove([material.file_path]);

  await logAudit(session, { action: 'library.delete', entityType: 'library_materials', entityId: id, details: { title: material.title } }, request);
  return NextResponse.json({ ok: true });
}
