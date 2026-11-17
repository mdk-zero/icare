import type { getSupabaseAdmin } from './supabase/server';
import { TtlCache } from './ttl-cache';
import { onTableWrite } from './table-writes';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * A faculty member's sections and students, kept per server instance for
 * SCOPE_TTL_MS: nearly every instructor request asks for them, and the
 * students alone take up to six reads, four of them one after another. A
 * group move or a student added elsewhere shows here within that time, as
 * the session check's 30 s does (lib/auth/live-user); this instance's own
 * roster writes drop them at once (lib/table-writes). admin-scope keeps the
 * Dean's the same way.
 */
const SCOPE_TTL_MS = 30_000;
const sectionScope = new TtlCache<string[]>(SCOPE_TTL_MS, 1000);
const studentScope = new TtlCache<string[]>(SCOPE_TTL_MS, 1000);

/** The tables that decide whose students are whose. */
export const ROSTER_TABLES = [
  'teams',
  'team_members',
  'faculty_sections',
  'faculty_students',
  'course_offerings',
  'course_offering_sections',
  'course_offering_students',
  'sections',
  'users',
] as const;

/**
 * Whether a write moves anyone between scopes. A users write does only when
 * it adds or removes an account or sets its role, Dean or section; a sign-in
 * stamping last_login_at does not.
 */
export function changesScope(table: string, body: string | null): boolean {
  if (table !== 'users' || body === null) return true;
  return /"(role|admin_id|section_id)"\s*:/.test(body);
}

onTableWrite(ROSTER_TABLES, (table, body) => {
  if (!changesScope(table, body)) return;
  sectionScope.clear();
  studentScope.clear();
});

/**
 * Who a faculty member teaches is decided by groups. An admin splits each
 * section's students into groups (teams) and puts a faculty member in charge
 * of each one (teams.faculty_id, migration 051). A faculty member's students
 * are the members of the groups they supervise, and nobody else: a student in
 * no group, or in someone else's group, is not theirs to see, assign or grade.
 * Their sections are the sections those groups belong to.
 *
 * faculty_sections still records which sections an admin attached a faculty
 * member to, and the admin pages use it, but it no longer grants access to a
 * whole section's students.
 *
 * The function names are kept from the section-based model so every caller
 * picks up the rule without change.
 */

/** Postgres/PostgREST codes for a missing table or column (before 048/051). */
function isMissingSchema(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703' || error?.code === 'PGRST204';
}

/** The groups a faculty member supervises, with their sections. */
async function supervisedGroups(
  supabase: Supabase,
  facultyId: string,
): Promise<{ id: string; section_id: string }[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, section_id')
    .eq('faculty_id', facultyId);
  if (error) {
    // Before migrations 048/051 there are no supervised groups, so nobody.
    if (isMissingSchema(error)) return [];
    console.error('Failed to fetch supervised groups', error);
    throw new Error('Unable to fetch supervised groups');
  }
  return (data ?? []) as { id: string; section_id: string }[];
}

/** The sections of the groups the faculty member supervises (kept for SCOPE_TTL_MS). */
export async function getFacultySectionIds(supabase: Supabase, facultyId: string): Promise<string[]> {
  return [...(await sectionScope.fetch(facultyId, () => loadFacultySectionIds(supabase, facultyId)))];
}

async function loadFacultySectionIds(
  supabase: Supabase,
  facultyId: string,
): Promise<string[]> {
  const groups = await supervisedGroups(supabase, facultyId);
  return [...new Set(groups.map((g) => g.section_id))];
}

/**
 * The students on the faculty member's course rosters beyond their groups,
 * as loadOfferingRosters() counts them: everyone in a course section where
 * they supervise no group, and the students they added by hand (073). Empty
 * before the course tables exist.
 */
