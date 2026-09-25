import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { manageableTeam, MAX_TEAM_NAME } from '@/app/lib/teams';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH { name }: rename a team. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_TEAM_NAME) {
    return NextResponse.json({ error: `Team name must be 1–${MAX_TEAM_NAME} characters` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!(await manageableTeam(supabase, session.role, session.uid, id))) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }
  const { error } = await supabase.from('teams').update({ name }).eq('id', id);
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That section already has a team with this name' }, { status: 409 });
    console.error('Failed to rename team', error);
    return NextResponse.json({ error: 'Unable to rename team' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE: remove a team. Its members become unassigned; their scenarios stay. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!(await manageableTeam(supabase, session.role, session.uid, id))) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete team', error);
    return NextResponse.json({ error: 'Unable to delete team' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
