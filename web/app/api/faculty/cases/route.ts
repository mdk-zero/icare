import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  assignCasePresentation,
  scopedCaseStudents,
  isMissingCaseTables,
  CASES_NOT_READY,
  PRESENTATION_COLUMNS,
} from '@/app/lib/cases';
import { isLateSubmission } from '@/app/lib/case-rubric';
import { parseDeadline } from '@/app/lib/deadline-input';

const MAX_TITLE = 200;
const MAX_INSTRUCTIONS = 4000;

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))];
}

type SubmissionSummary = { presentation_id: string; student_id: string; status: string; submitted_at: string | null };

// GET /api/faculty/cases
// The presentations this session can see — ones they created, or that any of
// their students were given — each with a roster tally over their own students.
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const scope = await scopedCaseStudents(supabase, session);

    let submissions: SubmissionSummary[] = [];
    if (scope === null || scope.size > 0) {
      let query = supabase.from('case_submissions').select('presentation_id, student_id, status, submitted_at');
      if (scope) query = query.in('student_id', [...scope]);
      const { data, error } = await query.limit(10000);
      if (error) {
        if (isMissingCaseTables(error)) return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
        throw error;
      }
      submissions = (data ?? []) as SubmissionSummary[];
    }

    const ids = new Set(submissions.map((s) => s.presentation_id));
    let presQuery = supabase.from('case_presentations').select(PRESENTATION_COLUMNS).order('created_at', { ascending: false });
    if (scope !== null) {
      // Their own presentations show up even before anyone is on the roster.
      const idList = [...ids];
      presQuery = idList.length > 0
        ? presQuery.or(`created_by.eq.${session.uid},id.in.(${idList.join(',')})`)
        : presQuery.eq('created_by', session.uid);
    }
    const { data: presentations, error: presError } = await presQuery;
    if (presError) {
      if (isMissingCaseTables(presError)) return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
      throw presError;
    }

    const sectionIds = [...new Set((presentations ?? []).flatMap((p) => (p.section_ids as string[]) ?? []))];
    const { data: sections } = sectionIds.length
      ? await supabase.from('sections').select('id, name').in('id', sectionIds)
      : { data: [] as { id: string; name: string }[] };
    const sectionName = new Map((sections ?? []).map((s) => [s.id, s.name]));

    const result = (presentations ?? []).map((p) => {
      const roster = submissions.filter((s) => s.presentation_id === p.id);
      const count = (status: string) => roster.filter((s) => s.status === status).length;
      return {
        ...p,
        sections: ((p.section_ids as string[]) ?? []).map((id) => ({ id, name: sectionName.get(id) ?? 'Unknown' })),
        counts: {
          total: roster.length,
          not_started: count('not_started'),
          draft: count('draft'),
          submitted: count('submitted'),
          graded: count('graded'),
          late: roster.filter((s) => isLateSubmission(s.submitted_at, p.deadline as string | null)).length,
        },
      };
    });

    return NextResponse.json({ presentations: result });
  } catch (err) {
    console.error('Failed to list case presentations', err);
    return NextResponse.json({ error: 'Unable to load case presentations' }, { status: 500 });
  }
}

// POST /api/faculty/cases  { title, instructions?, deadline?, section_ids }
// Creates the presentation and gives it to the caller's students in those sections.
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { title, instructions, deadline, section_ids } = body as Record<string, unknown>;

  const titleValue = typeof title === 'string' ? title.trim() : '';
  if (!titleValue) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (titleValue.length > MAX_TITLE) {
    return NextResponse.json({ error: `Title must be at most ${MAX_TITLE} characters` }, { status: 400 });
  }
  const instructionsValue = typeof instructions === 'string' ? instructions.trim().slice(0, MAX_INSTRUCTIONS) : '';
  // Every activity has a deadline: it is what attendance is measured against.
  const deadlineCheck = parseDeadline(deadline);
  if (!deadlineCheck.ok) return NextResponse.json({ error: deadlineCheck.error }, { status: 400 });
  const sectionIds = uniqueStrings(section_ids);
  if (sectionIds.length === 0) return NextResponse.json({ error: 'Select at least one section' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();

    const { data: presentation, error } = await supabase
      .from('case_presentations')
      .insert({
        title: titleValue,
        instructions: instructionsValue,
        deadline: deadlineCheck.value,
        section_ids: sectionIds,
        created_by: session.uid,
      })
      .select(PRESENTATION_COLUMNS)
      .single();
    if (error || !presentation) {
      if (isMissingCaseTables(error)) return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
      console.error('Failed to create case presentation', error);
      return NextResponse.json({ error: 'Unable to create the case presentation' }, { status: 500 });
    }

    const assigned = await assignCasePresentation(supabase, session, presentation as unknown as { id: string; title: string }, sectionIds);
    if (!assigned.ok) {
      // Nobody could be given it, so don't leave an empty shell behind.
      await supabase.from('case_presentations').delete().eq('id', (presentation as unknown as { id: string }).id);
      return NextResponse.json({ error: assigned.error, invalid: assigned.invalid }, { status: assigned.status });
    }

    const created = presentation as unknown as { id: string };
    await logAudit(
      session,
      {
        action: 'case.create',
        entityType: 'case_presentations',
        entityId: created.id,
        details: { title: titleValue, section_ids: sectionIds, student_count: assigned.total },
      },
      request,
    );

    return NextResponse.json({ presentation, student_count: assigned.total }, { status: 201 });
  } catch (err) {
    console.error('Failed to create case presentation', err);
    return NextResponse.json({ error: 'Unable to create the case presentation' }, { status: 500 });
  }
}
