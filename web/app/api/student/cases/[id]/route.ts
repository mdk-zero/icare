import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadStudentCase, CASES_NOT_READY } from '@/app/lib/cases';
import { CASE_CRITERIA } from '@/app/lib/case-rubric';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/student/cases/:id — the student's group for this case presentation:
// its members and leader, the slides once uploaded, and the grade once final.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadStudentCase(supabase, session.uid, id);
    if (loaded.missing === 'not_ready') return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
    if (loaded.missing) return NextResponse.json({ error: 'Case presentation not found' }, { status: 404 });
    const { presentation, group } = loaded;

    const graded = group?.status === 'graded';
    let ratings: { criterion: string; level: number; remarks: string }[] = [];
    if (graded && group) {
      const { data } = await supabase.from('case_group_ratings').select('criterion, level, remarks').eq('group_id', group.id);
      ratings = (data ?? []) as typeof ratings;
    }

    return NextResponse.json({
      case: {
        id: loaded.submissionId,
        presentation: { id: presentation.id, title: presentation.title, instructions: presentation.instructions, deadline: presentation.deadline },
        group: group
          ? {
              ...group,
              // The grade only once it is final.
              score: graded ? group.score : null,
              remarks: graded ? group.remarks : '',
            }
          : null,
        status: group?.status ?? 'not_started',
        is_leader: !!group && group.leader_id === session.uid,
        ratings,
        criteria: CASE_CRITERIA,
      },
    });
  } catch (err) {
    console.error('Failed to load student case', err);
    return NextResponse.json({ error: 'Unable to load the case presentation' }, { status: 500 });
  }
}
