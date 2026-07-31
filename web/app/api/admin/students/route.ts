import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

/**
 * Cohort roster with per-student performance aggregates for the admin
 * Student Management page: submitted-attempt counts and averages plus the
 * latest ML risk flag.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [studentsRes, attemptsRes, predictionsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, name, picture_url, created_at, last_login_at, section_id, sections(name)')
        .eq('role', 'student')
        .order('name'),
      supabase
        .from('assessment_attempts')
        .select('student_id, score')
        .eq('status', 'submitted'),
      supabase
        .from('performance_predictions')
        .select('student_id, risk, predicted_at')
        .order('predicted_at', { ascending: false }),
    ]);

    if (studentsRes.error) {
      console.error('Failed to list students', studentsRes.error);
      return NextResponse.json({ error: 'Unable to list students' }, { status: 500 });
    }

    const totals = new Map<string, { count: number; sum: number }>();
    for (const a of attemptsRes.data ?? []) {
      const t = totals.get(a.student_id) ?? { count: 0, sum: 0 };
      t.count += 1;
      t.sum += a.score ?? 0;
      totals.set(a.student_id, t);
    }

    // Predictions are ordered newest-first; keep only the latest per student.
    const latestRisk = new Map<string, string>();
    for (const p of predictionsRes.data ?? []) {
      if (!latestRisk.has(p.student_id)) latestRisk.set(p.student_id, p.risk);
    }

    const students = (studentsRes.data ?? []).map((s) => {
      const t = totals.get(s.id);
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        picture_url: s.picture_url,
        created_at: s.created_at,
        last_login_at: s.last_login_at,
        quizzes_completed: t?.count ?? 0,
        average_score: t && t.count > 0 ? Math.round(t.sum / t.count) : null,
        at_risk: latestRisk.get(s.id) === 'at_risk',
        section_id: s.section_id ?? null,
        section: (s as unknown as { sections: { name: string } | null }).sections?.name ?? null,
      };
    });

    return NextResponse.json({ students });
  } catch (err) {
    console.error('List students failed', err);
    return NextResponse.json({ error: 'Unable to list students' }, { status: 500 });
  }
}

/** A roster selection is a screenful at most; the cap is a sanity bound. */
const MAX_BATCH_DELETE = 200;

/**
 * Removes several student accounts at once from the roster. Every table that
 * points at a student cascades, so attempts, predictions and assignments go
 * with the account.
 *
 * The `role = 'student'` filter is the real guard: this endpoint cannot be
 * used to delete a faculty or admin account, whatever ids are posted.
 */
export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ids } = body as { ids?: unknown };
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id)) {
    return NextResponse.json({ error: 'ids must be an array of student ids' }, { status: 400 });
  }

  const unique = [...new Set(ids as string[])];
  if (unique.length === 0) {
    return NextResponse.json({ error: 'Select at least one student' }, { status: 400 });
  }
  if (unique.length > MAX_BATCH_DELETE) {
    return NextResponse.json(
      { error: `Cannot delete more than ${MAX_BATCH_DELETE} students at once` },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // Resolved before the delete: the names are needed for the audit trail, and
    // the count tells the caller how many of its ids were actually students.
    const { data: targets, error: lookupError } = await supabase
      .from('users')
      .select('id, email, name')
      .in('id', unique)
      .eq('role', 'student');

    if (lookupError) {
      console.error('Failed to look up students for deletion', lookupError);
      return NextResponse.json({ error: 'Unable to delete students' }, { status: 500 });
    }
    if (!targets || targets.length === 0) {
      return NextResponse.json({ error: 'No matching students found' }, { status: 404 });
    }

    const targetIds = targets.map((t) => t.id);
    const { error } = await supabase.from('users').delete().in('id', targetIds);
    if (error) {
      console.error('Failed to delete students', error);
      return NextResponse.json({ error: 'Unable to delete students' }, { status: 500 });
    }

    // One entry per student rather than one for the batch, so the trail can
    // still be searched by the account that disappeared.
    await Promise.all(
      targets.map((t) =>
        logAudit(
          session,
          {
            action: 'user.delete',
            entityType: 'users',
            entityId: t.id,
            details: { email: t.email, name: t.name, role: 'student', batch: targets.length },
          },
          request,
        ),
      ),
    );

    return NextResponse.json({
      deleted: targetIds.length,
      skipped: unique.length - targetIds.length,
    });
  } catch (err) {
    console.error('Batch delete students failed', err);
    return NextResponse.json({ error: 'Unable to delete students' }, { status: 500 });
  }
}
