import type { Parsed } from './course-progress';

/**
 * Attendance from deadlines. Every RetDem (patient case), Quiz and Case
 * Presentation a student is given has a deadline; doing the work by it is
 * Present, after it Late, and not at all once it has passed Absent, unless an
 * instructor excused it. Nothing but excuses is stored: this runs on every
 * read, so a moved deadline or a late hand-in shows at once.
 *
 * Pure, so the API, the reports, the course checklist and the demo share it.
 */

export type ActivityKind = 'scenario' | 'assessment' | 'case_presentation';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'upcoming' | 'no_deadline';

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
  upcoming: 'Upcoming',
  no_deadline: 'No deadline',
};

const KINDS: readonly ActivityKind[] = ['scenario', 'assessment', 'case_presentation'];

/** One student's piece of deadline-bound work. activity_id: the assignment, or the case presentation. */
export interface ActivityFact {
  student_id: string;
  kind: ActivityKind;
  activity_id: string;
  /** What was given: the patient case, the quiz, or the case presentation, shared by every student given it. */
  source_id: string;
  title: string;
  deadline: string | null;
  /** When the work was done: the first graded task, the first submitted attempt, the hand-in. */
  done_at: string | null;
}

export interface ExcuseFact {
  student_id: string;
  kind: ActivityKind;
  activity_id: string;
  reason: string;
  excused_by_name: string | null;
  created_at: string;
}

export interface AttendanceRow extends ActivityFact {
  status: AttendanceStatus;
  /** Only on an excused row. */
  excuse: { reason: string; by_name: string | null; at: string } | null;
}

export interface AttendanceTally {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Whole percent attended (present + late) of present, late and absent; null with none of those. */
  rate: number | null;
}

/** The rows activities are built from, as the database (or the demo) holds them. */
export interface ActivitySources {
  scenarioAssignments: { id: string; student_id: string; scenario_id: string; title: string; deadline: string | null }[];
  /** Graded tasks: a row is written when the instructor grades a task. */
  completions: { assignment_id: string; completed_at: string }[];
  /** default_deadline: the quiz's own deadline, which an assignment without one inherits. */
  quizAssignments: { id: string; student_id: string; assessment_id: string; title: string; deadline: string | null; default_deadline: string | null }[];
  attempts: { student_id: string; assessment_id: string; status: string; submitted_at: string | null }[];
  caseSubmissions: { student_id: string; presentation_id: string; title: string; deadline: string | null; submitted_at: string | null }[];
}

export function attendanceStatus(
  input: { deadline: string | null; done_at: string | null; excused: boolean },
  now: number,
): AttendanceStatus {
  if (!input.deadline) return 'no_deadline';
  const due = Date.parse(input.deadline);
  // Doing the work always wins: excused, then handed in late, is late.
  if (input.done_at) return Date.parse(input.done_at) <= due ? 'present' : 'late';
  if (due > now) return 'upcoming';
  return input.excused ? 'excused' : 'absent';
}

export function tallyAttendance(statuses: readonly AttendanceStatus[]): AttendanceTally {
  const tally: AttendanceTally = { present: 0, late: 0, absent: 0, excused: 0, rate: null };
  for (const s of statuses) {
    if (s === 'present' || s === 'late' || s === 'absent' || s === 'excused') tally[s]++;
  }
  const decided = tally.present + tally.late + tally.absent;
  tally.rate = decided === 0 ? null : Math.round(((tally.present + tally.late) / decided) * 100);
  return tally;
}

/** Activities attended: present or late. Excused is not attendance. */
export function attendedCount(statuses: readonly AttendanceStatus[]): number {
  return statuses.filter((s) => s === 'present' || s === 'late').length;
}

const earlier = (a: string | null | undefined, b: string) => (a && Date.parse(a) <= Date.parse(b) ? a : b);

