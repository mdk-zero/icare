import type { getSupabaseAdmin } from './supabase/server';
import { isMissingCaseTables } from './cases';
import { isLateSubmission } from './case-rubric';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

type GroupRow = {
  id: string;
  team_name: string;
  leader_id: string | null;
  status: string;
  file_name: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | string | null;
};

export interface StudentCase {
  /** The student's own submission record. */
  id: string;
  status: string;
  group_name: string;
  is_leader: boolean;
  file_name: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  score: number | null;
  updated_at: string;
  presentation: { id: string; title: string; instructions: string; deadline: string | null };
  late: boolean;
}

/**
 * The case presentations a student's groups report, open work first and the
 * soonest deadline first, graded ones last. Shared by the student's own list
 * and the instructor's view of a student. Empty before migration 056.
 */
export async function loadStudentCases(supabase: Supabase, studentId: string): Promise<StudentCase[]> {
  const { data, error } = await supabase
    .from('case_submissions')
    .select('id, group_id, updated_at, case_presentations!inner(id, title, instructions, deadline)')
    .eq('student_id', studentId);
  if (error) {
    if (isMissingCaseTables(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as unknown as {
    id: string;
    group_id: string | null;
    updated_at: string;
    case_presentations: StudentCase['presentation'];
  }[];

  const groupIds = [...new Set(rows.map((r) => r.group_id).filter((g): g is string => !!g))];
  const { data: groupData, error: groupError } = groupIds.length
    ? await supabase
        .from('case_presentation_groups')
        .select('id, team_name, leader_id, status, file_name, submitted_at, graded_at, score')
        .in('id', groupIds)
    : { data: [] as GroupRow[], error: null };
  if (groupError && !isMissingCaseTables(groupError)) throw groupError;
  const groupById = new Map(((groupData ?? []) as GroupRow[]).map((g) => [g.id, g]));

  return (
    rows
      // A case from before groups (093) has no group, and nothing to do.
      .filter((row) => row.group_id && groupById.has(row.group_id))
      .map((row) => {
        const p = row.case_presentations;
        const g = groupById.get(row.group_id!)!;
        return {
          id: row.id,
          status: g.status,
          group_name: g.team_name,
          is_leader: g.leader_id === studentId,
          file_name: g.file_name,
          submitted_at: g.submitted_at,
          graded_at: g.graded_at,
          score: g.status === 'graded' && g.score !== null ? Number(g.score) : null,
          updated_at: row.updated_at,
          presentation: p,
          late: isLateSubmission(g.submitted_at, p.deadline),
        };
      })
      // Open work first, soonest deadline first; graded cases sink.
      .sort((a, b) => {
        const done = (s: string) => (s === 'graded' ? 1 : 0);
        if (done(a.status) !== done(b.status)) return done(a.status) - done(b.status);
        const da = a.presentation.deadline ? Date.parse(a.presentation.deadline) : Infinity;
        const db = b.presentation.deadline ? Date.parse(b.presentation.deadline) : Infinity;
        return da - db;
      })
  );
}
