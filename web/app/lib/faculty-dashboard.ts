import type { getSupabaseAdmin } from './supabase/server';
import { summarizeAnomalyReasons } from './vitals/rules';
import type { SessionPayload } from './auth/session';
import { getFacultySectionIds, getFacultyStudentIds } from './roster';

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
  section_id: string | null;
  picture_url: string | null;
  sex: 'male' | 'female' | null;
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
    .select('id, name, email, section_id, picture_url, sex')
    .eq('role', 'student')
    .order('name');

  if (session.role === 'faculty') {
    // Only the members of the groups they supervise.
    const studentIds = await getFacultyStudentIds(supabase, session.uid);
    if (studentIds.length === 0) return [];
    query = query.in('id', studentIds);
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
    // Stored as JSONB objects, so String(reason) yields "[object Object]" —
    // read the message off each one, and keep the recommendation for the alert
    // so faculty see the advised action, not just the abnormal number.
    const reasons = summarizeAnomalyReasons(row.anomaly_reasons);
    alerts.push({
      id: `vitals-${row.id}`,
      student_id: row.recorded_by,
      student_name: nameOf.get(row.recorded_by) ?? 'Unknown student',
      alert_type: 'Vitals Anomaly',
      // A critical reading outranks a merely out-of-range one; flattening both
      // to "medium" hid the readings that actually needed attention first.
      severity: reasons.critical ? 'high' : 'medium',
      description: reasons.text || 'Out-of-range vitals recorded.',
      status: 'pending',
      created_at: row.recorded_at,
    });
  }

  return alerts.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// -------------------------------------------------------------------
// The faculty overview: what needs a faculty member's attention today
// -------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** "Recent" performance looks back this far, and compares with the span before it. */
const RECENT_DAYS = 14;
/** Weeks of history on each section's trace. */
const TRACE_WEEKS = 8;
/** How far ahead "due soon" looks. */
const DUE_SOON_DAYS = 7;
/** A recent quiz average under this flags a student. */
const LOW_AVERAGE = 60;
/** No recorded activity for this long flags a student. */
const INACTIVE_DAYS = 7;
/** PostgREST caps a response at 1000 rows; ask for pages of that size. */
const PAGE = 1000;

/**
 * Every row a query matches, a page at a time, so nothing is silently cut off
 * at the row cap. The row shape is asserted here rather than inferred: the
 * client types a many-to-one embed (`scenarios(title)`) as an array, though
 * PostgREST returns it as a single object.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** The Monday (UTC) starting the week `ms` falls in, as the analytics trend buckets it. */
