import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  generateFeedback,
  isMissingReflectionTables,
  isSourceType,
  loadGradedWork,
  ruleFeedback,
  workSignature,
} from '@/app/lib/reflections';

/**
 * POST { source_type, source_id } → { feedback }
 * Feedback on graded work, generated only when the student asks and cached
 * against the grades: asking again about unchanged grades returns the cached
 * reading without another AI call.
 */
export async function POST(request: NextRequest) {
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

  const supabase = getSupabaseAdmin();
  const work = await loadGradedWork(supabase, session.uid, sourceType, sourceId);
  if (!work) return NextResponse.json({ error: 'Not graded yet' }, { status: 404 });
  const signature = workSignature(work);

  const { data: cached, error } = await supabase
    .from('student_reflections')
    .select('id, ai_feedback, ai_signature')
    .eq('student_id', session.uid)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error && isMissingReflectionTables(error)) {
    // Nowhere to cache before migration 050, so no AI call either.
    return NextResponse.json({ feedback: ruleFeedback(work) });
  }
  if (cached?.ai_feedback && cached.ai_signature === signature) {
    return NextResponse.json({ feedback: cached.ai_feedback });
  }

  const feedback = await generateFeedback(work);
  // Only a real AI reading is cached; a rules fallback is retried next time.
  if (feedback.source === 'ai') {
    const { error: saveError } = await supabase.from('student_reflections').upsert(
      {
        student_id: session.uid,
        source_type: sourceType,
        source_id: sourceId,
        ai_feedback: feedback,
        ai_signature: signature,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,source_type,source_id' },
    );
    if (saveError) console.error('Failed to cache feedback', saveError);
  }
  return NextResponse.json({ feedback });
}
