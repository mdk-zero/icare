import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { groupSummaries, isMissingTeamTables, loadTeams, manageableSectionIds } from '@/app/lib/teams';

/**
 * Per-group averages over individual grades, for every group in the caller's
 * sections (every section for an admin). Each group says who supervises it,
 * so a page can pick out the viewer's own.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const sectionIds = await manageableSectionIds(supabase, session.role, session.uid);
    const { teams, error } = await loadTeams(supabase, sectionIds);
    if (error) {
      if (isMissingTeamTables(error)) return NextResponse.json({ enabled: false, groups: [] });
      console.error('Failed to load groups', error);
      return NextResponse.json({ error: 'Unable to load groups' }, { status: 500 });
    }
    // Faculty get only the groups they supervise.
    const own = session.role === 'faculty' ? teams.filter((t) => t.faculty_id === session.uid) : teams;
    const summary = await groupSummaries(supabase, own);
    if (summary.error) {
      console.error('Failed to summarise groups', summary.error);
      return NextResponse.json({ error: 'Unable to load groups' }, { status: 500 });
    }
    const supervisor = new Map(own.map((t) => [t.id, t.faculty_id]));
    return NextResponse.json({
      enabled: true,
      viewer_id: session.uid,
      groups: summary.groups.map((g) => ({ ...g, faculty_id: supervisor.get(g.team_id) ?? null })),
    });
  } catch (err) {
    console.error('Group summary failed', err);
    return NextResponse.json({ error: 'Unable to load groups' }, { status: 500 });
  }
}
