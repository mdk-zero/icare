import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { skillLabel, getSkills } from '@/app/lib/taylor-skills';
import {
  fileViewerUrls,
  isMissingLibrary,
  MATERIAL_COLUMNS,
  signedFileUrl,
  visibleToSection,
  type MaterialRow,
} from '@/app/lib/library';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: one published material for the student, and records that they opened it.
 *   { material, skill: { id, label, goal }, file: { direct, embed } | null }
 * `file.direct` is a 10-minute signed link to the stored PDF or deck;
 * `file.embed` is a viewer page for platforms that can't render it.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [{ data, error }, { data: me }] = await Promise.all([
    supabase.from('library_materials').select(MATERIAL_COLUMNS).eq('id', id).eq('status', 'published').maybeSingle(),
    supabase.from('users').select('sections(name)').eq('id', session.uid).single(),
  ]);
  if (error) {
    if (isMissingLibrary(error)) return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    console.error('Failed to read a library material', error);
    return NextResponse.json({ error: 'Unable to open the material' }, { status: 500 });
  }
  const material = data as unknown as MaterialRow | null;
  const section = (me?.sections as unknown as { name?: string } | null)?.name ?? null;
  if (!material || !visibleToSection(material.target_sections, section)) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const [skills, signed, author] = await Promise.all([
    getSkills(supabase, [material.skill_id]),
    (material.kind === 'pdf' || material.kind === 'slides') && material.file_path
      ? signedFileUrl(supabase, material.file_path)
      : Promise.resolve(null),
    supabase.from('users').select('name').eq('id', material.created_by).maybeSingle(),
    supabase
      .from('library_views')
      .upsert({ material_id: material.id, user_id: session.uid, last_viewed_at: now }, { onConflict: 'material_id,user_id' })
      .then(({ error: viewError }) => {
        if (viewError) console.error('Failed to record a library view', viewError);
      }),
  ]);
  const skill = skills[0];

  return NextResponse.json({
    material: {
      id: material.id,
      skill_id: material.skill_id,
      kind: material.kind,
      title: material.title,
      description: material.description,
      youtube_id: material.youtube_id,
      body_md: material.body_md,
      url: material.url,
      file_name: material.file_name,
      file_size: material.file_size,
      published_at: material.published_at,
      author_name: (author.data?.name as string | undefined) ?? '',
    },
    skill: skill ? { id: skill.id, label: skillLabel(skill), area: skill.area, goal: skill.goal } : null,
    file: signed && (material.kind === 'pdf' || material.kind === 'slides') ? fileViewerUrls(material.kind, signed) : null,
  });
}
