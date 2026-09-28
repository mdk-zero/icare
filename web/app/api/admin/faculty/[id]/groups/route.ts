import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { getAdminScope, ownsFaculty } from '@/app/lib/admin-scope';
import { manageableSectionIds, TEAM_FACULTY_NEEDS_MIGRATION } from '@/app/lib/teams';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT { team_ids }: makes the instructor the supervisor of exactly these
 * groups. A group has one supervisor, so a checked group held by another
 * instructor moves to this one; groups this instructor held but are left
 * unchecked go unsupervised. Their section links become the sections of those
 * groups — an instructor is given groups now, never a whole section.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: facultyId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { team_ids } = body as { team_ids?: unknown };
  if (!Array.isArray(team_ids) || team_ids.some((t) => typeof t !== 'string')) {
    return NextResponse.json({ error: 'team_ids must be an array of ids' }, { status: 400 });
  }
  const teamIds = [...new Set(team_ids as string[])];

  try {
    const supabase = getSupabaseAdmin();

    const { data: faculty } = await supabase
      .from('users')
      .select('id')
      .eq('id', facultyId)
      .eq('role', 'faculty')
      .maybeSingle();
    // An admin manages only their own faculty (migration 053).
    if (!faculty || !ownsFaculty(await getAdminScope(supabase, session.uid), facultyId)) {
      return NextResponse.json({ error: 'Instructor not found' }, { status: 404 });
    }

    const allowedSections = await manageableSectionIds(supabase, session.role, session.uid);
    const { data: teams, error: teamsError } = teamIds.length
      ? await supabase.from('teams').select('id, section_id').in('id', teamIds)
      : { data: [] as { id: string; section_id: string }[], error: null };
    if (teamsError) {
      console.error('Failed to read groups', teamsError);
      return NextResponse.json({ error: 'Unable to update groups' }, { status: 500 });
    }
    if ((teams ?? []).length !== teamIds.length) {
      return NextResponse.json({ error: 'One or more ids are not groups' }, { status: 400 });
    }
    const outside = (teams ?? []).filter((t) => !allowedSections.includes(t.section_id as string));
    if (outside.length > 0) {
      return NextResponse.json({ error: 'Some groups belong to another dean' }, { status: 403 });
    }

    // Release the groups they no longer supervise, then take the checked ones.
    let release = supabase.from('teams').update({ faculty_id: null }).eq('faculty_id', facultyId);
    if (teamIds.length > 0) release = release.not('id', 'in', `(${teamIds.join(',')})`);
    const { error: releaseError } = await release;
    if (releaseError) {
      if (releaseError.code === '42703' || releaseError.code === 'PGRST204') {
        return NextResponse.json({ error: TEAM_FACULTY_NEEDS_MIGRATION }, { status: 503 });
      }
      console.error('Failed to release groups', releaseError);
      return NextResponse.json({ error: 'Unable to update groups' }, { status: 500 });
    }
    if (teamIds.length > 0) {
      const { error: takeError } = await supabase
        .from('teams')
        .update({ faculty_id: facultyId })
        .in('id', teamIds);
      if (takeError) {
        console.error('Failed to assign groups', takeError);
        return NextResponse.json({ error: 'Unable to update groups' }, { status: 500 });
      }
    }

    const sectionIds = [...new Set((teams ?? []).map((t) => t.section_id as string))];
    const { error: clearError } = await supabase
      .from('faculty_sections')
      .delete()
      .eq('faculty_id', facultyId);
    if (clearError) console.error('Failed to clear instructor sections', clearError);
    if (sectionIds.length > 0) {
      const { error: linkError } = await supabase
        .from('faculty_sections')
        .insert(sectionIds.map((section_id) => ({ faculty_id: facultyId, section_id })));
      if (linkError) console.error('Failed to link instructor to sections', linkError);
    }

    await logAudit(
      session,
      {
        action: 'faculty.groups.update',
        entityType: 'teams',
        entityId: facultyId,
        details: { group_count: teamIds.length, section_count: sectionIds.length },
      },
      request,
    );

    return NextResponse.json({ success: true, team_ids: teamIds });
  } catch (err) {
    console.error('Update instructor groups failed', err);
    return NextResponse.json({ error: 'Unable to update groups' }, { status: 500 });
  }
}
