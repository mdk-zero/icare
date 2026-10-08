import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isStudentInFacultySections } from '@/app/lib/roster';
import { logAudit } from '@/app/lib/audit';
import { readJson, requireRole } from '@/app/lib/courses';
import { loadActivityAttendance } from '@/app/lib/activity-attendance';
import { EXCUSES_NEED_MIGRATION, isMissingExcusesTable, parseExcuse, type ActivityKind } from '@/app/lib/attendance';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const KINDS: readonly ActivityKind[] = ['scenario', 'assessment', 'case_presentation'];
const NOT_ABSENT = 'Only an absence can be excused';

/** The student's row for one activity, as it stands now. */
async function currentRow(studentId: string, kind: ActivityKind, activityId: string) {
  const { rows } = await loadActivityAttendance(getSupabaseAdmin(), [studentId]);
  return rows.find((r) => r.kind === kind && r.activity_id === activityId) ?? null;
}

/** Faculty only, and only for a student in a group they supervise. */
async function access(params: RouteParams['params']) {
  const { session, response } = await requireRole('faculty');
  if (response) return { response };
  const { id: studentId } = await params;
  if (!(await isStudentInFacultySections(getSupabaseAdmin(), session.uid, studentId))) {
    return { response: NextResponse.json({ error: 'Student not found' }, { status: 404 }) };
  }
  return { session, studentId };
}

/** POST { kind, activity_id, reason }: excuse an absence. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const a = await access(params);
  if (a.response) return a.response;
  const { session, studentId } = a;

  const parsed = parseExcuse(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { kind, activity_id, reason } = parsed.value;

  try {
    const row = await currentRow(studentId, kind, activity_id);
    if (!row) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    if (row.status !== 'absent') return NextResponse.json({ error: NOT_ABSENT }, { status: 409 });

    const { data, error } = await getSupabaseAdmin()
      .from('activity_excuses')
      .insert({ student_id: studentId, activity_kind: kind, activity_id, reason, excused_by: session.uid })
      .select('id')
      .single();
    if (error) {
      if (isMissingExcusesTable(error)) return NextResponse.json({ error: EXCUSES_NEED_MIGRATION }, { status: 503 });
      // Excused a moment ago, by this instructor in another tab or by another.
      if (error.code === '23505') return NextResponse.json({ error: NOT_ABSENT }, { status: 409 });
      throw error;
    }

    await logAudit(
      session,
      {
        action: 'attendance.excuse',
        entityType: 'activity_excuses',
        entityId: data.id as string,
        details: { student_id: studentId, kind, activity_id, title: row.title, reason },
      },
      request,
    );
    return NextResponse.json({ row: await currentRow(studentId, kind, activity_id) });
  } catch (err) {
    console.error('Unable to excuse the absence', err);
    return NextResponse.json({ error: 'Unable to excuse the absence' }, { status: 500 });
  }
}

/** DELETE { kind, activity_id }: undo an excuse; the absence stands again. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const a = await access(params);
  if (a.response) return a.response;
  const { session, studentId } = a;

  const body = await readJson(request);
  const kind = body?.kind as ActivityKind;
  const activityId = body?.activity_id;
  if (!KINDS.includes(kind) || typeof activityId !== 'string' || !activityId) {
    return NextResponse.json({ error: 'Choose an activity' }, { status: 400 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('activity_excuses')
      .delete()
      .eq('student_id', studentId)
      .eq('activity_kind', kind)
      .eq('activity_id', activityId)
      .select('id, reason');
    if (error) {
      if (isMissingExcusesTable(error)) return NextResponse.json({ error: EXCUSES_NEED_MIGRATION }, { status: 503 });
      throw error;
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Excuse not found' }, { status: 404 });

    const row = await currentRow(studentId, kind, activityId);
    await logAudit(
      session,
      {
        action: 'attendance.unexcuse',
        entityType: 'activity_excuses',
        entityId: data[0].id as string,
        details: { student_id: studentId, kind, activity_id: activityId, title: row?.title ?? null, reason: data[0].reason },
      },
      request,
    );
    return NextResponse.json({ row });
  } catch (err) {
    console.error('Unable to undo the excuse', err);
    return NextResponse.json({ error: 'Unable to undo the excuse' }, { status: 500 });
  }
}
