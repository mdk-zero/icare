import type { getSupabaseAdmin } from './supabase/server';
import { changesScope, getFacultySectionIds, getFacultyStudentIds, ROSTER_TABLES } from './roster';
import { TtlCache } from './ttl-cache';
import { onTableWrite } from './table-writes';
import { deanFor, deanOwnershipLive, deanTeamIds } from './dean-scope';
import { assignedInstructorIds } from './program-chairs';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * What one admin (Dean) looks after. Every Dean has their own faculty: the
 * faculty accounts whose users.admin_id is theirs (migration 053). Since 077
 * sections and students carry their Dean too (sections.admin_id,
 * users.admin_id), so a Dean's sections and students are simply the ones
 * they own, and nothing is shared with another Dean. Rooms, patients and
 * the rest are owned the same way; see ./dean-scope.
 *
 * Before 077 the sections are derived instead: the sections their faculty
 * are attached to or supervise a group in, plus any section no faculty is
 * attached to yet, and the students in them plus students in no section.
 *
 * `null` means no limit: before 053 is applied there is no owner column, and
 * every admin keeps seeing everything, as before.
 *
 * A Program Chair gets their Dean's scope (see deanFor): the same people.
 */
export interface AdminScope {
  /** The Dean and their Program Chairs, who all run this space. */
  leaderIds: string[];
  facultyIds: string[];
  sectionIds: string[];
  studentIds: string[];
}

/**
 * Kept per server instance for 30 s, as lib/roster keeps an instructor's:
 * every Dean request asks, and it takes two or three reads. This instance's
 * own roster writes drop it at once.
 */
const adminScopes = new TtlCache<AdminScope | null>(30_000, 500);

onTableWrite(ROSTER_TABLES, (table, body) => {
  if (changesScope(table, body)) adminScopes.clear();
});

/** A Program Chair's assigned instructors (100); null for a Dean, or before 100. */
const chairAssignments = new TtlCache<string[] | null>(30_000, 500);
onTableWrite(['program_chair_instructors', 'users'], () => chairAssignments.clear());

async function chairInstructors(supabase: Supabase, adminId: string): Promise<string[] | null> {
  return chairAssignments.fetch(adminId, async () => {
    const { data, error } = await supabase.from('users').select('admin_title').eq('id', adminId).maybeSingle();
    if (error || data?.admin_title !== 'program_chair') return null;
    return assignedInstructorIds(supabase, adminId);
  });
}

/**
 * A Program Chair sees their Dean's space narrowed to the instructors the Dean
 * assigned them: those instructors, the sections they supervise groups in, and
 * the students in their groups and course rosters.
 */
async function narrowToChair(supabase: Supabase, scope: AdminScope, assigned: string[]): Promise<AdminScope> {
  const mine = new Set(assigned);
  const facultyIds = scope.facultyIds.filter((id) => mine.has(id));
  const [sections, students] = await Promise.all([
    Promise.all(facultyIds.map((id) => getFacultySectionIds(supabase, id))),
    Promise.all(facultyIds.map((id) => getFacultyStudentIds(supabase, id))),
  ]);
  const sectionSet = new Set(sections.flat());
  const studentSet = new Set(students.flat());
  return {
    leaderIds: scope.leaderIds,
    facultyIds,
    sectionIds: scope.sectionIds.filter((id) => sectionSet.has(id)),
    studentIds: scope.studentIds.filter((id) => studentSet.has(id)),
  };
}

export async function getAdminScope(supabase: Supabase, adminId: string): Promise<AdminScope | null> {
  const deanId = await deanFor(supabase, adminId);
  const scope = await adminScopes.fetch(deanId, () => loadAdminScope(supabase, deanId));
  if (!scope) return scope;
  const copy = {
    leaderIds: [...scope.leaderIds],
    facultyIds: [...scope.facultyIds],
    sectionIds: [...scope.sectionIds],
    studentIds: [...scope.studentIds],
  };
  // Only a linked Program Chair is narrowed; an unlinked one already sees just their own.
  if (deanId === adminId) return copy;
  const assigned = await chairInstructors(supabase, adminId);
  return assigned ? narrowToChair(supabase, copy, assigned) : copy;
}

