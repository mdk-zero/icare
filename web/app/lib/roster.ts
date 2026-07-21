import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Faculty-student connection is section-based: a faculty member handles the
 * sections listed in faculty_sections, and their students are every user with
 * role 'student' whose section_id is one of those sections.
 */

export async function getFacultySectionIds(
  supabase: Supabase,
  facultyId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('faculty_sections')
    .select('section_id')
    .eq('faculty_id', facultyId);

  if (error) {
    console.error('Failed to fetch faculty sections', error);
    throw new Error('Unable to fetch faculty sections');
  }
  return (data ?? []).map((r) => r.section_id);
}

export async function getFacultyStudentIds(
  supabase: Supabase,
  facultyId: string,
): Promise<string[]> {
  const sectionIds = await getFacultySectionIds(supabase, facultyId);
  if (sectionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'student')
    .in('section_id', sectionIds)
    .limit(5000);

  if (error) {
    console.error('Failed to fetch section students', error);
    throw new Error('Unable to fetch section students');
  }
  return (data ?? []).map((r) => r.id);
}

/** Whether the student's section is one the faculty member handles. */
export async function isStudentInFacultySections(
  supabase: Supabase,
  facultyId: string,
  studentId: string,
): Promise<boolean> {
  const { data: student } = await supabase
    .from('users')
    .select('section_id')
    .eq('id', studentId)
    .maybeSingle();

  if (!student?.section_id) return false;

  const { data: link } = await supabase
    .from('faculty_sections')
    .select('id')
    .eq('faculty_id', facultyId)
    .eq('section_id', student.section_id)
    .maybeSingle();

  return Boolean(link);
}