export function collectActivities(src: ActivitySources): ActivityFact[] {
  const firstGraded = new Map<string, string>();
  for (const c of src.completions) firstGraded.set(c.assignment_id, earlier(firstGraded.get(c.assignment_id), c.completed_at));

  // Matched by student and quiz: older attempts and the demo's carry no assignment id.
  const firstSubmitted = new Map<string, string>();
  for (const a of src.attempts) {
    if (a.status !== 'submitted' || !a.submitted_at) continue;
    const key = `${a.student_id}:${a.assessment_id}`;
    firstSubmitted.set(key, earlier(firstSubmitted.get(key), a.submitted_at));
  }

  return [
    ...src.scenarioAssignments.map(
      (a): ActivityFact => ({
        student_id: a.student_id,
        kind: 'scenario',
        activity_id: a.id,
        source_id: a.scenario_id,
        title: a.title,
        deadline: a.deadline,
        done_at: firstGraded.get(a.id) ?? null,
      }),
    ),
    ...src.quizAssignments.map(
      (a): ActivityFact => ({
        student_id: a.student_id,
        kind: 'assessment',
        activity_id: a.id,
        source_id: a.assessment_id,
        title: a.title,
        deadline: a.deadline ?? a.default_deadline,
        done_at: firstSubmitted.get(`${a.student_id}:${a.assessment_id}`) ?? null,
      }),
    ),
    ...src.caseSubmissions.map(
      (s): ActivityFact => ({
        student_id: s.student_id,
        kind: 'case_presentation',
        activity_id: s.presentation_id,
        source_id: s.presentation_id,
        title: s.title,
        deadline: s.deadline,
        done_at: s.submitted_at,
      }),
    ),
  ];
}

const excuseKey = (r: { student_id: string; kind: ActivityKind; activity_id: string }) =>
  `${r.student_id}:${r.kind}:${r.activity_id}`;

/**
 * Each activity with its status, in the profile's order: upcoming soonest
 * first, then past deadlines newest first, then those with no deadline.
 * An excuse for an activity that is gone is dropped.
 */
export function attendanceRows(activities: readonly ActivityFact[], excuses: readonly ExcuseFact[], now: number): AttendanceRow[] {
  const byKey = new Map(excuses.map((e) => [excuseKey(e), e]));
  const rows = activities.map((a): AttendanceRow => {
    const excuse = byKey.get(excuseKey(a));
    const status = attendanceStatus({ deadline: a.deadline, done_at: a.done_at, excused: !!excuse }, now);
    return {
      ...a,
      status,
      excuse: status === 'excused' && excuse ? { reason: excuse.reason, by_name: excuse.excused_by_name, at: excuse.created_at } : null,
    };
  });
  const group = (r: AttendanceRow) => (r.status === 'upcoming' ? 0 : r.status === 'no_deadline' ? 2 : 1);
  return rows.sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (group(a) === 2) return a.title.localeCompare(b.title);
    const diff = Date.parse(a.deadline!) - Date.parse(b.deadline!);
    return group(a) === 0 ? diff : -diff;
  });
}

export interface ActivityGroup {
  kind: ActivityKind;
  source_id: string;
  title: string;
  deadline: string;
  tally: AttendanceTally;
}

/**
 * Rows grouped into the activities a section was given, for the section
 * report: one per patient case, quiz or case presentation and deadline,
 * newest deadline first. Activities with no deadline are left out.
 */
export function byActivity(rows: readonly AttendanceRow[]): ActivityGroup[] {
  const groups = new Map<string, { kind: ActivityKind; source_id: string; title: string; deadline: string; statuses: AttendanceStatus[] }>();
  for (const r of rows) {
    if (!r.deadline) continue;
    const key = `${r.kind}:${r.source_id}:${Date.parse(r.deadline)}`;
    const g = groups.get(key) ?? { kind: r.kind, source_id: r.source_id, title: r.title, deadline: r.deadline, statuses: [] };
    g.statuses.push(r.status);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline))
    .map(({ statuses, ...g }) => ({ ...g, tally: tallyAttendance(statuses) }));
}

export const MAX_EXCUSE_REASON = 300;

export function parseExcuse(body: unknown): Parsed<{ kind: ActivityKind; activity_id: string; reason: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.kind !== 'string' || !KINDS.includes(b.kind as ActivityKind)) return { ok: false, error: 'Choose an activity' };
  if (typeof b.activity_id !== 'string' || !b.activity_id) return { ok: false, error: 'Choose an activity' };
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (!reason) return { ok: false, error: 'Give a reason for the excuse' };
  if (reason.length > MAX_EXCUSE_REASON) return { ok: false, error: `Keep the reason under ${MAX_EXCUSE_REASON} characters` };
  return { ok: true, value: { kind: b.kind as ActivityKind, activity_id: b.activity_id, reason } };
}

/** Before migration 068 there is no excuses table: 42P01 from Postgres, PGRST205 from PostgREST. */
export function isMissingExcusesTable(error: { code?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205');
}

export const EXCUSES_NEED_MIGRATION = 'Excusing an absence needs database migration 068 (activity excuses) applied first.';
