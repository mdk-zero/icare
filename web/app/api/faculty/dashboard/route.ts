import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  getScopedStudents,
  getLatestRiskByStudent,
  buildFacultyAlerts,
  buildFacultyOverview,
} from '@/app/lib/faculty-dashboard';

/**
 * Faculty landing-page figures, scoped to the sections the caller handles
 * (admins see every student). Replaces the hardcoded numbers the dashboard
 * used to ship with.
 *
 * `recent_activities` mirrors /api/faculty/audit: faculty see their own trail,
 * admins see everyone's — less sign-ins and page views, which are most of the
 * trail and none of what anyone wants to see on arrival.
 *
 * `overview` carries the rest of the landing page: see buildFacultyOverview.
 */

/** Trail entries that record looking or arriving, not doing. */
const NOISE = /^(login|logout|view[_ .])/i;
const ACTIVITY_SHOWN = 8;

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string } | null;
}

function detailsText(details: Record<string, unknown> | null): string {
  if (!details) return '';
  if (typeof details.message === 'string') return details.message;
  return Object.entries(details)
    .filter(([key, value]) => key !== 'migrated_from' && key !== 'actor_name' && value != null)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(', ');
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const students = await getScopedStudents(supabase, session);
    const ids = students.map((s) => s.id);

    let auditQuery = supabase
      .from('audit_logs')
      .select('id, actor_id, action, details, created_at, actor:users(name)')
      .order('created_at', { ascending: false })
      .limit(40);
    if (session.role === 'faculty') {
      auditQuery = auditQuery.eq('actor_id', session.uid);
    }

    const [risks, alerts, assignments, reviewed, audit] = await Promise.all([
      getLatestRiskByStudent(supabase, ids),
      buildFacultyAlerts(supabase, students),
      ids.length > 0
        ? supabase.from('scenario_assignments').select('status').in('student_id', ids).limit(5000)
        : Promise.resolve({ data: [] as { status: string }[] }),
      ids.length > 0
        ? supabase
            .from('progress_notes')
            .select('id', { count: 'exact', head: true })
            .in('author_id', ids)
            .not('reviewed_at', 'is', null)
        : Promise.resolve({ count: 0 }),
      auditQuery,
    ]);

    let atRisk = 0;
    for (const prediction of risks.values()) {
      if (prediction.risk === 'at_risk') atRisk += 1;
    }

    const overview = await buildFacultyOverview(supabase, session, students, risks, alerts);

    const statuses = (assignments.data ?? []).map((a) => a.status);
    const stats = {
      total_students: students.length,
      at_risk_students: atRisk,
      active_alerts: alerts.filter((a) => a.status !== 'resolved').length,
      completed_reviews: reviewed.count ?? 0,
      active_scenarios: statuses.filter((s) => s === 'pending' || s === 'in_progress').length,
      pending_scenarios: statuses.filter((s) => s === 'pending').length,
      awaiting_review: overview.review_queue.total,
      overdue_assignments: overview.overdue_assignments,
      students_behind: overview.students_behind,
    };

    const recent_activities = ((audit.data ?? []) as unknown as AuditRow[])
      .filter((row) => !NOISE.test(row.action))
      .slice(0, ACTIVITY_SHOWN)
      .map((row) => ({
        id: row.id,
        faculty_id: row.actor_id ?? '',
        faculty_name: row.actor?.name ?? 'System',
        tab: 'overview',
        action: row.action,
        details: detailsText(row.details),
        // The structured form too, so the feed can phrase entries it knows.
        metadata: row.details,
        created_at: row.created_at,
      }));

    return NextResponse.json({ stats, recent_activities, overview });
  } catch (err) {
    console.error('Fetch faculty dashboard failed', err);
    return NextResponse.json({ error: 'Unable to fetch dashboard' }, { status: 500 });
  }
}
