import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingCaseTables } from '@/app/lib/cases';
import { isLateSubmission } from '@/app/lib/case-rubric';

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

// GET /api/student/cases — the case presentations the student's groups report.
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('case_submissions')
      .select('id, group_id, updated_at, case_presentations!inner(id, title, instructions, deadline)')
      .eq('student_id', session.uid);
    if (error) {
      // Before 056 there is nothing to show, not an error for the student.
      if (isMissingCaseTables(error)) return NextResponse.json({ cases: [] });
      throw error;
    }
    const rows = (data ?? []) as unknown as {
      id: string;
      group_id: string | null;
      updated_at: string;
      case_presentations: { id: string; title: string; instructions: string; deadline: string | null };
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

    const cases = rows
      // A case from before groups (093) has no group, and nothing to do.
      .filter((row) => row.group_id && groupById.has(row.group_id))
      .map((row) => {
        const p = row.case_presentations;
        const g = groupById.get(row.group_id!)!;
        return {
          id: row.id,
          status: g.status,
          group_name: g.team_name,
          is_leader: g.leader_id === session.uid,
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
      });

    return NextResponse.json({ cases });
  } catch (err) {
    console.error('Failed to list student cases', err);
    return NextResponse.json({ error: 'Unable to load your cases' }, { status: 500 });
  }
}
