import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  assignCaseGroups,
  loadCaseGroups,
  loadTeams,
  parseCaseGroups,
  removeCaseFiles,
  scopedCaseStudents,
  canManagePresentation,
  isMissingCaseTables,
  CASES_NOT_READY,
  PRESENTATION_COLUMNS,
} from '@/app/lib/cases';
import { activityOfferings } from '@/app/lib/activity-course';
import { parseDeadline } from '@/app/lib/deadline-input';
import { ownsRow, viewerDeanId } from '@/app/lib/dean-scope';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Presentation = {
  id: string;
  title: string;
  instructions: string;
  deadline: string | null;
  section_ids: string[];
  created_by: string | null;
};

async function authorize() {
  const session = await readSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  if (!['faculty', 'admin'].includes(session.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const;
  }
  return { session } as const;
}

async function loadPresentation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { uid: string; role: string },
  id: string,
) {
  const { data, error } = await supabase.from('case_presentations').select(PRESENTATION_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    if (isMissingCaseTables(error)) return { response: NextResponse.json({ error: CASES_NOT_READY }, { status: 503 }) };
    // A malformed id fails the query outright.
    return { response: NextResponse.json({ error: 'Case presentation not found' }, { status: 404 }) };
  }
  // Another Dean's (077) is not found at all.
  if (!data || !(await ownsRow(supabase, 'case_presentations', id, await viewerDeanId(supabase, session)))) {
    return { response: NextResponse.json({ error: 'Case presentation not found' }, { status: 404 }) };
  }
  return { presentation: data as unknown as Presentation };
}

// GET /api/faculty/cases/:id — the presentation and its groups: members,
// leader, file and grade. An instructor sees the groups their students are in.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadPresentation(supabase, session, id);
    if (loaded.response) return loaded.response;
    const presentation = loaded.presentation;
    const canManage = canManagePresentation(session, presentation);

    const result = await loadCaseGroups(supabase, new Map([[id, presentation.deadline]]));
    if (result.error) {
      if (isMissingCaseTables(result.error)) return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
      throw result.error;
    }
    const scope = await scopedCaseStudents(supabase, session);
    const groups = (result.groups.get(id) ?? []).filter(
      (g) => !scope || canManage || g.members.some((m) => scope.has(m.student_id)),
    );
    if (scope && !canManage && groups.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: sections } = presentation.section_ids.length
      ? await supabase.from('sections').select('id, name').in('id', presentation.section_ids)
      : { data: [] as { id: string; name: string }[] };
    const sectionName = new Map((sections ?? []).map((s) => [s.id as string, s.name as string]));

    return NextResponse.json({
      presentation: {
        ...presentation,
        sections: presentation.section_ids.map((sid) => ({ id: sid, name: sectionName.get(sid) ?? 'Unknown' })),
        groups: groups.map((g) => ({ id: g.id, name: g.name, section_name: g.section_name })),
        offering_id: (await activityOfferings(supabase, 'case_presentations', [id])).get(id) ?? null,
        can_manage: canManage,
      },
      groups,
    });
  } catch (err) {
    console.error('Failed to load case presentation', err);
    return NextResponse.json({ error: 'Unable to load the case presentation' }, { status: 500 });
  }
}

