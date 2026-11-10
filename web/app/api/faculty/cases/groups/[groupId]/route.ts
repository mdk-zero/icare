import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  loadCaseGroups,
  scopedCaseStudents,
  signedCaseFile,
  isMissingCaseTables,
  CASES_NOT_READY,
  PRESENTATION_COLUMNS,
} from '@/app/lib/cases';
import { CASE_CRITERIA, caseScore, allCriteriaRated, isCaseCriterion, isCaseLevel } from '@/app/lib/case-rubric';
import { MAX_REMARKS_LENGTH, scoreDescriptor } from '@/app/lib/task-ratings';
import { ownsRow, viewerDeanId } from '@/app/lib/dean-scope';
import { insertNotifications } from '@/app/lib/notify';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;
type Session = { uid: string; role: string };

type Presentation = { id: string; title: string; instructions: string; deadline: string | null; created_by: string | null };

/** The group with its presentation, if this session may grade it; otherwise the response to send. */
async function loadGroup(supabase: Supabase, session: Session, groupId: string) {
  const { data, error } = await supabase
    .from('case_presentation_groups')
    .select('id, presentation_id')
    .eq('id', groupId)
    .maybeSingle();
  if (error) {
    if (isMissingCaseTables(error)) return { response: NextResponse.json({ error: CASES_NOT_READY }, { status: 503 }) };
    return { response: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  }
  if (!data) return { response: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  const presentationId = (data as { presentation_id: string }).presentation_id;

  const { data: p } = await supabase.from('case_presentations').select(PRESENTATION_COLUMNS).eq('id', presentationId).single();
  const presentation = p as unknown as Presentation | null;
  if (!presentation || !(await ownsRow(supabase, 'case_presentations', presentationId, await viewerDeanId(supabase, session)))) {
    return { response: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  }

  const loaded = await loadCaseGroups(supabase, new Map([[presentationId, presentation.deadline]]), { groupIds: [groupId] });
  if (loaded.error) throw loaded.error;
  const group = loaded.groups.get(presentationId)?.[0];
  const row = loaded.rows.get(groupId);
  if (!group || !row) return { response: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };

  // An instructor grades the groups their students are in, or that they set.
  const scope = await scopedCaseStudents(supabase, session);
  if (scope && presentation.created_by !== session.uid && !group.members.some((m) => scope.has(m.student_id))) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { group, row, presentation };
}

async function loadRatings(supabase: Supabase, groupId: string) {
  const { data } = await supabase
    .from('case_group_ratings')
    .select('criterion, level, remarks, rated_by, rated_at')
    .eq('group_id', groupId);
  return (data ?? []) as { criterion: string; level: number; remarks: string; rated_by: string | null; rated_at: string }[];
}

// GET /api/faculty/cases/groups/:groupId — the group, its file, its ratings and the rubric.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { groupId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadGroup(supabase, session, groupId);
    if (loaded.response) return loaded.response;
    const [ratings, file] = await Promise.all([loadRatings(supabase, groupId), signedCaseFile(supabase, loaded.row)]);

    return NextResponse.json({
      group: loaded.group,
      presentation: loaded.presentation,
      file_url: file,
      ratings,
      criteria: CASE_CRITERIA,
    });
  } catch (err) {
    console.error('Failed to load case group', err);
    return NextResponse.json({ error: 'Unable to load the group' }, { status: 500 });
  }
}

// PUT /api/faculty/cases/groups/:groupId
//   { ratings?: { [criterion]: 1–4 | null }, rating_remarks?: { [criterion]: string },
//     remarks?: string, finalize?: boolean }
// Saves the grading in progress; finalize locks it in once every criterion is
// rated, and gives every member the group's score.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { groupId } = await params;

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
    if (value !== null && !isCaseLevel(value)) {
      return NextResponse.json({ error: `Invalid level for ${key}` }, { status: 400 });
    }
  }
  for (const key of Object.keys(remarkInput)) {
    if (!isCaseCriterion(key)) return NextResponse.json({ error: `Unknown criterion: ${key}` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadGroup(supabase, session, groupId);
    if (loaded.response) return loaded.response;
    const { group, presentation } = loaded;

    if (group.status === 'graded') {
      return NextResponse.json({ error: 'This group has already been graded' }, { status: 409 });
    }
    if (group.status !== 'submitted') {
      return NextResponse.json({ error: 'The group leader has not handed in the slides yet' }, { status: 409 });
    }

    const existing = await loadRatings(supabase, groupId);
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
      const level = (ratingInput[key] as number | undefined) ?? current.get(key)?.level;
      // A remark on a criterion that has no level yet has nothing to hang on.
      if (!level) continue;
      const remark =
        key in remarkInput
          ? String(remarkInput[key] ?? '').trim().slice(0, MAX_REMARKS_LENGTH)
          : current.get(key)?.remarks ?? '';
      upserts.push({ group_id: groupId, criterion: key, level, remarks: remark, rated_by: session.uid, rated_at: now });
    }

    if (cleared.length > 0) {
      const { error } = await supabase.from('case_group_ratings').delete().eq('group_id', groupId).in('criterion', cleared);
      if (error) throw error;
    }
    if (upserts.length > 0) {
      const { error } = await supabase.from('case_group_ratings').upsert(upserts, { onConflict: 'group_id,criterion' });
      if (error) throw error;
    }

    const update: Record<string, unknown> = {};
    if (remarks !== undefined) update.remarks = String(remarks ?? '').trim().slice(0, MAX_REMARKS_LENGTH);

    const after = await loadRatings(supabase, groupId);
    const levels = new Map(after.map((r) => [r.criterion, r.level]));
    const score = caseScore(levels);

    if (finalize === true) {
      if (!allCriteriaRated(levels)) {
        return NextResponse.json({ error: 'Rate every criterion before finalizing' }, { status: 400 });
      }
      Object.assign(update, { status: 'graded', score, graded_by: session.uid, graded_at: now });
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('case_presentation_groups')
        .update(update)
        .eq('id', groupId)
        .eq('status', 'submitted');
      if (error) throw error;
    }

    if (finalize === true) {
      // Every member's own record carries the group's grade.
      const { error: mirrorError } = await supabase
        .from('case_submissions')
        .update({
          status: 'graded',
          score,
          graded_by: session.uid,
          graded_at: now,
          remarks: (update.remarks as string | undefined) ?? group.remarks,
        })
        .eq('group_id', groupId);
      if (mirrorError) throw mirrorError;

      const { error: notifyError } = await insertNotifications(
        supabase,
        group.members.map((m) => ({
          user_id: m.student_id,
          type: 'performance_validated',
          title: 'Case presentation graded',
          body: `${group.name}'s case presentation "${presentation.title}" was graded: ${scoreDescriptor(score)} (${score}%).`,
          data: { case_submission_id: m.submission_id, case_presentation_id: presentation.id },
        })),
      );
      if (notifyError) console.error('Failed to notify the group of its case grade', notifyError);

      await logAudit(
        session,
        {
          action: 'case.grade',
          entityType: 'case_presentation_groups',
          entityId: groupId,
          details: {
            presentation_id: presentation.id,
            members: group.members.map((m) => m.student_id),
            score,
            ratings: Object.fromEntries(levels),
          },
        },
        request,
      );
    }

    return NextResponse.json({ ok: true, ratings: after, score, status: finalize === true ? 'graded' : group.status });
  } catch (err) {
    console.error('Failed to grade case group', err);
    return NextResponse.json({ error: 'Unable to save the grading' }, { status: 500 });
  }
}