function weekStart(ms: number): number {
  const d = new Date(ms);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

export interface OverviewSection {
  id: string;
  name: string;
  students: number;
  at_risk: number;
  /** Assignments past their deadline and not handed in. */
  overdue: number;
  /** Share of assignments already due that were handed in, 0–100; null if none are due yet. */
  completion: number | null;
  /** Quiz average over the last RECENT_DAYS, and over the RECENT_DAYS before that. */
  avg_recent: number | null;
  avg_prior: number | null;
  /** Weekly quiz average, oldest first, one entry per week; null for a week with no attempts. */
  weekly: { week_start: string; average: number | null }[];
}

export interface AttentionStudent {
  id: string;
  name: string;
  section: string | null;
  picture_url: string | null;
  sex: 'male' | 'female' | null;
  risk: string | null;
  probability: number | null;
  overdue: number;
  recent_avg: number | null;
  last_activity: string | null;
  open_assistance: number;
}

export interface ReviewItem {
  assignment_id: string;
  student_id: string;
  student_name: string;
  scenario_title: string;
  submitted_at: string;
}

export interface DutyShift {
  id: string;
  label: string | null;
  shift_type: string;
  starts_at: string;
  ends_at: string;
  section: string | null;
  room: string | null;
  rostered: number;
  /** Present or late. */
  checked_in: number;
  absent: number;
}

export interface DueItem {
  kind: 'scenario' | 'quiz';
  id: string;
  title: string;
  deadline: string;
  /** Students who have not handed it in yet. */
  open: number;
}

export interface FacultyOverview {
  sections: OverviewSection[];
  /** The students most in need of a look, most urgent first. */
  attention: AttentionStudent[];
  attention_total: number;
  review_queue: { total: number; items: ReviewItem[] };
  upcoming_shifts: DutyShift[];
  due_soon: DueItem[];
  overdue_assignments: number;
  students_behind: number;
  cohort_avg_recent: number | null;
  cohort_avg_prior: number | null;
  /** When the ML model last scored any of these students. */
  scored_at: string | null;
}

interface ScenarioAssignmentRow {
  id: string;
  student_id: string;
  status: string;
  deadline: string | null;
  submitted_at: string | null;
  scenario_id: string;
  scenarios: { title: string } | null;
}

interface QuizAssignmentRow {
  id: string;
  student_id: string;
  status: string;
  deadline: string | null;
  assessment_id: string;
  assessments: { title: string } | null;
}

interface ShiftRow {
  id: string;
  label: string | null;
  shift_type: string;
  starts_at: string;
  ends_at: string;
  section_id: string | null;
  rooms: { name: string; room_number: string } | null;
  shift_assignments: { attendance_status: string }[];
}

/**
 * Everything the faculty landing page shows beyond the headline counts, from
 * one pass over the data: a ranked list of students who need a look, each
 * section's recent performance and trend, the review queue, upcoming duty,
 * and what falls due this week.
 *
 * `risks` and `alerts` are passed in because the route has already built them
 * for the headline counts.
 */
export async function buildFacultyOverview(
  supabase: Supabase,
  session: SessionPayload,
  students: ScopedStudent[],
  risks: Map<string, { risk: string; probability: number | null; predicted_at: string }>,
  alerts: FacultyAlertRow[],
): Promise<FacultyOverview> {
  const now = Date.now();
  const ids = students.map((s) => s.id);

  // Faculty see their own sections even when one is still empty; admins see
  // the sections their students are in.
  const sectionIds =
    session.role === 'faculty'
      ? await getFacultySectionIds(supabase, session.uid)
      : [...new Set(students.map((s) => s.section_id).filter((id): id is string => Boolean(id)))];

  const traceFrom = weekStart(now) - (TRACE_WEEKS - 1) * 7 * DAY_MS;
  const attemptsFrom = Math.min(traceFrom, now - 2 * RECENT_DAYS * DAY_MS);

  const [sectionRows, scenarioRows, quizRows, attempts, lastActivity, shiftRows] = await Promise.all([
    sectionIds.length > 0
      ? supabase.from('sections').select('id, name').in('id', sectionIds).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ids.length > 0
      ? fetchAll<ScenarioAssignmentRow>((from, to) =>
          supabase
            .from('scenario_assignments')
            .select('id, student_id, status, deadline, submitted_at, scenario_id, scenarios(title)')
            .in('student_id', ids)
            .order('id')
            .range(from, to),
        )
      : Promise.resolve([] as ScenarioAssignmentRow[]),
    ids.length > 0
      ? fetchAll<QuizAssignmentRow>((from, to) =>
          supabase
            .from('assessment_assignments')
            .select('id, student_id, status, deadline, assessment_id, assessments(title)')
            .in('student_id', ids)
            .order('id')
            .range(from, to),
        )
      : Promise.resolve([] as QuizAssignmentRow[]),
    ids.length > 0
      ? fetchAll<{ student_id: string; score: number | null; submitted_at: string }>((from, to) =>
          supabase
            .from('assessment_attempts')
            .select('student_id, score, submitted_at')
            .in('student_id', ids)
            .eq('status', 'submitted')
            .gte('submitted_at', new Date(attemptsFrom).toISOString())
            .order('submitted_at')
            .range(from, to),
        )
      : Promise.resolve([]),
    getLastActivityByStudent(supabase, ids),
    sectionIds.length > 0
      ? supabase
          .from('shifts')
          .select(
            'id, label, shift_type, starts_at, ends_at, section_id, rooms(name, room_number), shift_assignments(attendance_status)',
          )
          .in('section_id', sectionIds)
          .eq('status', 'scheduled')
          .gt('ends_at', new Date(now).toISOString())
          .order('starts_at')
          .limit(4)
      : Promise.resolve({ data: [] as ShiftRow[] }),
  ]);

  const sections = (sectionRows.data ?? []) as { id: string; name: string }[];
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));
  const studentById = new Map(students.map((s) => [s.id, s]));

  // ---- Assignment state per student ---------------------------------
  const overdueBy = new Map<string, number>();
  const dueBySection = new Map<string, { due: number; done: number }>();
  const reviewItems: ReviewItem[] = [];
  const dueSoon = new Map<string, DueItem>();

  const tally = (studentId: string, deadline: string | null, done: boolean) => {
    if (!deadline) return;
    const at = Date.parse(deadline);
    const sectionId = studentById.get(studentId)?.section_id;
    if (at < now) {
      if (sectionId) {
        const d = dueBySection.get(sectionId) ?? { due: 0, done: 0 };
        d.due += 1;
        if (done) d.done += 1;
        dueBySection.set(sectionId, d);
      }
      if (!done) overdueBy.set(studentId, (overdueBy.get(studentId) ?? 0) + 1);
    }
  };
  const noteDueSoon = (kind: DueItem['kind'], itemId: string, title: string, deadline: string | null, done: boolean) => {
    if (!deadline || done) return;
    const at = Date.parse(deadline);
    if (at < now || at > now + DUE_SOON_DAYS * DAY_MS) return;
    const key = `${kind}:${itemId}`;
    const item = dueSoon.get(key) ?? { kind, id: itemId, title, deadline, open: 0 };
    item.open += 1;
    if (deadline < item.deadline) item.deadline = deadline;
    dueSoon.set(key, item);
  };

  for (const row of scenarioRows) {
    // The review page's rule: handed in but not yet finalized.
    const done = row.status === 'completed' || Boolean(row.submitted_at);
    tally(row.student_id, row.deadline, done);
    noteDueSoon('scenario', row.scenario_id, row.scenarios?.title ?? 'Scenario', row.deadline, done);
    if (row.submitted_at && row.status !== 'completed') {
      reviewItems.push({
        assignment_id: row.id,
        student_id: row.student_id,
        student_name: studentById.get(row.student_id)?.name ?? 'Unknown student',
        scenario_title: row.scenarios?.title ?? 'Scenario',
        submitted_at: row.submitted_at,
      });
    }
  }
  for (const row of quizRows) {
    const done = row.status === 'completed';
    tally(row.student_id, row.deadline, done);
    noteDueSoon('quiz', row.assessment_id, row.assessments?.title ?? 'Skill Assessment', row.deadline, done);
  }

  // ---- Quiz performance ---------------------------------------------
  const recentFrom = now - RECENT_DAYS * DAY_MS;
  const priorFrom = now - 2 * RECENT_DAYS * DAY_MS;
  const recentBy = new Map<string, number[]>();
  const sectionScores = new Map<string, { recent: number[]; prior: number[]; weeks: Map<number, number[]> }>();
  const cohortRecent: number[] = [];
  const cohortPrior: number[] = [];

  for (const a of attempts) {
    if (a.score == null) continue;
    const score = Number(a.score);
    const at = Date.parse(a.submitted_at);
    const sectionId = studentById.get(a.student_id)?.section_id ?? null;
    const bucket = sectionId
      ? sectionScores.get(sectionId) ?? { recent: [], prior: [], weeks: new Map<number, number[]>() }
      : null;
    if (at >= recentFrom) {
      recentBy.set(a.student_id, [...(recentBy.get(a.student_id) ?? []), score]);
      cohortRecent.push(score);
      bucket?.recent.push(score);
    } else if (at >= priorFrom) {
      cohortPrior.push(score);
      bucket?.prior.push(score);
    }
    if (bucket && at >= traceFrom) {
      const week = weekStart(at);
      bucket.weeks.set(week, [...(bucket.weeks.get(week) ?? []), score]);
    }
    if (sectionId && bucket) sectionScores.set(sectionId, bucket);
  }

  // ---- Sections -----------------------------------------------------
  const overviewSections: OverviewSection[] = sections.map((section) => {
    const members = students.filter((s) => s.section_id === section.id);
    const scores = sectionScores.get(section.id);
    const due = dueBySection.get(section.id);
    return {
      id: section.id,
      name: section.name,
      students: members.length,
      at_risk: members.filter((s) => risks.get(s.id)?.risk === 'at_risk').length,
      overdue: members.reduce((sum, s) => sum + (overdueBy.get(s.id) ?? 0), 0),
      completion: due && due.due > 0 ? Math.round((due.done / due.due) * 100) : null,
      avg_recent: mean(scores?.recent ?? []),
      avg_prior: mean(scores?.prior ?? []),
      weekly: Array.from({ length: TRACE_WEEKS }, (_, i) => {
        const week = traceFrom + i * 7 * DAY_MS;
        return {
          week_start: new Date(week).toISOString().slice(0, 10),
          average: mean(scores?.weeks.get(week) ?? []),
        };
      }),
    };
  });

  // ---- Students who need a look ---------------------------------------
  const openAssistance = new Map<string, number>();
  for (const alert of alerts) {
    if (alert.alert_type === 'Assistance Request' && alert.status !== 'resolved') {
      openAssistance.set(alert.student_id, (openAssistance.get(alert.student_id) ?? 0) + 1);
    }
  }

  const ranked = students
    .map((s) => {
      const risk = risks.get(s.id) ?? null;
      const overdue = overdueBy.get(s.id) ?? 0;
      const recentAvg = mean(recentBy.get(s.id) ?? []);
      const last = lastActivity.get(s.id) ?? null;
      const assistance = openAssistance.get(s.id) ?? 0;
      const inactive = !last || Date.parse(last) < now - INACTIVE_DAYS * DAY_MS;
      // A help flag and an at-risk prediction outrank the rest; overdue work
      // counts per item (capped, so one backlog can't drown every other
      // signal), then a weak recent average, then silence.
      const urgency =
        assistance * 3 +
        (risk?.risk === 'at_risk' ? 3 + (risk.probability ?? 0) : 0) +
        Math.min(overdue, 4) * 1.5 +
        (recentAvg != null && recentAvg < LOW_AVERAGE ? 2 : 0) +
        (inactive ? 1 : 0);
      const student: AttentionStudent = {
        id: s.id,
        name: s.name,
        section: s.section_id ? sectionName.get(s.section_id) ?? null : null,
        picture_url: s.picture_url,
        sex: s.sex ?? null,
        risk: risk?.risk ?? null,
        probability: risk?.probability ?? null,
        overdue,
        recent_avg: recentAvg,
        last_activity: last,
        open_assistance: assistance,
      };
      return { student, urgency };
    })
    .filter((r) => r.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency || a.student.name.localeCompare(b.student.name));

  // ---- Duty -----------------------------------------------------------
  const upcoming: DutyShift[] = ((shiftRows.data ?? []) as unknown as ShiftRow[]).map((shift) => {
    const roster = shift.shift_assignments ?? [];
    return {
      id: shift.id,
      label: shift.label,
      shift_type: shift.shift_type,
      starts_at: shift.starts_at,
      ends_at: shift.ends_at,
      section: shift.section_id ? sectionName.get(shift.section_id) ?? null : null,
      room: shift.rooms ? `${shift.rooms.name} · ${shift.rooms.room_number}` : null,
      rostered: roster.length,
      checked_in: roster.filter((r) => r.attendance_status === 'present' || r.attendance_status === 'late').length,
      absent: roster.filter((r) => r.attendance_status === 'absent').length,
    };
  });

  let scoredAt: string | null = null;
  for (const r of risks.values()) {
    if (!scoredAt || r.predicted_at > scoredAt) scoredAt = r.predicted_at;
  }

  return {
    sections: overviewSections,
    attention: ranked.slice(0, 8).map((r) => r.student),
    attention_total: ranked.length,
    review_queue: {
      total: reviewItems.length,
      // Longest-waiting first: those are the ones students are chasing.
      items: reviewItems.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).slice(0, 5),
    },
    upcoming_shifts: upcoming,
    due_soon: [...dueSoon.values()].sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5),
    overdue_assignments: [...overdueBy.values()].reduce((sum, n) => sum + n, 0),
    students_behind: overdueBy.size,
    cohort_avg_recent: mean(cohortRecent),
    cohort_avg_prior: mean(cohortPrior),
    scored_at: scoredAt,
  };
}