// PATCH /api/faculty/cases/:id
//   { title?, instructions?, deadline?, groups?: [{ team_id, leader_id }], leaders?: { [groupId]: studentId } }
// More groups can be added; groups are never removed, since they may have
// handed in already. A leader can be changed until the group is graded.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { title, instructions, deadline, groups: groupsInput, leaders } = body as Record<string, unknown>;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadPresentation(supabase, session, id);
    if (loaded.response) return loaded.response;
    const presentation = loaded.presentation;
    if (!canManagePresentation(session, presentation)) {
      return NextResponse.json({ error: 'Only the instructor who created this can change it' }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (title !== undefined) {
      const t = typeof title === 'string' ? title.trim() : '';
      if (!t || t.length > 200) return NextResponse.json({ error: 'Title must be 1–200 characters' }, { status: 400 });
      update.title = t;
    }
    if (instructions !== undefined) {
      update.instructions = typeof instructions === 'string' ? instructions.trim().slice(0, 4000) : '';
    }
    if (deadline !== undefined) {
      // It can move, but not go: late and overdue work is measured against it.
      const deadlineCheck = parseDeadline(deadline);
      if (!deadlineCheck.ok) return NextResponse.json({ error: deadlineCheck.error }, { status: 400 });
      update.deadline = deadlineCheck.value;
    }

    // New leaders are checked first, so a bad one stops the whole change.
    const leaderChanges =
      typeof leaders === 'object' && leaders !== null && !Array.isArray(leaders)
        ? Object.entries(leaders as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0,
          )
        : [];
    if (leaderChanges.length > 0) {
      const { data: rows, error } = await supabase
        .from('case_presentation_groups')
        .select('id, status, team_name')
        .eq('presentation_id', id)
        .in('id', leaderChanges.map(([g]) => g));
      if (error) throw error;
      const byId = new Map(((rows ?? []) as { id: string; status: string; team_name: string }[]).map((r) => [r.id, r]));
      const { data: subs } = byId.size
        ? await supabase.from('case_submissions').select('student_id, group_id').in('group_id', [...byId.keys()])
        : { data: [] as { student_id: string; group_id: string }[] };
      const memberOf = new Set(
        ((subs ?? []) as { student_id: string; group_id: string }[]).map((s) => `${s.group_id}:${s.student_id}`),
      );
      for (const [groupId, leaderId] of leaderChanges) {
        const row = byId.get(groupId);
        if (!row) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        if (row.status === 'graded') {
          return NextResponse.json({ error: `${row.team_name} is already graded, so its leader can't change` }, { status: 409 });
        }
        if (!memberOf.has(`${groupId}:${leaderId}`)) {
          return NextResponse.json({ error: `The leader must be a member of ${row.team_name}` }, { status: 400 });
        }
      }
    }

    let added = { groups: 0, students: 0 };
    if (groupsInput !== undefined) {
      const groups = parseCaseGroups(groupsInput);
      if (!groups) return NextResponse.json({ error: 'Choose a leader for each group' }, { status: 400 });
      if (groups.length > 0) {
        const assigned = await assignCaseGroups(supabase, session, presentation, groups);
        if (!assigned.ok) {
          return NextResponse.json({ error: assigned.error, invalid: assigned.invalid }, { status: assigned.status });
        }
        added = { groups: assigned.groups, students: assigned.added.length };
        const { data: current } = await supabase.from('case_presentations').select('team_ids').eq('id', id).maybeSingle();
        const currentTeams = ((current as { team_ids?: string[] | null } | null)?.team_ids ?? []) as string[];
        const teams = await loadTeams(supabase, groups.map((g) => g.team_id));
        update.team_ids = [...new Set([...currentTeams, ...teams.map((t) => t.id)])];
        update.section_ids = [...new Set([...presentation.section_ids, ...teams.map((t) => t.section_id)])];
      }
    }

    for (const [groupId, leaderId] of leaderChanges) {
      const { error } = await supabase
        .from('case_presentation_groups')
        .update({ leader_id: leaderId })
        .eq('id', groupId)
        .neq('status', 'graded');
      if (error) throw error;
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from('case_presentations').update(update).eq('id', id);
      if (error) throw error;
    }
    if (Object.keys(update).length > 0 || leaderChanges.length > 0) {
      await logAudit(
        session,
        {
          action: 'case.update',
          entityType: 'case_presentations',
          entityId: id,
          details: {
            ...update,
            leaders: Object.fromEntries(leaderChanges),
            groups_added: added.groups,
            students_added: added.students,
          },
        },
        request,
      );
    }

    return NextResponse.json({ ok: true, groups_added: added.groups, students_added: added.students });
  } catch (err) {
    console.error('Failed to update case presentation', err);
    return NextResponse.json({ error: 'Unable to update the case presentation' }, { status: 500 });
  }
}

// DELETE /api/faculty/cases/:id — only while no group has handed it in.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadPresentation(supabase, session, id);
    if (loaded.response) return loaded.response;
    if (!canManagePresentation(session, loaded.presentation)) {
      return NextResponse.json({ error: 'Only the instructor who created this can delete it' }, { status: 403 });
    }

    const { data: groupRows, error: groupError } = await supabase
      .from('case_presentation_groups')
      .select('status, file_path')
      .eq('presentation_id', id);
    if (groupError && !isMissingCaseTables(groupError)) throw groupError;
    const rows = (groupRows ?? []) as { status: string; file_path: string | null }[];
    if (rows.some((g) => g.status === 'submitted' || g.status === 'graded')) {
      return NextResponse.json(
        { error: 'Groups have already handed in this case presentation; it can no longer be deleted' },
        { status: 409 },
      );
    }

    const { error } = await supabase.from('case_presentations').delete().eq('id', id);
    if (error) throw error;
    // A leader may have uploaded without it counting as handed in yet.
    await removeCaseFiles(supabase, rows.map((g) => g.file_path));

    await logAudit(
      session,
      { action: 'case.delete', entityType: 'case_presentations', entityId: id, details: { title: loaded.presentation.title } },
      request,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete case presentation', err);
    return NextResponse.json({ error: 'Unable to delete the case presentation' }, { status: 500 });
  }
}
