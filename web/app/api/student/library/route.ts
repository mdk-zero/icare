import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { listSkills } from '@/app/lib/taylor-skills';
import { isMissingLibrary, visibleToSection } from '@/app/lib/library';

/**
 * GET: the published materials for the student's section, by chapter and skill.
 *   ?skill=1-7 narrows to one skill.
 *   { chapters: [{ chapter, area, skills: [{ id, title, materials: [...] }] }], total, unseen }
 * Materials are summaries; the file link and note body come from /[id].
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();
    const skill = request.nextUrl.searchParams.get('skill');

    const { data: me } = await supabase.from('users').select('sections(name)').eq('id', session.uid).single();
    const section = (me?.sections as unknown as { name?: string } | null)?.name ?? null;

    let query = supabase
      .from('library_materials')
      .select('id, skill_id, kind, title, description, youtube_id, file_name, url, target_sections, published_at, created_by')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1000);
    if (skill) query = query.eq('skill_id', skill);

    const [skills, materialsRes, viewsRes] = await Promise.all([
      listSkills(supabase),
      query,
      supabase.from('library_views').select('material_id').eq('user_id', session.uid),
    ]);
    if (materialsRes.error) {
      if (isMissingLibrary(materialsRes.error)) return NextResponse.json({ chapters: [], total: 0, unseen: 0 });
      console.error('Failed to read the student library', materialsRes.error);
      return NextResponse.json({ error: 'Unable to load the Library' }, { status: 500 });
    }

    const visible = (materialsRes.data ?? []).filter((m) => visibleToSection(m.target_sections as string[] | null, section));
    const seen = new Set((viewsRes.data ?? []).map((v) => v.material_id as string));

    const authorIds = [...new Set(visible.map((m) => m.created_by as string))];
    const { data: authors } = authorIds.length
      ? await supabase.from('users').select('id, name').in('id', authorIds)
      : { data: [] };
    const names = new Map((authors ?? []).map((a) => [a.id as string, a.name as string]));

    const bySkill = new Map<string, unknown[]>();
    for (const m of visible) {
      const list = bySkill.get(m.skill_id as string) ?? [];
      list.push({
        id: m.id,
        kind: m.kind,
        title: m.title,
        description: m.description,
        youtube_id: m.youtube_id,
        file_name: m.file_name,
        url: m.url,
        published_at: m.published_at,
        author_name: names.get(m.created_by as string) ?? '',
        seen: seen.has(m.id as string),
      });
      bySkill.set(m.skill_id as string, list);
    }

    const chapters: { chapter: number; area: string; skills: { id: string; title: string; materials: unknown[] }[] }[] = [];
    for (const s of skills) {
      const materials = bySkill.get(s.id);
      if (!materials) continue;
      let chapter = chapters.find((c) => c.chapter === s.chapter);
      if (!chapter) {
        chapter = { chapter: s.chapter, area: s.area, skills: [] };
        chapters.push(chapter);
      }
      chapter.skills.push({ id: s.id, title: s.title, materials });
    }

    return NextResponse.json({
      chapters,
      total: visible.length,
      unseen: visible.filter((m) => !seen.has(m.id as string)).length,
    });
  } catch (err) {
    console.error('Student library failed', err);
    return NextResponse.json({ error: 'Unable to load the Library' }, { status: 500 });
  }
}
