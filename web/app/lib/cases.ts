/**
 * Server helpers for case presentations (056, by group since 093): giving a
 * presentation to groups with a leader each, reading the groups back with
 * their members and file, and deciding what a faculty or admin session may see.
 */
import type { getSupabaseAdmin } from './supabase/server';
import { getScopedStudentIds } from './admin-scope';
import { insertNotifications } from './notify';
import { CASE_BUCKET, isLateSubmission } from './case-rubric';

type Supabase = ReturnType<typeof getSupabaseAdmin>;
type Session = { uid: string; role: string };

/** Before 056 is applied the tables don't exist; say so instead of a bare 500. */
export function isMissingCaseTables(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export const CASES_NOT_READY = 'Case presentations are not set up yet (migration 056 has not been applied).';

export const PRESENTATION_COLUMNS =
  'id, title, instructions, deadline, section_ids, created_by, created_at, updated_at';

export type AssignResult =
  | { ok: true; added: string[]; total: number; groups: number }
  | { ok: false; status: number; error: string; invalid?: string[] };

/** A group a presentation goes to, and the member who reports for it. */
export interface CaseGroupInput {
  team_id: string;
  leader_id: string;
}

/** Reads `[{ team_id, leader_id }]` from a request body; null when it isn't that shape. */
export function parseCaseGroups(value: unknown): CaseGroupInput[] | null {
  if (!Array.isArray(value)) return null;
  const out = new Map<string, CaseGroupInput>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const { team_id, leader_id } = item as Record<string, unknown>;
    if (typeof team_id !== 'string' || !team_id || typeof leader_id !== 'string' || !leader_id) return null;
    out.set(team_id, { team_id, leader_id });
  }
  return [...out.values()];
}

/** The groups named, with their sections, for storing and for labels. */
export async function loadTeams(
  supabase: Supabase,
  teamIds: string[],
): Promise<{ id: string; name: string; section_id: string; faculty_id: string | null }[]> {
  if (teamIds.length === 0) return [];
  const { data } = await supabase.from('teams').select('*').in('id', teamIds);
  return ((data ?? []) as { id: string; name: string; section_id: string; faculty_id?: string | null }[]).map((t) => ({
    id: t.id,
    name: t.name,
    section_id: t.section_id,
    faculty_id: t.faculty_id ?? null,
  }));
}

/**
 * Gives a presentation to groups (093). Each group gets one row with its
 * leader, and each member their own case_submissions row pointing at it, so
 * the group's grade reaches every member's record. Groups that already have
 * it are left alone. Members are fixed when it is given: someone who joins
 * the group later is not added.
 */
