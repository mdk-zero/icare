/**
 * Server helpers for hospital case presentations (migration 056): assigning a
 * presentation to sections, and deciding which submissions a faculty or admin
 * session may see.
 *
 * Like assessments, a faculty member giving a presentation to a section gives
 * it to their own group members there, not to the whole section — two
 * instructors can share a section.
 */
import type { getSupabaseAdmin } from './supabase/server';
import { getScopedStudentIds } from './admin-scope';
import { manageableSectionIds } from './teams';

type Supabase = ReturnType<typeof getSupabaseAdmin>;
type Session = { uid: string; role: string };

/** Before 056 is applied the tables don't exist; say so instead of a bare 500. */
export function isMissingCaseTables(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export const CASES_NOT_READY = 'Case presentations are not set up yet (migration 056 has not been applied).';

export const SUBMISSION_COLUMNS =
  'id, presentation_id, student_id, status, patient_initials, age, sex, hospital, ward, ' +
  'admitting_diagnosis, chief_complaint, history, medications, nursing_diagnoses, interventions, ' +
  'observations, submitted_at, graded_by, graded_at, score, remarks, created_at, updated_at';

export const PRESENTATION_COLUMNS =
  'id, title, instructions, deadline, section_ids, created_by, created_at, updated_at';

export type AssignResult =
  | { ok: true; added: string[]; total: number }
  | { ok: false; status: number; error: string; invalid?: string[] };

/** Who a presentation goes to: whole sections, groups, and students added to its course by hand. */
export interface CaseAudience {
  sectionIds: string[];
  teamIds?: string[];
  studentIds?: string[];
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
 * Each presentation's groups (075), "BSN 3101 · Group A", for the list and its
 * detail. Empty before 075, or for a presentation given to whole sections.
 */
export async function presentationGroups(
  supabase: Supabase,
  ids: string[],
): Promise<Map<string, { id: string; name: string; section_name: string }[]>> {
  const out = new Map<string, { id: string; name: string; section_name: string }[]>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from('case_presentations').select('id, team_ids').in('id', ids);
  if (error) return out;
  const rows = (data ?? []) as { id: string; team_ids: string[] | null }[];
  const teams = await loadTeams(supabase, [...new Set(rows.flatMap((r) => r.team_ids ?? []))]);
  const { data: sections } = teams.length
    ? await supabase.from('sections').select('id, name').in('id', [...new Set(teams.map((t) => t.section_id))])
    : { data: [] as { id: string; name: string }[] };
  const sectionName = new Map(((sections ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const r of rows) {
    out.set(
      r.id,
      (r.team_ids ?? [])
        .map((tid) => byId.get(tid))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => ({ id: t.id, name: t.name, section_name: sectionName.get(t.section_id) ?? '' })),
    );
  }
  return out;
}

/**
 * Creates a not-started submission for every in-scope student the
 * presentation goes to who does not already have one: the in-scope students
 * of whole sections, the members of the caller's groups, and students named
 * one by one (those added to the course). Existing rows — drafts, submitted
 * and graded cases — are never touched.
 */
export async function assignCasePresentation(
  supabase: Supabase,
  session: Session,
  presentation: { id: string; title: string },
  audience: string[] | CaseAudience,
): Promise<AssignResult> {
  const { sectionIds, teamIds = [], studentIds = [] } = Array.isArray(audience) ? { sectionIds: audience } : audience;
  if (sectionIds.length === 0 && teamIds.length === 0 && studentIds.length === 0) {
    return { ok: false, status: 400, error: 'Choose who gets this case presentation' };
  }

  if (session.role === 'faculty' && sectionIds.length > 0) {
    const own = new Set(await manageableSectionIds(supabase, session.role, session.uid));
    const outside = sectionIds.filter((id) => !own.has(id));
    if (outside.length > 0) {
      return { ok: false, status: 403, error: 'You can only assign to sections you handle', invalid: outside };
    }
  }

  if (sectionIds.length > 0) {
    const { data: sections, error: sectionError } = await supabase.from('sections').select('id').in('id', sectionIds);
    if (sectionError) console.error('Failed to resolve sections', sectionError);
    if ((sections ?? []).length !== sectionIds.length) {
      return { ok: false, status: 400, error: 'Section not found' };
    }
  }

  // Groups: an instructor's own; a Dean's in their sections.
  const teams = await loadTeams(supabase, teamIds);
  if (teams.length !== teamIds.length) return { ok: false, status: 400, error: 'Group not found' };
  if (session.role === 'faculty' && teams.some((t) => t.faculty_id !== session.uid)) {
    return { ok: false, status: 403, error: 'You can only give it to groups you supervise' };
  }

  const [{ data: sectionStudents, error: studentsError }, { data: members, error: membersError }] = await Promise.all([
    sectionIds.length
      ? supabase.from('users').select('id').eq('role', 'student').in('section_id', sectionIds).limit(5000)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    teamIds.length
      ? supabase.from('team_members').select('student_id').in('team_id', teamIds)
      : Promise.resolve({ data: [] as { student_id: string }[], error: null }),
  ]);
  if (studentsError || membersError) {
    console.error('Failed to resolve case presentation students', studentsError ?? membersError);
    return { ok: false, status: 500, error: 'Unable to assign the case presentation' };
  }

  const scope = await getScopedStudentIds(supabase, session);
  const inScope = scope ? new Set(scope) : null;
  const named = studentIds.filter((id) => !inScope || inScope.has(id));
  if (named.length !== studentIds.length) {
    return { ok: false, status: 403, error: 'Some students are not on your course roster' };
  }
  const targetIds = [
    ...new Set([
      ...((sectionStudents ?? []) as { id: string }[]).map((s) => s.id).filter((id) => !inScope || inScope.has(id)),
      ...((members ?? []) as { student_id: string }[]).map((m) => m.student_id),
      ...named,
    ]),
  ];
  if (targetIds.length === 0) {
    return { ok: false, status: 400, error: 'None of your students are in what you picked yet' };
  }

  const { data: existing } = await supabase
    .from('case_submissions')
    .select('student_id')
    .eq('presentation_id', presentation.id)
    .in('student_id', targetIds);
  const already = new Set((existing ?? []).map((r) => r.student_id as string));
  const added = targetIds.filter((id) => !already.has(id));

  if (added.length > 0) {
    const { error } = await supabase
      .from('case_submissions')
      .upsert(
        added.map((student_id) => ({ presentation_id: presentation.id, student_id })),
        { onConflict: 'presentation_id,student_id', ignoreDuplicates: true },
      );
    if (error) {
      console.error('Failed to assign case presentation', error);
      return { ok: false, status: 500, error: 'Unable to assign the case presentation' };
    }

    const { error: notifyError } = await supabase.from('notifications').insert(
      added.map((user_id) => ({
        user_id,
        type: 'assignment_created',
        title: 'New case presentation assigned',
        body: `Write up your most interesting hospital case for "${presentation.title}". Use the patient's initials only.`,
        data: { case_presentation_id: presentation.id },
      })),
    );
    if (notifyError) console.error('Failed to create case notifications', notifyError);
  }

  return { ok: true, added, total: targetIds.length };
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
