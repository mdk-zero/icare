import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingReflectionTables } from '@/app/lib/reflections';

/** GET → { goals }: the student's goals, open first, each with the work it came from. */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('student_goals')
    .select('id, text, skill_id, status, created_at, met_at, student_reflections(source_type, source_id)')
    .eq('student_id', session.uid)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingReflectionTables(error)) return NextResponse.json({ goals: [], enabled: false });
    console.error('Failed to read goals', error);
    return NextResponse.json({ error: 'Unable to load goals' }, { status: 500 });
  }
  const goals = (data ?? [])
    .map((g) => {
      const source = g.student_reflections as unknown as { source_type: string; source_id: string } | null;
      return {
        id: g.id,
        text: g.text,
        skill_id: g.skill_id,
        status: g.status,
        created_at: g.created_at,
        met_at: g.met_at,
        source_type: source?.source_type ?? null,
        source_id: source?.source_id ?? null,
      };
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));
  return NextResponse.json({ goals, enabled: true });
}
