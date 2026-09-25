import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH { status: 'open' | 'met' }: mark one of the student's own goals met, or reopen it. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.status !== 'open' && body.status !== 'met') {
    return NextResponse.json({ error: "status must be 'open' or 'met'" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('student_goals')
    .update({ status: body.status, met_at: body.status === 'met' ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('student_id', session.uid)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('Failed to update goal', error);
    return NextResponse.json({ error: 'Unable to update goal' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
