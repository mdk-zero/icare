import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  scopedCaseStudents,
  isMissingCaseTables,
  CASES_NOT_READY,
  PRESENTATION_COLUMNS,
  SUBMISSION_COLUMNS,
} from '@/app/lib/cases';
import { CASE_CRITERIA, caseScore, allCriteriaRated, isCaseCriterion, isLateSubmission } from '@/app/lib/case-rubric';
import { isTaskRating, MAX_REMARKS_LENGTH, scoreDescriptor, type TaskRating } from '@/app/lib/task-ratings';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;
type Session = { uid: string; role: string };

/** The submission, if this session may see it; otherwise the response to send. */
async function loadSubmission(supabase: Supabase, session: Session, id: string) {
  const { data, error } = await supabase.from('case_submissions').select(SUBMISSION_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    if (isMissingCaseTables(error)) return { response: NextResponse.json({ error: CASES_NOT_READY }, { status: 503 }) };
    return { response: NextResponse.json({ error: 'Submission not found' }, { status: 404 }) };
  }
  if (!data) return { response: NextResponse.json({ error: 'Submission not found' }, { status: 404 }) };
  const submission = data as unknown as Record<string, unknown> & { id: string; student_id: string; status: string; presentation_id: string };

  const scope = await scopedCaseStudents(supabase, session);
  if (scope && !scope.has(submission.student_id)) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { submission };
}

async function loadRatings(supabase: Supabase, submissionId: string) {
  const { data } = await supabase
    .from('case_submission_ratings')
    .select('criterion, rating, remarks, rated_by, rated_at')
    .eq('submission_id', submissionId);
  return (data ?? []) as { criterion: string; rating: TaskRating; remarks: string; rated_by: string | null; rated_at: string }[];
}

// GET /api/faculty/cases/submissions/:id — the full case, its ratings and the rubric.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadSubmission(supabase, session, id);
    if (loaded.response) return loaded.response;
    const submission = loaded.submission;

    const [{ data: presentation }, { data: student }, ratings] = await Promise.all([
      supabase.from('case_presentations').select(PRESENTATION_COLUMNS).eq('id', submission.presentation_id).single(),
      supabase.from('users').select('id, name, section_id').eq('id', submission.student_id).single(),
      loadRatings(supabase, id),
    ]);
    const deadline = (presentation as unknown as { deadline: string | null } | null)?.deadline ?? null;

    return NextResponse.json({
      submission: {
        ...submission,
        score: submission.score === null ? null : Number(submission.score),
        late: isLateSubmission(submission.submitted_at as string | null, deadline),
      },
      presentation,
      student,
      ratings,
      criteria: CASE_CRITERIA,
    });
  } catch (err) {
    console.error('Failed to load case submission', err);
    return NextResponse.json({ error: 'Unable to load the case' }, { status: 500 });
  }
}

// PUT /api/faculty/cases/submissions/:id
//   { ratings?: { [criterion]: rating | null }, rating_remarks?: { [criterion]: string },
//     remarks?: string, finalize?: boolean }
// Saves the grading in progress; finalize locks it in once every criterion is rated.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { ratings, rating_remarks, remarks, finalize } = body as Record<string, unknown>;

  const ratingInput = typeof ratings === 'object' && ratings !== null ? (ratings as Record<string, unknown>) : {};
  const remarkInput =
    typeof rating_remarks === 'object' && rating_remarks !== null ? (rating_remarks as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(ratingInput)) {
    if (!isCaseCriterion(key)) return NextResponse.json({ error: `Unknown criterion: ${key}` }, { status: 400 });
    if (value !== null && !isTaskRating(value)) {
      return NextResponse.json({ error: `Invalid rating for ${key}` }, { status: 400 });
    }
  }
  for (const key of Object.keys(remarkInput)) {
    if (!isCaseCriterion(key)) return NextResponse.json({ error: `Unknown criterion: ${key}` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadSubmission(supabase, session, id);
    if (loaded.response) return loaded.response;
    const submission = loaded.submission;

    if (submission.status === 'graded') {
      return NextResponse.json({ error: 'This case has already been graded' }, { status: 409 });
    }
    if (submission.status !== 'submitted') {
      return NextResponse.json({ error: 'The student has not handed this case in yet' }, { status: 409 });
    }

    const existing = await loadRatings(supabase, id);
    const current = new Map(existing.map((r) => [r.criterion, r]));
    const now = new Date().toISOString();

    const cleared = Object.entries(ratingInput).filter(([, v]) => v === null).map(([k]) => k);
    const touched = new Set([
      ...Object.keys(ratingInput).filter((k) => ratingInput[k] !== null),
      ...Object.keys(remarkInput),
    ]);

    const upserts: Record<string, unknown>[] = [];
    for (const key of touched) {
      if (cleared.includes(key)) continue;
      const rating = (ratingInput[key] as TaskRating | undefined) ?? current.get(key)?.rating;
      // A remark on a criterion that has no rating yet has nothing to hang on.
      if (!rating) continue;
      const remark =
        key in remarkInput
          ? String(remarkInput[key] ?? '').trim().slice(0, MAX_REMARKS_LENGTH)
          : current.get(key)?.remarks ?? '';
      upserts.push({ submission_id: id, criterion: key, rating, remarks: remark, rated_by: session.uid, rated_at: now });
    }

    if (cleared.length > 0) {
      const { error } = await supabase.from('case_submission_ratings').delete().eq('submission_id', id).in('criterion', cleared);
      if (error) throw error;
    }
    if (upserts.length > 0) {
      const { error } = await supabase.from('case_submission_ratings').upsert(upserts, { onConflict: 'submission_id,criterion' });
      if (error) throw error;
    }

    const update: Record<string, unknown> = {};
    if (remarks !== undefined) update.remarks = String(remarks ?? '').trim().slice(0, MAX_REMARKS_LENGTH);

    const after = await loadRatings(supabase, id);
    const ratingMap = new Map(after.map((r) => [r.criterion, r.rating]));
    const score = caseScore(ratingMap);

    if (finalize === true) {
      if (!allCriteriaRated(ratingMap)) {
        return NextResponse.json({ error: 'Rate every criterion before finalizing' }, { status: 400 });
      }
      Object.assign(update, { status: 'graded', score, graded_by: session.uid, graded_at: now });
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from('case_submissions').update(update).eq('id', id).eq('status', 'submitted');
      if (error) throw error;
    }

    if (finalize === true) {
      const { data: presentation } = await supabase
        .from('case_presentations')
        .select('title')
        .eq('id', submission.presentation_id)
        .single();
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: submission.student_id,
        type: 'performance_validated',
        title: 'Case presentation graded',
        body: `Your case for "${presentation?.title ?? 'your case presentation'}" was graded: ${scoreDescriptor(score)} (${score}%).`,
        data: { case_submission_id: id, case_presentation_id: submission.presentation_id },
      });
      if (notifyError) console.error('Failed to notify student of case grade', notifyError);

      await logAudit(
        session,
        {
          action: 'case.grade',
          entityType: 'case_submissions',
          entityId: id,
          details: { student_id: submission.student_id, score, ratings: Object.fromEntries(ratingMap) },
        },
        request,
      );
    }

    return NextResponse.json({ ok: true, ratings: after, score, status: finalize === true ? 'graded' : submission.status });
  } catch (err) {
    console.error('Failed to grade case submission', err);
    return NextResponse.json({ error: 'Unable to save the grading' }, { status: 500 });
  }
}