async function loadAdminScope(supabase: Supabase, adminId: string): Promise<AdminScope | null> {
  const { data: faculty, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'faculty')
    .eq('admin_id', adminId);
  if (error) {
    // 42703: no admin_id column yet (053 not applied).
    if (error.code === '42703' || error.code === 'PGRST204') return null;
    console.error('Failed to read the dean instructors', error);
    throw new Error('Unable to read your instructors');
  }
  const facultyIds = (faculty ?? []).map((f) => f.id as string);

  if (await deanOwnershipLive(supabase)) {
    const [sections, students, leaderIds] = await Promise.all([
      supabase.from('sections').select('id').eq('admin_id', adminId),
      supabase.from('users').select('id').eq('role', 'student').eq('admin_id', adminId).limit(5000),
      deanTeamIds(supabase, adminId),
    ]);
    if (sections.error || students.error) {
      console.error('Failed to read the dean sections and students', sections.error ?? students.error);
      throw new Error('Unable to read your sections');
    }
    return {
      leaderIds,
      facultyIds,
      sectionIds: (sections.data ?? []).map((s) => s.id as string),
      studentIds: (students.data ?? []).map((u) => u.id as string),
    };
  }

  const [links, groups, allLinks, allSections] = await Promise.all([
    facultyIds.length
      ? supabase.from('faculty_sections').select('section_id').in('faculty_id', facultyIds)
      : Promise.resolve({ data: [], error: null }),
    facultyIds.length
      ? supabase.from('teams').select('section_id').in('faculty_id', facultyIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('faculty_sections').select('section_id'),
    supabase.from('sections').select('id'),
  ]);
  const failed = links.error ?? allLinks.error ?? allSections.error;
  if (failed) {
    console.error('Failed to read the dean sections', failed);
    throw new Error('Unable to read your sections');
  }

  const claimed = new Set((allLinks.data ?? []).map((l) => l.section_id as string));
  const sectionIds = [
    ...new Set([
      ...(links.data ?? []).map((l) => l.section_id as string),
      // Groups need 048/051; a failed read just adds nothing.
      ...(groups.error ? [] : (groups.data ?? []).map((g) => g.section_id as string)),
      ...(allSections.data ?? []).map((s) => s.id as string).filter((id) => !claimed.has(id)),
    ]),
  ];

  const [inSections, unsectioned] = await Promise.all([
    sectionIds.length
      ? supabase.from('users').select('id').eq('role', 'student').in('section_id', sectionIds).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('users').select('id').eq('role', 'student').is('section_id', null).limit(5000),
  ]);
  if (inSections.error || unsectioned.error) {
    console.error('Failed to read the dean students', inSections.error ?? unsectioned.error);
    throw new Error('Unable to read your students');
  }
  const studentIds = [
    ...new Set([...(inSections.data ?? []), ...(unsectioned.data ?? [])].map((u) => u.id as string)),
  ];

  return { leaderIds: [adminId], facultyIds, sectionIds, studentIds };
}

/**
 * The students a faculty or admin session may see: a faculty member's group
 * members, an admin's students, or null for no limit (an admin before 053).
 */
export async function getScopedStudentIds(
  supabase: Supabase,
  session: { uid: string; role: string },
): Promise<string[] | null> {
  if (session.role === 'faculty') return getFacultyStudentIds(supabase, session.uid);
  if (session.role === 'admin') return (await getAdminScope(supabase, session.uid))?.studentIds ?? null;
  return [];
}

/** The sections a faculty or admin session may see, or null for no limit. */
export async function getScopedSectionIds(
  supabase: Supabase,
  session: { uid: string; role: string },
): Promise<string[] | null> {
  if (session.role === 'faculty') return getFacultySectionIds(supabase, session.uid);
  if (session.role === 'admin') return (await getAdminScope(supabase, session.uid))?.sectionIds ?? null;
  return [];
}

/** Whether a faculty or admin session may see this student. */
export async function canSeeStudent(
  supabase: Supabase,
  session: { uid: string; role: string },
  studentId: string,
): Promise<boolean> {
  const ids = await getScopedStudentIds(supabase, session);
  return ids === null || ids.includes(studentId);
}

/** Whether the admin owns this faculty account (always true before 053). */
export function ownsFaculty(scope: AdminScope | null, facultyId: string): boolean {
  return scope === null || scope.facultyIds.includes(facultyId);
}

/** The accounts an admin may see on the Users page: themselves, the Dean and Program Chairs they work with, their faculty and their students. */
export function adminVisibleUserIds(scope: AdminScope, adminId: string): string[] {
  return [...new Set([adminId, ...scope.leaderIds, ...scope.facultyIds, ...scope.studentIds])];
}
