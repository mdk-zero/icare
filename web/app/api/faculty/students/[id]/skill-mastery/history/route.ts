import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { canSeeStudent } from '@/app/lib/admin-scope';
import { loadMasteryHistory } from '@/app/lib/skill-mastery';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/faculty/students/:id/skill-mastery/history — one student's mastery of
// each skill over time, as the student sees it on their own Profile.
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    if (!(await canSeeStudent(supabase, session, id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ skills: await loadMasteryHistory(supabase, id) });
  } catch (err) {
    console.error('Failed to load a student’s mastery history', err);
    return NextResponse.json({ error: 'Unable to load skill mastery over time' }, { status: 500 });
  }
}
