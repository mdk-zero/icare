/**
 * Changing a saved scenario grade needs an admin's say-so.
 *
 * A faculty member who wants to edit a completed scenario asks their admin
 * (users.admin_id, migration 053; every admin when they have none) with a
 * reason. Like sign-up page account requests, the request lives only in the
 * approvers' notifications: one copy each, sharing `request_id`, with the
 * decision written onto every copy so the others lose their buttons.
 *
 * An accepted request unlocks one edit of that one grade. Saving the edit
 * (the finalize route) uses it up, so the next change needs a new request.
 * Admins grade without asking: they are the ones who would approve it.
 */
import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const GRADE_EDIT_REQUEST = 'grade_edit_request';
export const GRADE_EDIT_DECISION = 'grade_edit_decision';
export const MAX_REASON_LENGTH = 500;

export type GradeEditStatus = 'pending' | 'accepted' | 'declined';

export interface GradeEditRequestData {
  kind: typeof GRADE_EDIT_REQUEST;
  request_id: string;
  status: GradeEditStatus;
  assignment_id: string;
  faculty_id: string;
  faculty_name: string;
  student_name: string;
  scenario_title: string;
  reason: string;
  requested_at: string;
  resolved_by?: string;
  resolved_by_name?: string;
  resolved_at?: string;
  /** Set on every copy when the approved edit is saved. */
  used_at?: string;
}

/** Only faculty ask; admins may change a saved grade outright. */
export const needsEditApproval = (role: string) => role === 'faculty';

/** Every copy of the faculty member's newest request for this grade (one per approver). */
export async function latestGradeEditRequest(
  supabase: Supabase,
  assignmentId: string,
  facultyId: string,
): Promise<{ ids: string[]; data: GradeEditRequestData } | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, data, created_at')
    .eq('data->>kind', GRADE_EDIT_REQUEST)
    .eq('data->>assignment_id', assignmentId)
    .eq('data->>faculty_id', facultyId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const newest = (rows[0].data as GradeEditRequestData).request_id;
  const copies = rows.filter((r) => (r.data as GradeEditRequestData).request_id === newest);
  return { ids: copies.map((r) => r.id as string), data: copies[0].data as GradeEditRequestData };
}

/** An accepted request not used yet: the faculty member may change this saved grade. */
export async function activeGradeEditApproval(
  supabase: Supabase,
  assignmentId: string,
  facultyId: string,
): Promise<{ ids: string[]; data: GradeEditRequestData } | null> {
  const latest = await latestGradeEditRequest(supabase, assignmentId, facultyId);
  return latest && latest.data.status === 'accepted' && !latest.data.used_at ? latest : null;
}

/** Marks an approval spent once its edit is saved. */
export async function spendGradeEditApproval(
  supabase: Supabase,
  approval: { ids: string[]; data: GradeEditRequestData },
): Promise<void> {
  const data = { ...approval.data, used_at: new Date().toISOString() };
  const { error } = await supabase.from('notifications').update({ data }).in('id', approval.ids);
  if (error) console.error('Failed to mark grade edit approval used', error);
}

export const EDIT_NEEDS_APPROVAL =
  'This grade is saved. Ask your dean for permission before changing it.';
