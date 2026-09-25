import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  isMissingReflectionTables,
  isSourceType,
  loadGradedWork,
  MAX_REFLECTION_LENGTH,
  parseGoals,
  REFLECTIONS_NEED_MIGRATION,
  workSignature,
} from '@/app/lib/reflections';

/**
 * GET ?source_type=scenario|assessment&source_id=…
 *   → { work, reflection, goals, feedback, feedback_stale, enabled }
 * The student's graded work with their reflection, goals and any cached AI feedback.
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sourceType = request.nextUrl.searchParams.get('source_type');
  const sourceId = request.nextUrl.searchParams.get('source_id') ?? '';
  if (!isSourceType(sourceType) || !sourceId) {
    return NextResponse.json({ error: 'source_type and source_id are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const work = await loadGradedWork(supabase, session.uid, sourceType, sourceId);
  if (!work) return NextResponse.json({ error: 'Not graded yet' }, { status: 404 });

  const { data: reflection, error } = await supabase
    .from('student_reflections')
    .select('id, reflection, ai_feedback, ai_signature, updated_at')
    .eq('student_id', session.uid)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error) {
    if (isMissingReflectionTables(error)) {
      return NextResponse.json({ work, reflection: null, goals: [], feedback: null, feedback_stale: false, enabled: false });
    }
    console.error('Failed to read reflection', error);
    return NextResponse.json({ error: 'Unable to load reflection' }, { status: 500 });
  }

  const { data: goals } = reflection
    ? await supabase
        .from('student_goals')
        .select('id, text, skill_id, status, created_at, met_at')
        .eq('reflection_id', reflection.id)
        .order('created_at')
    : { data: [] };

  return NextResponse.json({
    enabled: true,
    work,
    reflection: reflection ? { text: reflection.reflection, updated_at: reflection.updated_at } : null,
    goals: goals ?? [],
    feedback: reflection?.ai_feedback ?? null,
    feedback_stale: Boolean(reflection?.ai_feedback) && reflection?.ai_signature !== workSignature(work),
  });
}

/** PUT { source_type, source_id, reflection, goals: [{ text, skill_id? }] }: save the reflection and its goals. */
export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const sourceType = body.source_type;
  const sourceId = typeof body.source_id === 'string' ? body.source_id : '';
  if (!isSourceType(sourceType) || !sourceId) {
    return NextResponse.json({ error: 'source_type and source_id are required' }, { status: 400 });
  }
  const text = typeof body.reflection === 'string' ? body.reflection.trim() : '';
  if (text.length > MAX_REFLECTION_LENGTH) {
    return NextResponse.json({ error: `Keep the reflection under ${MAX_REFLECTION_LENGTH} characters` }, { status: 400 });
  }
  const goals = parseGoals(body.goals);
  if (typeof goals === 'string') return NextResponse.json({ error: goals }, { status: 400 });
  if (!text && goals.length === 0) {
    return NextResponse.json({ error: 'Write a reflection or set a goal' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!(await loadGradedWork(supabase, session.uid, sourceType, sourceId))) {
    return NextResponse.json({ error: 'Not graded yet' }, { status: 404 });
  }

  const { data: saved, error } = await supabase
    .from('student_reflections')
    .upsert(
      {
        student_id: session.uid,
        source_type: sourceType,
        source_id: sourceId,
        reflection: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,source_type,source_id' },
    )
    .select('id')
    .single();
  if (error || !saved) {
    if (isMissingReflectionTables(error)) return NextResponse.json({ error: REFLECTIONS_NEED_MIGRATION }, { status: 503 });
    console.error('Failed to save reflection', error);
    return NextResponse.json({ error: 'Unable to save reflection' }, { status: 500 });
  }

  // Replace this reflection's goals, keeping a goal already met as met.
  const { data: existing } = await supabase
    .from('student_goals')
    .select('id, text, status, met_at')
    .eq('reflection_id', saved.id);
  const metByText = new Map(
    (existing ?? []).filter((g) => g.status === 'met').map((g) => [g.text as string, g.met_at as string | null]),
  );
  await supabase.from('student_goals').delete().eq('reflection_id', saved.id);
  if (goals.length > 0) {
    const { error: goalsError } = await supabase.from('student_goals').insert(
      goals.map((g) => ({
        student_id: session.uid,
        reflection_id: saved.id,
        text: g.text,
        skill_id: g.skill_id,
        status: metByText.has(g.text) ? 'met' : 'open',
        met_at: metByText.get(g.text) ?? null,
      })),
    );
    if (goalsError) {
      console.error('Failed to save goals', goalsError);
      return NextResponse.json({ error: 'Reflection saved, but the goals were not' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

/** Same as PUT, for clients whose request helper has no PUT (the mobile app). */
export const POST = PUT;