async function courseRosterStudentIds(
  supabase: Supabase,
  facultyId: string,
  groupSectionIds: Set<string>,
): Promise<string[]> {
  const offerings = await supabase.from('course_offerings').select('id').eq('faculty_id', facultyId);
  if (offerings.error) {
    if (isMissingSchema(offerings.error)) return [];
    throw offerings.error;
  }
  const offeringIds = (offerings.data ?? []).map((o) => o.id as string);
  if (offeringIds.length === 0) return [];

  const [links, added] = await Promise.all([
    supabase.from('course_offering_sections').select('section_id').in('offering_id', offeringIds),
    supabase.from('course_offering_students').select('student_id').in('offering_id', offeringIds),
  ]);
  if (links.error && !isMissingSchema(links.error)) throw links.error;
  if (added.error && !isMissingSchema(added.error)) throw added.error;
  const wholeSections = [
    ...new Set((links.data ?? []).map((l) => l.section_id as string).filter((id) => !groupSectionIds.has(id))),
  ];
  const ids = new Set((added.error ? [] : (added.data ?? [])).map((a) => a.student_id as string));
  if (wholeSections.length) {
    const { data, error } = await supabase.from('users').select('id').eq('role', 'student').in('section_id', wholeSections);
    if (error) throw error;
    for (const u of data ?? []) ids.add(u.id as string);
  }
  return [...ids];
}

/**
 * The faculty member's students: the members of the groups they supervise,
 * and the rest of their course rosters (a section where they supervise no
 * group, students added by hand). Kept for SCOPE_TTL_MS.
 */
export async function getFacultyStudentIds(supabase: Supabase, facultyId: string): Promise<string[]> {
  return [...(await studentScope.fetch(facultyId, () => loadFacultyStudentIds(supabase, facultyId)))];
}

async function loadFacultyStudentIds(
  supabase: Supabase,
  facultyId: string,
): Promise<string[]> {
  const groups = await supervisedGroups(supabase, facultyId);
  const fromCourses = courseRosterStudentIds(supabase, facultyId, new Set(groups.map((g) => g.section_id)));
  if (groups.length === 0) return fromCourses;

  const { data, error } = await supabase
    .from('team_members')
    .select('student_id, users!inner(role)')
    .in('team_id', groups.map((g) => g.id))
    .eq('users.role', 'student');
  if (error) {
    console.error('Failed to fetch group members', error);
    throw new Error('Unable to fetch group members');
  }
  return [...new Set([...(data ?? []).map((r) => r.student_id as string), ...(await fromCourses)])];
}

/**
 * Whether the student is one of the faculty member's: in a group they
 * supervise, or on one of their course rosters. Named for the old section
 * rule.
 */
export async function isStudentInFacultySections(
  supabase: Supabase,
  facultyId: string,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, teams!inner(faculty_id)')
    .eq('student_id', studentId)
    .eq('teams.faculty_id', facultyId)
    .limit(1);
  if (error) {
    if (!isMissingSchema(error)) console.error('Failed to check group membership', error);
    return false;
  }
  if ((data ?? []).length > 0) return true;
  // Not in their groups: on one of their course rosters instead?
  const groups = await supervisedGroups(supabase, facultyId);
  try {
    const ids = await courseRosterStudentIds(supabase, facultyId, new Set(groups.map((g) => g.section_id)));
    return ids.includes(studentId);
  } catch (err) {
    console.error('Failed to check course rosters', err);
    return false;
  }
}

/**
 * The faculty member who supervises the student's group, for notifications
 * about that student. Empty when the student is in no group or the group has
 * no supervisor.
 */
export async function getStudentSupervisorIds(
  supabase: Supabase,
  studentId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('teams!inner(faculty_id)')
    .eq('student_id', studentId);
  if (error) {
    if (!isMissingSchema(error)) console.error('Failed to read the student group supervisor', error);
    return [];
  }
  return [
    ...new Set(
      (data ?? [])
        .map((r) => (r.teams as unknown as { faculty_id: string | null } | null)?.faculty_id)
        .filter((id): id is string => !!id),
    ),
  ];
}