export async function assignCaseGroups(
  supabase: Supabase,
  session: Session,
  presentation: { id: string; title: string },
  groups: CaseGroupInput[],
): Promise<AssignResult> {
  if (groups.length === 0) return { ok: false, status: 400, error: 'Choose the groups that report this case' };

  const teamIds = groups.map((g) => g.team_id);
  const teams = await loadTeams(supabase, teamIds);
  if (teams.length !== teamIds.length) return { ok: false, status: 400, error: 'Group not found' };
  // Groups: an instructor's own; a Dean's in their sections.
  if (session.role === 'faculty' && teams.some((t) => t.faculty_id !== session.uid)) {
    return { ok: false, status: 403, error: 'You can only give it to groups you supervise' };
  }

  const [{ data: memberRows, error: membersError }, { data: sections }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase.from('team_members').select('team_id, student_id').in('team_id', teamIds),
      supabase.from('sections').select('id, name').in('id', [...new Set(teams.map((t) => t.section_id))]),
      supabase.from('case_presentation_groups').select('team_id').eq('presentation_id', presentation.id).in('team_id', teamIds),
    ]);
  if (membersError || existingError) {
    if (isMissingCaseTables(existingError)) return { ok: false, status: 503, error: CASE_GROUPS_NOT_READY };
    console.error('Failed to resolve case presentation groups', membersError ?? existingError);
    return { ok: false, status: 500, error: 'Unable to assign the case presentation' };
  }
  const membersOf = new Map<string, string[]>();
  for (const m of (memberRows ?? []) as { team_id: string; student_id: string }[]) {
    membersOf.set(m.team_id, [...(membersOf.get(m.team_id) ?? []), m.student_id]);
  }
  const sectionName = new Map(((sections ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const already = new Set(((existing ?? []) as { team_id: string }[]).map((r) => r.team_id));

  const fresh = groups.filter((g) => !already.has(g.team_id));
  const empty = fresh.filter((g) => (membersOf.get(g.team_id) ?? []).length === 0).map((g) => teamById.get(g.team_id)!.name);
  if (empty.length > 0) {
    return { ok: false, status: 400, error: `${empty.join(', ')} ${empty.length === 1 ? 'has' : 'have'} no members yet`, invalid: empty };
  }
  const badLeader = fresh.filter((g) => !(membersOf.get(g.team_id) ?? []).includes(g.leader_id));
  if (badLeader.length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'Each group leader must be a member of that group',
      invalid: badLeader.map((g) => teamById.get(g.team_id)!.name),
    };
  }
  if (fresh.length === 0) return { ok: true, added: [], total: 0, groups: 0 };

  const { data: created, error: createError } = await supabase
    .from('case_presentation_groups')
    .insert(
      fresh.map((g) => {
        const team = teamById.get(g.team_id)!;
        return {
          presentation_id: presentation.id,
          team_id: g.team_id,
          team_name: team.name,
          section_name: sectionName.get(team.section_id) ?? '',
          leader_id: g.leader_id,
        };
      }),
    )
    .select('id, team_id, leader_id');
  if (createError || !created) {
    if (isMissingCaseTables(createError)) return { ok: false, status: 503, error: CASE_GROUPS_NOT_READY };
    console.error('Failed to create case presentation groups', createError);
    return { ok: false, status: 500, error: 'Unable to assign the case presentation' };
  }

  const rows = (created as { id: string; team_id: string; leader_id: string }[]).flatMap((g) =>
    (membersOf.get(g.team_id) ?? []).map((student_id) => ({ presentation_id: presentation.id, student_id, group_id: g.id })),
  );
  const { data: saved, error } = await supabase
    .from('case_submissions')
    .upsert(rows, { onConflict: 'presentation_id,student_id' })
    .select('id, student_id');
  if (error) {
    console.error('Failed to assign case presentation', error);
    await supabase.from('case_presentation_groups').delete().in('id', (created as { id: string }[]).map((g) => g.id));
    return { ok: false, status: 500, error: 'Unable to assign the case presentation' };
  }

  const leaders = new Set((created as { leader_id: string }[]).map((g) => g.leader_id));
  const submissionOf = new Map(((saved ?? []) as { id: string; student_id: string }[]).map((r) => [r.student_id, r.id]));
  const { error: notifyError } = await insertNotifications(
    supabase,
    rows.map(({ student_id }) => ({
      user_id: student_id,
      type: 'assignment_created',
      title: 'New case presentation assigned',
      body: leaders.has(student_id)
        ? `You are your group's leader for "${presentation.title}". Upload the group's slides (PowerPoint or PDF) when they are ready.`
        : `Your group reports "${presentation.title}". Your group leader uploads the slides; you can open them once they are in.`,
      // Opens the student's own case in the app.
      data: { case_presentation_id: presentation.id, case_submission_id: submissionOf.get(student_id) },
    })),
  );
  if (notifyError) console.error('Failed to create case notifications', notifyError);

  return { ok: true, added: rows.map((r) => r.student_id), total: rows.length, groups: created.length };
}

export const CASE_GROUPS_NOT_READY =
  'Case presentations by group are not set up yet (migration 093 has not been applied).';

export const GROUP_COLUMNS =
  'id, presentation_id, team_id, team_name, section_name, leader_id, status, file_path, file_name, file_size, ' +
  'file_type, uploaded_by, submitted_at, score, remarks, graded_by, graded_at, created_at, updated_at';

export interface CaseGroupRow {
  id: string;
  presentation_id: string;
  team_id: string | null;
  team_name: string;
  section_name: string;
  leader_id: string | null;
  status: 'not_started' | 'draft' | 'submitted' | 'graded';
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: 'pdf' | 'pptx' | null;
  uploaded_by: string | null;
  submitted_at: string | null;
  score: number | string | null;
  remarks: string;
  graded_by: string | null;
  graded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseGroupMember {
  student_id: string;
  submission_id: string;
  name: string;
  picture_url: string | null;
  is_leader: boolean;
}

/** A group as the apps show it: who is in it, who leads, and its file and grade. */
export interface CaseGroupView {
  id: string;
  presentation_id: string;
  team_id: string | null;
  name: string;
  section_name: string;
  leader_id: string | null;
  leader_name: string | null;
  status: CaseGroupRow['status'];
  file: { name: string; size: number | null; type: 'pdf' | 'pptx'; uploaded_by_name: string | null } | null;
  submitted_at: string | null;
  late: boolean;
  score: number | null;
  remarks: string;
  graded_at: string | null;
  members: CaseGroupMember[];
}

/**
 * The groups of some presentations with their members, keyed by presentation.
 * `deadlines` gives each presentation's deadline, for marking late hand-ins.
 */
export async function loadCaseGroups(
  supabase: Supabase,
  deadlines: ReadonlyMap<string, string | null>,
  filter: { groupIds?: string[] } = {},
): Promise<{ groups: Map<string, CaseGroupView[]>; rows: Map<string, CaseGroupRow>; error: { code?: string } | null }> {
  const groups = new Map<string, CaseGroupView[]>();
  const rowsById = new Map<string, CaseGroupRow>();
  const ids = [...deadlines.keys()];
  if (ids.length === 0) return { groups, rows: rowsById, error: null };

  let query = supabase.from('case_presentation_groups').select(GROUP_COLUMNS).in('presentation_id', ids);
  if (filter.groupIds) query = query.in('id', filter.groupIds);
  const { data, error } = await query;
  if (error) return { groups, rows: rowsById, error };
  const rows = (data ?? []) as unknown as CaseGroupRow[];
  if (rows.length === 0) return { groups, rows: rowsById, error: null };

  const { data: subs, error: subsError } = await supabase
    .from('case_submissions')
    .select('id, student_id, group_id')
    .in('group_id', rows.map((r) => r.id));
  if (subsError) return { groups, rows: rowsById, error: subsError };
  const submissions = (subs ?? []) as { id: string; student_id: string; group_id: string }[];

  const userIds = [
    ...new Set([
      ...submissions.map((s) => s.student_id),
      ...rows.flatMap((r) => [r.leader_id, r.uploaded_by]).filter((v): v is string => !!v),
    ]),
  ];
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, name, picture_url').in('id', userIds)
    : { data: [] as { id: string; name: string | null; picture_url: string | null }[] };
  const userById = new Map(
    ((users ?? []) as { id: string; name: string | null; picture_url: string | null }[]).map((u) => [u.id, u]),
  );
  const nameOf = (id: string | null) => (id ? userById.get(id)?.name ?? null : null);

  for (const r of rows) {
    rowsById.set(r.id, r);
    const members = submissions
      .filter((s) => s.group_id === r.id)
      .map((s) => ({
        student_id: s.student_id,
        submission_id: s.id,
        name: nameOf(s.student_id) ?? 'Unknown student',
        picture_url: userById.get(s.student_id)?.picture_url ?? null,
        is_leader: s.student_id === r.leader_id,
      }))
      // The leader first, then by name.
      .sort((a, b) => Number(b.is_leader) - Number(a.is_leader) || a.name.localeCompare(b.name));
    const view: CaseGroupView = {
      id: r.id,
      presentation_id: r.presentation_id,
      team_id: r.team_id,
      name: r.team_name,
      section_name: r.section_name,
      leader_id: r.leader_id,
      leader_name: nameOf(r.leader_id),
      status: r.status,
      file:
        r.file_path && r.file_type
          ? { name: r.file_name ?? 'Presentation', size: r.file_size === null ? null : Number(r.file_size), type: r.file_type, uploaded_by_name: nameOf(r.uploaded_by) }
          : null,
      submitted_at: r.submitted_at,
      late: isLateSubmission(r.submitted_at, deadlines.get(r.presentation_id) ?? null),
      score: r.score === null ? null : Number(r.score),
      remarks: r.remarks ?? '',
      graded_at: r.graded_at,
      members,
    };
    groups.set(r.presentation_id, [...(groups.get(r.presentation_id) ?? []), view]);
  }
  for (const list of groups.values()) list.sort((a, b) => a.section_name.localeCompare(b.section_name) || a.name.localeCompare(b.name));
  return { groups, rows: rowsById, error: null };
}

/** Removes stored hand-ins; a failure is logged, never thrown, since the rows are what matter. */
export async function removeCaseFiles(supabase: Supabase, paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return;
  const { error } = await supabase.storage.from(CASE_BUCKET).remove(list);
  if (error) console.error('Failed to remove case presentation files', error);
}

/** A short-lived link to a group's file, with the viewer links for showing it in a page. */
export async function signedCaseFile(
  supabase: Supabase,
  row: Pick<CaseGroupRow, 'file_path' | 'file_name' | 'file_type'>,
  seconds = 60 * 30,
): Promise<{ url: string; embed: string; download: string } | null> {
  if (!row.file_path || !row.file_type) return null;
  const bucket = supabase.storage.from(CASE_BUCKET);
  const [{ data, error }, { data: dl }] = await Promise.all([
    bucket.createSignedUrl(row.file_path, seconds),
    bucket.createSignedUrl(row.file_path, seconds, { download: row.file_name ?? true }),
  ]);
  if (error || !data) {
    console.error('Failed to sign a case presentation file', error);
    return null;
  }
  const src = encodeURIComponent(data.signedUrl);
  return {
    url: data.signedUrl,
    // Browsers show a PDF themselves; PowerPoint goes through Microsoft's viewer.
    embed: row.file_type === 'pptx' ? `https://view.officeapps.live.com/op/embed.aspx?src=${src}` : data.signedUrl,
    download: dl?.signedUrl ?? data.signedUrl,
  };
}

/** The students a session may see submissions of; null means no limit. */
export async function scopedCaseStudents(supabase: Supabase, session: Session): Promise<Set<string> | null> {
  const ids = await getScopedStudentIds(supabase, session);
  return ids === null ? null : new Set(ids);
}

/** Whether the session may manage (edit, delete) a presentation. */
export function canManagePresentation(session: Session, presentation: { created_by: string | null }): boolean {
  return session.role === 'admin' || presentation.created_by === session.uid;
}

/**
 * A student's case presentation: their own submission row, the presentation
 * and their group. `missing` is set when it isn't theirs or doesn't exist.
 */
export async function loadStudentCase(
  supabase: Supabase,
  studentId: string,
  submissionId: string,
): Promise<
  | {
      missing?: undefined;
      submissionId: string;
      presentation: { id: string; title: string; instructions: string; deadline: string | null; created_by: string | null };
      group: CaseGroupView | null;
      row: CaseGroupRow | null;
    }
  | { missing: 'not_ready' | 'not_found' }
> {
  const { data, error } = await supabase
    .from('case_submissions')
    .select('id, student_id, group_id, case_presentations!inner(id, title, instructions, deadline, created_by)')
    .eq('id', submissionId)
    .maybeSingle();
  if (error) return { missing: isMissingCaseTables(error) ? 'not_ready' : 'not_found' };
  const sub = data as unknown as {
    id: string;
    student_id: string;
    group_id: string | null;
    case_presentations: { id: string; title: string; instructions: string; deadline: string | null; created_by: string | null };
  } | null;
  if (!sub || sub.student_id !== studentId) return { missing: 'not_found' };
  const presentation = sub.case_presentations;
  if (!sub.group_id) return { submissionId: sub.id, presentation, group: null, row: null };

  const loaded = await loadCaseGroups(supabase, new Map([[presentation.id, presentation.deadline]]), {
    groupIds: [sub.group_id],
  });
  if (loaded.error) return { missing: isMissingCaseTables(loaded.error) ? 'not_ready' : 'not_found' };
  return {
    submissionId: sub.id,
    presentation,
    group: loaded.groups.get(presentation.id)?.[0] ?? null,
    row: loaded.rows.get(sub.group_id) ?? null,
  };
}
