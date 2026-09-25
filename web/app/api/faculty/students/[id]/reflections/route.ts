import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isStudentInFacultySections } from '@/app/lib/roster';
import { isMissingReflectionTables } from '@/app/lib/reflections';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET → { reflections: [{ ..., title, goals }], enabled }
 * A student's reflections on their graded work, newest first, each with the
 * title of the scenario or skill assessment it is about and its goals.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: studentId } = await params;
  const supabase = getSupabaseAdmin();
  if (session.role === 'faculty' && !(await isStudentInFacultySections(supabase, session.uid, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: reflections, error } = await supabase
    .from('student_reflections')
    .select('id, source_type, source_id, reflection, ai_feedback, created_at, updated_at, student_goals(id, text, skill_id, status, met_at)')
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingReflectionTables(error)) return NextResponse.json({ reflections: [], enabled: false });
    console.error('Failed to read reflections', error);
    return NextResponse.json({ error: 'Unable to load reflections' }, { status: 500 });
  }

  const scenarioIds = (reflections ?? []).filter((r) => r.source_type === 'scenario').map((r) => r.source_id as string);
  const attemptIds = (reflections ?? []).filter((r) => r.source_type === 'assessment').map((r) => r.source_id as string);
  const [{ data: assignments }, { data: attempts }] = await Promise.all([
    scenarioIds.length
      ? supabase.from('scenario_assignments').select('id, score, scenarios(title)').in('id', scenarioIds)
      : Promise.resolve({ data: [] }),
    attemptIds.length
      ? supabase.from('assessment_attempts').select('id, score, assessments(title)').in('id', attemptIds)
      : Promise.resolve({ data: [] }),
  ]);
  const titleOf = new Map<string, { title: string; score: number | null }>();
  for (const a of assignments ?? []) {
    titleOf.set(a.id as string, {
      title: (a.scenarios as unknown as { title: string } | null)?.title ?? 'Scenario',
      score: a.score as number | null,
    });
  }
  for (const a of attempts ?? []) {
    titleOf.set(a.id as string, {
      title: (a.assessments as unknown as { title: string } | null)?.title ?? 'Skill assessment',
      score: a.score === null ? null : Number(a.score),
    });
  }

  return NextResponse.json({
    enabled: true,
    reflections: (reflections ?? [])
      .filter((r) => (r.reflection as string)?.trim() || ((r.student_goals as unknown[]) ?? []).length > 0)
      .map((r) => ({
        id: r.id,
        source_type: r.source_type,
        title: titleOf.get(r.source_id as string)?.title ?? 'Graded work',
        score: titleOf.get(r.source_id as string)?.score ?? null,
        reflection: r.reflection,
        feedback_summary: (r.ai_feedback as { summary?: string } | null)?.summary ?? null,
        updated_at: r.updated_at,
        goals: r.student_goals ?? [],
      })),
  });
}
