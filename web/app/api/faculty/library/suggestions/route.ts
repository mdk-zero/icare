import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  isMissingLibrary,
  LIBRARY_NEEDS_MIGRATION,
  MATERIAL_COLUMNS,
  notifyPublished,
  publishableSections,
  resolveTargetSections,
  type MaterialRow,
} from '@/app/lib/library';

/**
 * GET: the curated YouTube demos (library_suggestions), less the videos the
 * caller has already added for the same skill.
 *   { suggestions: [{ id, skill_id, youtube_id, title, channel }] }
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const [suggestions, mine] = await Promise.all([
    supabase.from('library_suggestions').select('id, skill_id, youtube_id, title, channel, sort_order').order('sort_order'),
    supabase.from('library_materials').select('skill_id, youtube_id').eq('created_by', session.uid).eq('kind', 'video'),
  ]);
  if (suggestions.error) {
    if (isMissingLibrary(suggestions.error)) return NextResponse.json({ suggestions: [] });
    console.error('Failed to read library suggestions', suggestions.error);
    return NextResponse.json({ error: 'Unable to load suggestions' }, { status: 500 });
  }
  const added = new Set((mine.data ?? []).map((m) => `${m.skill_id}|${m.youtube_id}`));
  return NextResponse.json({
    suggestions: (suggestions.data ?? [])
      .filter((s) => !added.has(`${s.skill_id}|${s.youtube_id}`))
      .map(({ sort_order: _, ...s }) => s),
  });
}

/** POST { suggestionId, target_sections }: publish a suggestion as the caller's own video. */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { suggestionId?: unknown; target_sections?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.suggestionId !== 'string') return NextResponse.json({ error: 'suggestionId is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: suggestion, error } = await supabase
    .from('library_suggestions')
    .select('skill_id, youtube_id, title, channel')
    .eq('id', body.suggestionId)
    .maybeSingle();
  if (error) {
    if (isMissingLibrary(error)) return NextResponse.json({ error: LIBRARY_NEEDS_MIGRATION }, { status: 503 });
    return NextResponse.json({ error: 'Unable to read the suggestion' }, { status: 500 });
  }
  if (!suggestion) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });

  const target = resolveTargetSections(body.target_sections, await publishableSections(supabase, session));
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: 400 });

  const { data, error: insertError } = await supabase
    .from('library_materials')
    .insert({
      skill_id: suggestion.skill_id,
      kind: 'video',
      title: suggestion.title,
      description: suggestion.channel ? `Demonstration by ${suggestion.channel}.` : '',
      youtube_id: suggestion.youtube_id,
      target_sections: target.value,
      status: 'published',
      published_at: new Date().toISOString(),
      created_by: session.uid,
    })
    .select(MATERIAL_COLUMNS)
    .single();
  if (insertError || !data) {
    console.error('Failed to publish a library suggestion', insertError);
    return NextResponse.json({ error: 'Unable to publish the video' }, { status: 500 });
  }
  const material = data as unknown as MaterialRow;
  await notifyPublished(supabase, material);
  await logAudit(
    session,
    { action: 'library.publish', entityType: 'library_materials', entityId: material.id, details: { title: material.title, suggestion: true } },
    request,
  );
  return NextResponse.json({ material }, { status: 201 });
}
