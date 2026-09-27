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
import { getFacultySectionIds } from './roster';

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

/**
 * Creates a not-started submission for every in-scope student of the given
 * sections who does not already have one. Existing rows — drafts, submitted
 * and graded cases — are never touched.
 */
export async function assignCasePresentation(
  supabase: Supabase,
  session: Session,
  presentation: { id: string; title: string },
  sectionIds: string[],
): Promise<AssignResult> {
  if (sectionIds.length === 0) return { ok: false, status: 400, error: 'Select at least one section' };

  if (session.role === 'faculty') {
    const own = new Set(await getFacultySectionIds(supabase, session.uid));
    const outside = sectionIds.filter((id) => !own.has(id));
    if (outside.length > 0) {
      return { ok: false, status: 403, error: 'You can only assign to sections you handle', invalid: outside };
    }
  }

  const { data: sections, error: sectionError } = await supabase
    .from('sections')
    .select('id')
    .in('id', sectionIds);
  if (sectionError) console.error('Failed to resolve sections', sectionError);
  if ((sections ?? []).length !== sectionIds.length) {
    return { ok: false, status: 400, error: 'Section not found' };
  }

  const { data: sectionStudents, error: studentsError } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'student')
    .in('section_id', sectionIds)
    .limit(5000);
  if (studentsError) {
    console.error('Failed to resolve section students', studentsError);
    return { ok: false, status: 500, error: 'Unable to assign the case presentation' };
  }

  const scope = await getScopedStudentIds(supabase, session);
  const inScope = scope ? new Set(scope) : null;
  const targetIds = (sectionStudents ?? [])
    .map((s) => s.id as string)
    .filter((id) => !inScope || inScope.has(id));
  if (targetIds.length === 0) {
    return { ok: false, status: 400, error: 'None of your students are in the selected sections yet' };
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
