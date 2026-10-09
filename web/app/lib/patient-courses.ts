import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export interface PatientCourseOption {
  id: string;
  code: string;
  title: string;
}

/**
 * Which courses each patient belongs to (migration 069). An instructor
 * works only with the patients of the courses they are assigned to teach;
 * a Dean sees every patient and can file one under any of their courses.
 *
 * Before 069 is applied there is no link table: everything here then reads
 * as "no limit", so the ward behaves as it did before.
 */
export interface PatientCourseScope {
  /** False until 069 is applied; the form then hides the course picker. */
  enabled: boolean;
  /** Courses this viewer can file a patient under. */
  courses: PatientCourseOption[];
  /** Patients this viewer may see; null means every patient (a Dean, or before 069). */
  patientIds: string[] | null;
}

function missingTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205');
}

/** The courses a viewer can file patients under: the ones they teach, or own as Dean. */
async function viewerCourses(supabase: Supabase, uid: string, role: string): Promise<PatientCourseOption[]> {
  if (role === 'admin') {
    const { data, error } = await supabase
      .from('courses')
      .select('id, code, title')
      .eq('admin_id', uid)
      .order('code');
    if (error) throw new Error(`Unable to read courses: ${error.message}`);
    return (data ?? []) as PatientCourseOption[];
  }
  const { data, error } = await supabase
    .from('course_offerings')
    .select('courses(id, code, title)')
    .eq('faculty_id', uid);
  if (error) throw new Error(`Unable to read assigned courses: ${error.message}`);
  const byId = new Map<string, PatientCourseOption>();
  for (const row of data ?? []) {
    const course = (row as unknown as { courses: PatientCourseOption | PatientCourseOption[] | null }).courses;
    for (const c of Array.isArray(course) ? course : course ? [course] : []) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function getPatientCourseScope(
  supabase: Supabase,
  session: { uid: string; role: string },
): Promise<PatientCourseScope> {
  const probe = await supabase.from('patient_courses').select('patient_id').limit(1);
  if (missingTable(probe.error)) return { enabled: false, courses: [], patientIds: null };
  if (probe.error) throw new Error(`Unable to read patient courses: ${probe.error.message}`);

  const courses = await viewerCourses(supabase, session.uid, session.role);
  if (session.role === 'admin') return { enabled: true, courses, patientIds: null };

  if (courses.length === 0) return { enabled: true, courses, patientIds: [] };
  const { data, error } = await supabase
    .from('patient_courses')
    .select('patient_id')
    .in('course_id', courses.map((c) => c.id));
  if (error) throw new Error(`Unable to read patient courses: ${error.message}`);
  return { enabled: true, courses, patientIds: [...new Set((data ?? []).map((r) => r.patient_id as string))] };
}

/** True when this viewer may see the patient. */
export function canSeePatient(scope: PatientCourseScope, patientId: string): boolean {
  return scope.patientIds === null || scope.patientIds.includes(patientId);
}

/** patient id -> the ids of the courses it belongs to. */
export async function coursesByPatient(supabase: Supabase, patientIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (patientIds.length === 0) return map;
  const { data, error } = await supabase
    .from('patient_courses')
    .select('patient_id, course_id')
    .in('patient_id', patientIds);
  if (missingTable(error)) return map;
  if (error) throw new Error(`Unable to read patient courses: ${error.message}`);
  for (const row of data ?? []) {
    const list = map.get(row.patient_id as string) ?? [];
    list.push(row.course_id as string);
    map.set(row.patient_id as string, list);
  }
  return map;
}

/** The course ids a request asked for, or null when it didn't mention courses. */
export function parseCourseIds(body: Record<string, unknown>): string[] | null {
  if (!('course_ids' in body)) return null;
  const raw = body.course_ids;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()))];
}

/**
 * Checks the courses a viewer asked for. Returns an error message, or null
 * when they are fine. A patient must belong to at least one course, and a
 * viewer can only file it under courses they teach or own.
 */
export function courseIdsError(scope: PatientCourseScope, courseIds: string[]): string | null {
  if (!scope.enabled) return null;
  if (scope.courses.length === 0) {
    return 'You have no assigned courses yet, so you cannot add patients. Ask your Dean to assign you a course.';
  }
  if (courseIds.length === 0) return 'Choose at least one course for this patient.';
  const allowed = new Set(scope.courses.map((c) => c.id));
  if (courseIds.some((id) => !allowed.has(id))) return 'You can only add patients to courses you handle.';
  return null;
}

/**
 * Replaces a patient's links within the viewer's own courses. Links to
 * courses the viewer doesn't handle (a colleague's) are left alone.
 */
export async function savePatientCourses(
  supabase: Supabase,
  scope: PatientCourseScope,
  patientId: string,
  courseIds: string[],
  uid: string,
): Promise<void> {
  if (!scope.enabled) return;
  const mine = scope.courses.map((c) => c.id);
  const keep = new Set(courseIds);
  const drop = mine.filter((id) => !keep.has(id));
  if (drop.length) {
    const { error } = await supabase
      .from('patient_courses')
      .delete()
      .eq('patient_id', patientId)
      .in('course_id', drop);
    if (error) throw new Error(`Unable to update patient courses: ${error.message}`);
  }
  if (courseIds.length) {
    const { error } = await supabase
      .from('patient_courses')
      .upsert(
        courseIds.map((course_id) => ({ patient_id: patientId, course_id, added_by: uid })),
        { onConflict: 'patient_id,course_id', ignoreDuplicates: true },
      );
    if (error) throw new Error(`Unable to update patient courses: ${error.message}`);
  }
}
