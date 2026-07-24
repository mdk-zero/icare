import type { getSupabaseAdmin } from './supabase/server';
import type { SessionPayload } from './auth/session';
import { getFacultySectionIds } from './roster';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Shared scope + alert derivation for the faculty dashboard
 * (/api/faculty/dashboard and /api/faculty/alerts), so the "Active Alerts"
 * tile and the "Pending Alerts" table can never disagree about the count.
 */

export interface ScopedStudent {
  id: string;
  name: string;
  email: string;
}

/**
 * The students a dashboard should cover: for faculty the ones in the sections
 * they handle, for admin every student.
 */
export async function getScopedStudents(
  supabase: Supabase,
  session: SessionPayload,
): Promise<ScopedStudent[]> {
  let query = supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'student')
    .order('name');

  if (session.role === 'faculty') {
    const sectionIds = await getFacultySectionIds(supabase, session.uid);
    if (sectionIds.length === 0) return [];
    query = query.in('section_id', sectionIds);
  }

  const { data, error } = await query.limit(5000);
  if (error) {
    console.error('Failed to scope students', error);
    throw new Error('Unable to fetch students');
  }
  return data ?? [];
}

/** Latest prediction per student, newest first, deduped in memory. */
export async function getLatestRiskByStudent(
  supabase: Supabase,
  studentIds: string[],
): Promise<Map<string, { risk: string; probability: number | null; predicted_at: string }>> {
  const latest = new Map<string, { risk: string; probability: number | null; predicted_at: string }>();
  if (studentIds.length === 0) return latest;

  const { data, error } = await supabase
    .from('performance_predictions')
    .select('student_id, risk, probability, predicted_at')
    .in('student_id', studentIds)
    .order('predicted_at', { ascending: false })
    .limit(5000);

  if (error) {
    console.error('Failed to fetch predictions', error);
    return latest;
  }
  for (const row of data ?? []) {
    if (!latest.has(row.student_id)) {
      latest.set(row.student_id, {
        risk: row.risk,
        probability: row.probability,
        predicted_at: row.predicted_at,
      });
    }
  }
  return latest;
}

/**
 * When each student was last seen doing anything the system records — a
 * submitted attempt, a vitals entry, or a progress note. Newest wins.
 */
export async function getLastActivityByStudent(
  supabase: Supabase,
  studentIds: string[],
): Promise<Map<string, string>> {
  const last = new Map<string, string>();
  if (studentIds.length === 0) return last;

  const keep = (id: string | null, at: string | null) => {
    if (!id || !at) return;
    const current = last.get(id);
    if (!current || at > current) last.set(id, at);
  };

  const [attempts, vitals, notes] = await Promise.all([
    supabase
      .from('assessment_attempts')
      .select('student_id, submitted_at, created_at')
      .in('student_id', studentIds)
      .limit(5000),
    supabase
      .from('vital_sign_readings')
      .select('recorded_by, recorded_at')
      .in('recorded_by', studentIds)
      .limit(5000),
    supabase
      .from('progress_notes')
      .select('author_id, created_at')
      .in('author_id', studentIds)
      .limit(5000),
  ]);

  for (const row of attempts.data ?? []) keep(row.student_id, row.submitted_at ?? row.created_at);
  for (const row of vitals.data ?? []) keep(row.recorded_by, row.recorded_at);
  for (const row of notes.data ?? []) keep(row.author_id, row.created_at);

  return last;
}

export interface FacultyAlertRow {
  id: string;
  student_id: string;
  student_name: string;
  alert_type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
}

const ASSISTANCE_STATUS: Record<string, FacultyAlertRow['status']> = {
  open: 'pending',
  acknowledged: 'reviewed',
  resolved: 'resolved',
};

/**
 * There is no `alerts` table — an alert is a view over the three signals that
 * actually mean "a faculty member should look at this student":
 * an unresolved assistance request, an at-risk ML prediction, and a vitals
 * reading the anomaly detector flagged.
 *
 * Only assistance requests carry a real workflow state; the other two are
 * standing flags, so they report as pending until the underlying data changes.
 */
export async function buildFacultyAlerts(
  supabase: Supabase,
  students: ScopedStudent[],
): Promise<FacultyAlertRow[]> {
  if (students.length === 0) return [];

  const ids = students.map((s) => s.id);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const alerts: FacultyAlertRow[] = [];

  const [assistance, anomalies, risks] = await Promise.all([
    supabase
      .from('assistance_requests')
      .select('id, student_id, message, status, created_at')
      .in('student_id', ids)
      .neq('status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('vital_sign_readings')
      .select('id, recorded_by, anomaly_reasons, recorded_at')
      .in('recorded_by', ids)
      .eq('is_anomaly', true)
      .order('recorded_at', { ascending: false })
      .limit(100),
    getLatestRiskByStudent(supabase, ids),
  ]);

  for (const row of assistance.data ?? []) {
    alerts.push({
      id: `assist-${row.id}`,
      student_id: row.student_id,
      student_name: nameOf.get(row.student_id) ?? 'Unknown student',
      alert_type: 'Assistance Request',
      severity: row.status === 'open' ? 'high' : 'medium',
      description: row.message?.trim() || 'Student raised a help flag during simulation.',
      status: ASSISTANCE_STATUS[row.status] ?? 'pending',
      created_at: row.created_at,
    });
  }

  for (const [studentId, prediction] of risks) {
    if (prediction.risk !== 'at_risk') continue;
    const pct = prediction.probability != null ? Math.round(prediction.probability * 100) : null;
    alerts.push({
      id: `risk-${studentId}`,
      student_id: studentId,
      student_name: nameOf.get(studentId) ?? 'Unknown student',
      alert_type: 'At-Risk Prediction',
      severity: 'high',
      description: pct != null
        ? `ML model flagged this student at risk (${pct}% probability).`
        : 'ML model flagged this student at risk.',
      status: 'pending',
      created_at: prediction.predicted_at,
    });
  }

  for (const row of anomalies.data ?? []) {
    const reasons = Array.isArray(row.anomaly_reasons) ? row.anomaly_reasons : [];
    alerts.push({
      id: `vitals-${row.id}`,
      student_id: row.recorded_by,
      student_name: nameOf.get(row.recorded_by) ?? 'Unknown student',
      alert_type: 'Vitals Anomaly',
      severity: 'medium',
      description: reasons.length > 0
        ? `Out-of-range vitals recorded: ${reasons.map(String).join(', ')}.`
        : 'Out-of-range vitals recorded.',
      status: 'pending',
      created_at: row.recorded_at,
    });
  }

  return alerts.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
