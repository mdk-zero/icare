import type { getSupabaseAdmin } from './supabase/server';
import { getFacultySectionIds, getFacultyStudentIds } from './roster';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * What one admin looks after (migration 053). Every admin has their own
 * faculty: the faculty accounts whose users.admin_id is theirs. From those
 * follow the admin's sections, which are the sections their faculty are
 * attached to or supervise a group in, plus any section no faculty is
 * attached to yet so a new section can be set up. Their students are the
 * students in those sections, plus students not in a section yet.
 *
 * Rooms and patients are not part of it; they stay shared.
 *
 * `null` means no limit: before 053 is applied there is no owner column, and
 * every admin keeps seeing everything, as before.
 */
export interface AdminScope {
  facultyIds: string[];
  sectionIds: string[];
  studentIds: string[];
}

export async function getAdminScope(supabase: Supabase, adminId: string): Promise<AdminScope | null> {
  const { data: faculty, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'faculty')
    .eq('admin_id', adminId);
  if (error) {
    // 42703: no admin_id column yet (053 not applied).
    if (error.code === '42703' || error.code === 'PGRST204') return null;
    console.error('Failed to read the admin faculty', error);
    throw new Error('Unable to read your faculty');
  }
  const facultyIds = (faculty ?? []).map((f) => f.id as string);

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
    console.error('Failed to read the admin sections', failed);
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
    console.error('Failed to read the admin students', inSections.error ?? unsectioned.error);
    throw new Error('Unable to read your students');
  }
  const studentIds = [
    ...new Set([...(inSections.data ?? []), ...(unsectioned.data ?? [])].map((u) => u.id as string)),
  ];

  return { facultyIds, sectionIds, studentIds };
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

/** The accounts an admin may see on the Users page: themselves, their faculty and their students. */
export function adminVisibleUserIds(scope: AdminScope, adminId: string): string[] {
  return [adminId, ...scope.facultyIds, ...scope.studentIds];
}
