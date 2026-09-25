import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { manageableTeam, MAX_TEAM_NAME, TEAM_FACULTY_NEEDS_MIGRATION } from '@/app/lib/teams';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH { name?, faculty_id? }: rename a group, and/or give it a supervising
 * faculty member (null clears it). A faculty member put on a group is also
 * linked to its section, so the group's students show up for them everywhere
 * else a faculty member sees their sections.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Groups are built by admins; faculty only see the ones assigned to them.
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: { name?: unknown; faculty_id?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; faculty_id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: { name?: string; faculty_id?: string | null } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > MAX_TEAM_NAME) {
      return NextResponse.json({ error: `Group name must be 1–${MAX_TEAM_NAME} characters` }, { status: 400 });
    }
    update.name = name;
  }
  if (body.faculty_id !== undefined) {
    if (body.faculty_id !== null && typeof body.faculty_id !== 'string') {
      return NextResponse.json({ error: 'Invalid faculty_id' }, { status: 400 });
    }
    update.faculty_id = body.faculty_id;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const team = await manageableTeam(supabase, session.role, session.uid, id);
  if (!team) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  if (update.faculty_id) {
    const { data: faculty } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', update.faculty_id)
      .maybeSingle();
    if (!faculty || faculty.role !== 'faculty') {
      return NextResponse.json({ error: 'That user is not a faculty member' }, { status: 400 });
    }
  }

  const { error } = await supabase.from('teams').update(update).eq('id', id);
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') {
      return NextResponse.json({ error: TEAM_FACULTY_NEEDS_MIGRATION }, { status: 503 });
    }
    if (error.code === '23505') return NextResponse.json({ error: 'That section already has a group with this name' }, { status: 409 });
    console.error('Failed to update team', error);
    return NextResponse.json({ error: 'Unable to update group' }, { status: 500 });
  }

  if (update.faculty_id) {
    const { error: linkError } = await supabase
      .from('faculty_sections')
      .upsert(
        { faculty_id: update.faculty_id, section_id: team.section_id },
        { onConflict: 'faculty_id,section_id', ignoreDuplicates: true },
      );
    if (linkError) console.error('Failed to link faculty to section', linkError);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE: remove a team. Its members become unassigned; their scenarios stay. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Groups are built by admins; faculty only see the ones assigned to them.
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
