import { Text, View } from '@react-pdf/renderer';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { ReportShell, StatGrid, Table, styles, type ReportMeta, type ReportDocument } from './kit';
import {
  CASE_STATUS_LABEL,
  NEEDS_PRACTICE_BELOW,
  PASSING_SCORE,
  avg,
  date,
  grade,
  gradeTile,
  groupNames,
  isLate,
  pct,
  scenarioStatus,
  studentWork,
} from './data';
import { tallyAttendance, type ShiftAttendanceStatus } from '../shifts';
import { isActiveSkillArea } from '@/scripts/taylors-chapters';
import { CASE_CRITERIA, isLateSubmission, type CaseObservations } from '../case-rubric';
import { isLateSubmission as isLateAttempt } from '../assessment-timing';
import { ratingLabel, scoreDescriptor, type TaskRating } from '../task-ratings';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const REPORT_TYPES = ['student', 'section', 'scenario', 'assessment', 'roster', 'discharge', 'attendance', 'case'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && (REPORT_TYPES as readonly string[]).includes(value);
}

/** Roster is the only type that reports on the whole scope rather than one record. */
export const REPORT_NEEDS_TARGET: Record<ReportType, boolean> = {
  student: true,
  section: true,
  scenario: true,
  assessment: true,
  roster: false,
  // Targets one stored summary, not a patient: a re-admitted patient has more
  // than one, and each closes a different stay.
  discharge: true,
  // Attendance is reported per section.
  attendance: true,
  // One graded hospital case presentation (a case_submissions id).
  case: true,
};

export interface BuiltReport {
  /** Used for the filename and the PDF document title. */
  subject: string;
  pdf: ReportDocument;
}

export type BuildResult = BuiltReport | { error: string; status: number };

/**
 * The students a report may name: a faculty member's group members, an admin's
 * students, or null for no limit.
 */
export type StudentScope = readonly string[] | null;

const note = { fontSize: 8, color: '#6b7280', marginTop: 6 } as const;

// ---------------------------------------------------------------------------
// Student — everything one student has been graded on
// ---------------------------------------------------------------------------

export async function buildStudentReport(
  supabase: Supabase,
  meta: ReportMeta,
  studentId: string,
): Promise<BuildResult> {
  const { data: student } = await supabase
    .from('users')
    .select('id, name, email, sections(name)')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle();
  if (!student) return { error: 'Student not found', status: 404 };

  const [groups, { data: scenarios }, cases, { data: attempts }, { data: scores }, { data: shifts }] = await Promise.all([
    groupNames(supabase, [studentId]),
    supabase
      .from('scenario_assignments')
      .select('status, score, submitted_at, completed_at, deadline, scenarios(title)')
      .eq('student_id', studentId)
      .order('assigned_at', { ascending: false }),
    supabase
      .from('case_submissions')
      .select('status, score, submitted_at, case_presentations(title, deadline)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('assessment_attempts')
      .select('score, submitted_at, time_taken_seconds, assessments(title, time_limit_seconds)')
      .eq('student_id', studentId)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),
    supabase
      .from('competency_scores')
      .select('score, created_at, competency_areas(name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
    supabase.from('shift_assignments').select('attendance_status, shifts!inner(status)').eq('student_id', studentId),
  ]);
  if (cases.error) console.error('Report: failed to read case submissions', cases.error);

  const scenarioRows = (scenarios ?? []).map((a) => {
    const title = (a as unknown as { scenarios: { title: string } | null }).scenarios?.title ?? 'Unknown patient case';
    const late = isLate(a.submitted_at, a.deadline);
    return {
      title,
      status: scenarioStatus(a),
      handedIn: a.submitted_at ? `${date(a.submitted_at)}${late ? ' (late)' : ''}` : '—',
      score: a.status === 'completed' && a.score !== null ? Number(a.score) : null,
    };
  });
  const scenarioScores = scenarioRows.flatMap((r) => (r.score === null ? [] : [r.score]));

  const caseRows = (cases.data ?? []).map((c) => {
    const p = (c as unknown as { case_presentations: { title: string; deadline: string | null } | null }).case_presentations;
    const late = isLate(c.submitted_at, p?.deadline ?? null);
    return {
      title: p?.title ?? 'Case presentation',
      status: CASE_STATUS_LABEL[c.status as string] ?? String(c.status),
      handedIn: c.submitted_at ? `${date(c.submitted_at)}${late ? ' (late)' : ''}` : '—',
      score: c.status === 'graded' && c.score !== null ? Number(c.score) : null,
    };
  });
  const caseScores = caseRows.flatMap((r) => (r.score === null ? [] : [r.score]));

  const quizRows = (attempts ?? []).map((a) => {
    const quiz = (a as unknown as { assessments: { title: string; time_limit_seconds: number | null } | null }).assessments;
    const late = isLateAttempt(a.time_taken_seconds, quiz?.time_limit_seconds ?? null);
    return {
      title: quiz?.title ?? 'Unknown assessment',
      submitted: `${date(a.submitted_at)}${late ? ' (late)' : ''}`,
      score: a.score === null ? null : Math.round(Number(a.score)),
    };
  });
  const quizScores = quizRows.flatMap((r) => (r.score === null ? [] : [r.score]));

  // Rows arrive newest-first, so the first hit per area is the latest score.
  const byArea = new Map<string, { latest: number; count: number }>();
  for (const record of scores ?? []) {
    const name = (record as unknown as { competency_areas: { name: string } | null }).competency_areas?.name ?? 'Unknown';
    if (!isActiveSkillArea(name)) continue;
    const e = byArea.get(name);
    if (e) e.count += 1;
    else byArea.set(name, { latest: Math.round(Number(record.score)), count: 1 });
  }
  const areas = [...byArea.entries()].sort(([a], [b]) => a.localeCompare(b));

  // A cancelled shift is nobody's absence.
  const attendance = tallyAttendance(
    (shifts ?? [])
      .filter((s) => (s as unknown as { shifts: { status: string } }).shifts.status !== 'cancelled')
      .map((s) => s.attendance_status as ShiftAttendanceStatus),
  );

  const section = (student as unknown as { sections: { name: string } | null }).sections?.name ?? 'Unassigned';

  const pdf = (
    <ReportShell
      title={`Student Report - ${student.name}`}
      heading="Student Progress Report"
      meta={meta}
      metaRows={[
        { label: 'Student', value: student.name },
        { label: 'Email', value: student.email },
        { label: 'Section', value: section },
        { label: 'Group', value: groups.get(studentId) ?? 'No group' },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          gradeTile('Patient case average', avg(scenarioScores)),
          gradeTile('Case presentation average', avg(caseScores)),
          { label: 'Quiz average', value: pct(avg(quizScores)) },
          { label: 'Attendance', value: pct(attendance.rate) },
        ]}
      />

      <Text style={styles.sectionTitle}>Patient Cases</Text>
      <Table
        head={['Patient Case', 'Status', 'Handed in', 'Grade']}
        widths={[3, 1.3, 1.3, 1.9]}
        rows={scenarioRows.map((r) => [r.title, r.status, r.handedIn, grade(r.score)])}
        emptyText="No patient cases assigned yet."
      />

      <Text style={styles.sectionTitle}>Case presentations</Text>
      <Table
        head={['Presentation', 'Status', 'Handed in', 'Grade']}
        widths={[3, 1.3, 1.3, 1.9]}
        rows={caseRows.map((r) => [r.title, r.status, r.handedIn, grade(r.score)])}
        emptyText="No case presentations assigned yet."
      />

      <Text style={styles.sectionTitle}>Quizzes</Text>
      <Table
        head={['Assessment', 'Submitted', 'Score']}
        rows={quizRows.map((r) => [r.title, r.submitted, pct(r.score)])}
        emptyText="No quizzes submitted yet."
      />

      <Text style={styles.sectionTitle}>Skill areas</Text>
      <Table
        head={['Area', 'Ratings', 'Latest']}
        rows={areas.map(([name, a]) => [name, a.count, `${a.latest}%`])}
        emptyText="No skill area ratings recorded yet."
      />

      <Text style={styles.sectionTitle}>Clinical attendance</Text>
      <StatGrid
        items={[
          { label: 'Present', value: attendance.present },
          { label: 'Late', value: attendance.late },
          { label: 'Absent', value: attendance.absent },
          { label: 'Excused', value: attendance.excused },
        ]}
      />
      <Text style={note}>
        Grades use the verbal scale instructors grade on: Excellent, Satisfactory or Needs Practice. Skill
        Assessments pass at {PASSING_SCORE}%. Attendance counts late as attended and leaves excused and
        unmarked shifts out.
      </Text>
    </ReportShell>
  );

  return { subject: student.name, pdf };
}

// ---------------------------------------------------------------------------
// Section — one class at a glance, by student and by group
// ---------------------------------------------------------------------------

export async function buildSectionReport(
  supabase: Supabase,
  meta: ReportMeta,
  sectionId: string,
  scope: StudentScope = null,
): Promise<BuildResult> {
  const { data: section } = await supabase.from('sections').select('id, name').eq('id', sectionId).maybeSingle();
  if (!section) return { error: 'Section not found', status: 404 };

  const { data: sectionStudents } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'student')
    .eq('section_id', sectionId)
    .order('name');
  const students = (sectionStudents ?? []).filter((s) => !scope || scope.includes(s.id));
  const ids = students.map((s) => s.id);

  const [groups, work, { data: scores }] = await Promise.all([
    groupNames(supabase, ids),
    studentWork(supabase, ids),
    ids.length
      ? supabase.from('competency_scores').select('score, competency_areas(name)').in('student_id', ids)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const roster = students.map((s) => ({ ...s, group: groups.get(s.id) ?? null, work: work.get(s.id)! }));
  const scenarioAverages = roster.flatMap((r) => (r.work.scenarioAverage === null ? [] : [r.work.scenarioAverage]));
  const quizAverages = roster.flatMap((r) => (r.work.quizAverage === null ? [] : [r.work.quizAverage]));
  const needsPractice = scenarioAverages.filter((s) => s < NEEDS_PRACTICE_BELOW).length;

  const byGroup = new Map<string, typeof roster>();
  for (const r of roster) {
    const key = r.group ?? 'No group';
    byGroup.set(key, [...(byGroup.get(key) ?? []), r]);
  }
  const groupRows = [...byGroup.entries()]
    .sort(([a], [b]) => (a === 'No group' ? 1 : b === 'No group' ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([name, members]) => {
      const graded = members.flatMap((m) => (m.work.scenarioAverage === null ? [] : [m.work.scenarioAverage]));
      return [name, members.length, `${graded.length}/${members.length}`, grade(avg(graded))];
    });

  const byArea = new Map<string, number[]>();
  for (const s of (scores ?? []) as { score: number; competency_areas: { name: string } | null }[]) {
    const name = s.competency_areas?.name ?? 'Unknown';
    if (!isActiveSkillArea(name)) continue;
    byArea.set(name, [...(byArea.get(name) ?? []), Number(s.score)]);
  }
  const areaRows = [...byArea.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => [name, list.length, pct(avg(list))]);

  const pdf = (
    <ReportShell
      title={`Section Report - ${section.name}`}
      heading="Section Performance Report"
      meta={meta}
      metaRows={[
        { label: 'Section', value: section.name },
        { label: 'Students', value: String(roster.length) },
        { label: 'Groups', value: String([...byGroup.keys()].filter((g) => g !== 'No group').length) },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Students', value: roster.length },
          gradeTile('Patient case average', avg(scenarioAverages)),
          { label: 'Quiz average', value: pct(avg(quizAverages)) },
          { label: 'Needs Practice', value: needsPractice },
        ]}
      />

      <Text style={styles.sectionTitle}>Groups</Text>
      <Table
        head={['Group', 'Members', 'Graded', 'Patient case average']}
        widths={[3, 1, 1, 2]}
        rows={groupRows}
        emptyText="No students in this section yet."
      />

      <Text style={styles.sectionTitle}>Students</Text>
      <Table
        head={['Student', 'Group', 'Patient Cases', 'Patient case grade', 'Case grade', 'Quiz average']}
        widths={[2.3, 1.1, 1, 2, 1, 1.3]}
        rows={roster.map((r) => [
          r.name,
          r.group ?? '—',
          `${r.work.scenariosGraded}/${r.work.scenariosAssigned}`,
          grade(r.work.scenarioAverage),
          pct(r.work.caseAverage),
          pct(r.work.quizAverage),
        ])}
        emptyText="No students in this section yet."
      />

      <Text style={styles.sectionTitle}>Skill areas (section mean)</Text>
      <Table
        head={['Area', 'Ratings', 'Mean']}
        rows={areaRows}
        emptyText="No skill area ratings recorded for this section yet."
      />
      <Text style={note}>
        Patient cases counts graded out of assigned. Needs Practice counts students whose patient case average is
        below {NEEDS_PRACTICE_BELOW}%.
      </Text>
    </ReportShell>
  );

  return { subject: section.name, pdf };
}

// ---------------------------------------------------------------------------
// Scenario — who was given one scenario, and how they were graded
// ---------------------------------------------------------------------------

export async function buildScenarioReport(
  supabase: Supabase,
  meta: ReportMeta,
  scenarioId: string,
  scope: StudentScope = null,
): Promise<BuildResult> {
  const { data: scenario } = await supabase
    .from('scenarios')
    .select('id, title, difficulty, category')
    .eq('id', scenarioId)
    .maybeSingle();
  if (!scenario) return { error: 'Patient case not found', status: 404 };

  const { data: allAssignments } = await supabase
    .from('scenario_assignments')
    .select('student_id, status, score, submitted_at, completed_at, deadline, users!scenario_assignments_student_id_fkey(name)')
    .eq('scenario_id', scenarioId)
    .order('assigned_at', { ascending: false });
  const assignments = (allAssignments ?? []).filter((a) => !scope || scope.includes(a.student_id as string));
  const groups = await groupNames(supabase, assignments.map((a) => a.student_id as string));

  const rows = assignments
    .map((a) => ({
      name: (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student',
      group: groups.get(a.student_id as string) ?? '—',
      status: scenarioStatus(a),
      late: isLate(a.submitted_at, a.deadline),
      handedIn: a.submitted_at,
      score: a.status === 'completed' && a.score !== null ? Number(a.score) : null,
    }))
    .sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  const graded = rows.flatMap((r) => (r.score === null ? [] : [r.score]));
  const awaiting = rows.filter((r) => r.status === 'Awaiting grade').length;
  const levels = ['Excellent', 'Satisfactory', 'Needs Practice'].map((label) => [
    label,
    graded.filter((s) => scoreDescriptor(s) === label).length,
  ]);

  const pdf = (
    <ReportShell
      title={`Patient Case Report - ${scenario.title}`}
      heading="Patient Case Report"
      meta={meta}
      metaRows={[
        { label: 'Patient Case', value: scenario.title },
        { label: 'Difficulty', value: String(scenario.difficulty) },
        { label: 'Category', value: String(scenario.category) },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Assigned', value: rows.length },
          { label: 'Awaiting grade', value: awaiting },
          { label: 'Graded', value: graded.length },
          gradeTile('Average grade', avg(graded)),
        ]}
      />

      <Text style={styles.sectionTitle}>Grades</Text>
      <Table head={['Level', 'Students']} rows={levels} emptyText="Nothing graded yet." />

      <Text style={styles.sectionTitle}>Students</Text>
      <Table
        head={['Student', 'Group', 'Status', 'Handed in', 'Grade']}
        widths={[2.4, 1, 1.4, 1.4, 1.9]}
        rows={rows.map((r) => [
          r.name,
          r.group,
          r.status,
          r.handedIn ? `${date(r.handedIn)}${r.late ? ' (late)' : ''}` : '—',
          grade(r.score),
        ])}
        emptyText="This patient case has not been assigned yet."
      />
    </ReportShell>
  );

  return { subject: scenario.title, pdf };
}

// ---------------------------------------------------------------------------
// Assessment — one Skill Assessment, per student
// ---------------------------------------------------------------------------

/**
 * One row per student who was given the assessment (assessment_assignments)
 * or sat it anyway: target_sections only makes it visible, so it is not who
 * was given it.
 */
export async function buildAssessmentReport(
  supabase: Supabase,
  meta: ReportMeta,
  assessmentId: string,
  scope: StudentScope = null,
): Promise<BuildResult> {
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title, difficulty, is_published, time_limit_seconds')
    .eq('id', assessmentId)
    .maybeSingle();
  if (!assessment) return { error: 'Assessment not found', status: 404 };

  const [{ data: assigned }, { data: allAttempts }] = await Promise.all([
    supabase
      .from('assessment_assignments')
      .select('student_id, deadline, users!assessment_assignments_student_id_fkey(name)')
      .eq('assessment_id', assessmentId),
    supabase
      .from('assessment_attempts')
      .select('student_id, status, score, submitted_at, time_taken_seconds, users(name)')
      .eq('assessment_id', assessmentId),
  ]);

  const students = new Map<string, { name: string; assigned: boolean; attempts: NonNullable<typeof allAttempts> }>();
  for (const a of assigned ?? []) {
    const name = (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student';
    students.set(a.student_id as string, { name, assigned: true, attempts: [] });
  }
  for (const a of allAttempts ?? []) {
    const id = a.student_id as string;
    const name = (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student';
    const e = students.get(id) ?? { name, assigned: false, attempts: [] };
    e.attempts.push(a);
    students.set(id, e);
  }
  const inScope = [...students.entries()].filter(([id]) => !scope || scope.includes(id));
  const groups = await groupNames(supabase, inScope.map(([id]) => id));

  const rows = inScope
    .map(([id, s]) => {
      const submitted = s.attempts.filter((a) => a.status === 'submitted' && a.score !== null);
      const best = submitted.length ? Math.max(...submitted.map((a) => Math.round(Number(a.score)))) : null;
      const latest = submitted.map((a) => a.submitted_at as string).sort().at(-1) ?? null;
      const late = submitted.some((a) => isLateAttempt(a.time_taken_seconds, assessment.time_limit_seconds));
      const status = submitted.length
        ? 'Submitted'
        : s.attempts.some((a) => a.status === 'in_progress')
          ? 'In progress'
          : 'Not started';
      return { name: s.name, group: groups.get(id) ?? '—', status, attempts: submitted.length, best, latest, late };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const bests = rows.flatMap((r) => (r.best === null ? [] : [r.best]));
  const passRate = bests.length ? Math.round((bests.filter((s) => s >= PASSING_SCORE).length / bests.length) * 100) : null;
  const bands = [
    { label: '90-100', test: (s: number) => s >= 90 },
    { label: `${PASSING_SCORE}-89`, test: (s: number) => s >= PASSING_SCORE && s < 90 },
    { label: `60-${PASSING_SCORE - 1}`, test: (s: number) => s >= 60 && s < PASSING_SCORE },
    { label: 'Below 60', test: (s: number) => s < 60 },
  ].map((b) => [b.label, bests.filter(b.test).length]);

  const pdf = (
    <ReportShell
      title={`Assessment Report - ${assessment.title}`}
      heading="Quiz Report"
      meta={meta}
      metaRows={[
        { label: 'Assessment', value: assessment.title },
        { label: 'Difficulty', value: String(assessment.difficulty) },
        { label: 'Status', value: assessment.is_published ? 'Published' : 'Draft' },
        {
          label: 'Time limit',
          value: assessment.time_limit_seconds ? `${Math.round(assessment.time_limit_seconds / 60)} min` : 'None',
        },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Students', value: rows.length },
          { label: 'Submitted', value: bests.length },
          { label: 'Average best score', value: pct(avg(bests)) },
          { label: `Pass rate (${PASSING_SCORE}% and up)`, value: pct(passRate) },
        ]}
      />

      <Text style={styles.sectionTitle}>Score distribution (best attempt)</Text>
      <Table head={['Band', 'Students']} rows={bands} emptyText="No submitted attempts yet." />

      <Text style={styles.sectionTitle}>Students</Text>
      <Table
        head={['Student', 'Group', 'Status', 'Attempts', 'Last submitted', 'Best']}
        widths={[2.4, 1, 1.2, 1, 1.6, 0.8]}
        rows={rows.map((r) => [
          r.name,
          r.group,
          r.status,
          r.attempts,
          r.latest ? `${date(r.latest)}${r.late ? ' (late)' : ''}` : '—',
          pct(r.best),
        ])}
        emptyText="This assessment has not been given to anyone yet."
      />
      <Text style={note}>
        Late marks an attempt handed in more than a minute past the time limit. It is still graded and
        counted.
      </Text>
    </ReportShell>
  );

  return { subject: assessment.title, pdf };
}

// ---------------------------------------------------------------------------
// Roster — every student the caller supervises, one row each
// ---------------------------------------------------------------------------

export async function buildRosterReport(
  supabase: Supabase,
  meta: ReportMeta,
  session: { uid: string; role: string },
  scope: StudentScope = null,
): Promise<BuildResult> {
  let query = supabase.from('users').select('id, name, sections(name)').eq('role', 'student').order('name');

  if (session.role === 'faculty') {
    // The members of the groups they supervise.
    const studentIds = await getFacultyStudentIds(supabase, session.uid);
    if (studentIds.length === 0) {
      return { error: 'You have no students in your groups yet', status: 400 };
    }
    query = query.in('id', studentIds);
  } else if (scope) {
    // An admin's own students (migration 053).
    if (scope.length === 0) return { error: 'You have no students yet', status: 400 };
    query = query.in('id', [...scope]);
  }

  const { data: students } = await query;
  const ids = (students ?? []).map((s) => s.id);
  const [groups, work] = await Promise.all([groupNames(supabase, ids), studentWork(supabase, ids)]);

  const rows = (students ?? []).map((s) => ({
    name: s.name,
    section: (s as unknown as { sections: { name: string } | null }).sections?.name ?? 'Unassigned',
    group: groups.get(s.id) ?? '—',
    work: work.get(s.id)!,
  }));
  const scenarioAverages = rows.flatMap((r) => (r.work.scenarioAverage === null ? [] : [r.work.scenarioAverage]));
  const quizAverages = rows.flatMap((r) => (r.work.quizAverage === null ? [] : [r.work.quizAverage]));
  const noWork = rows.filter(
    (r) => r.work.scenariosGraded === 0 && r.work.casesGraded === 0 && r.work.quizAttempts === 0,
  ).length;

  const pdf = (
    <ReportShell
      title="Roster Summary Report"
      heading="Roster Summary Report"
      meta={meta}
      metaRows={[
        { label: 'Scope', value: session.role === 'admin' ? 'Your students' : 'Your groups' },
        { label: 'Students', value: String(rows.length) },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Students', value: rows.length },
          gradeTile('Patient case average', avg(scenarioAverages)),
          { label: 'Quiz average', value: pct(avg(quizAverages)) },
          { label: 'Nothing graded yet', value: noWork },
        ]}
      />

      <Text style={styles.sectionTitle}>Students</Text>
      <Table
        head={['Student', 'Section', 'Group', 'Patient case grade', 'Case grade', 'Quiz average']}
        widths={[2.3, 1, 1, 2, 1, 1.3]}
        rows={rows.map((r) => [
          r.name,
          r.section,
          r.group,
          grade(r.work.scenarioAverage),
          pct(r.work.caseAverage),
          pct(r.work.quizAverage),
        ])}
        emptyText="No students on your roster yet."
      />
    </ReportShell>
  );

  return { subject: 'roster-summary', pdf };
}

/**
 * A stored discharge summary, rendered as-is.
 *
 * This is the one builder that does not query live data for its body: a
 * discharge summary is a point-in-time record (migration 037), so re-printing
 * it a month later must produce the same document even if the readings behind
 * it have since been edited or deleted.
 */
export async function buildDischargeReport(
  supabase: Supabase,
  meta: ReportMeta,
  summaryId: string,
): Promise<BuildResult> {
  const { data: summary } = await supabase
    .from('discharge_summaries')
    .select(
      'id, admitted_at, discharged_at, diagnosis, room_label, vitals_digest, ehr_digest, follow_up, ai_generated_at, patients(name, age, gender, mimic_id)',
    )
    .eq('id', summaryId)
    .maybeSingle();

  if (!summary) return { error: 'Discharge summary not found', status: 404 };

  const patient = (summary as unknown as {
    patients: { name: string; age: number | null; gender: string; mimic_id: string } | null;
  }).patients;

  const vitals = (summary.vitals_digest ?? {}) as {
    readings?: number;
    flagged?: number;
    critical?: number;
    stats?: Record<string, { min: number; max: number; avg: number; n: number }>;
    findings?: { message: string; severity: string; recommendation?: string }[];
  };
  const ehr = (summary.ehr_digest ?? {}) as {
    tpr?: number;
    ivf?: number;
    ivf_ongoing?: number;
    notes?: number;
    notes_reviewed?: number;
  };
  const followUp = (Array.isArray(summary.follow_up) ? summary.follow_up : []) as {
    title?: string;
    detail?: string;
  }[];

  const name = patient?.name ?? 'Unknown patient';
  const days =
    summary.admitted_at && summary.discharged_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(summary.discharged_at).getTime() - new Date(summary.admitted_at).getTime()) /
              86_400_000,
          ),
        )
      : null;

  const VITAL_LABELS: Record<string, string> = {
    heart_rate: 'Heart rate (bpm)',
    bp_systolic: 'Systolic BP (mmHg)',
    bp_diastolic: 'Diastolic BP (mmHg)',
    temperature_c: 'Temperature (°C)',
    respiratory_rate: 'Respiratory rate (/min)',
    oxygen_saturation: 'Oxygen saturation (%)',
  };

  const vitalRows = Object.entries(vitals.stats ?? {}).map(([key, stat]) => [
    VITAL_LABELS[key] ?? key,
    stat.min,
    stat.avg,
    stat.max,
    stat.n,
  ]);

  const pdf = (
    <ReportShell
      title={`Discharge Summary — ${name}`}
      heading="Discharge Summary"
      meta={meta}
      metaRows={[
        { label: 'Patient', value: `${name}${patient?.age != null ? `, ${patient.age}` : ''}` },
        { label: 'Record ID', value: patient?.mimic_id ?? '—' },
        { label: 'Diagnosis', value: summary.diagnosis || '—' },
        { label: 'Room', value: summary.room_label || '—' },
        { label: 'Admitted', value: date(summary.admitted_at) },
        { label: 'Discharged', value: date(summary.discharged_at) },
        { label: 'Length of stay', value: days === null ? '—' : `${days} day(s)` },
      ]}
    >
      <Text style={styles.sectionTitle}>Stay at a glance</Text>
      <StatGrid
        items={[
          { label: 'Vitals readings', value: vitals.readings ?? 0 },
          { label: 'Flagged', value: vitals.flagged ?? 0 },
          { label: 'TPR sheets', value: ehr.tpr ?? 0 },
          { label: 'IVF records', value: ehr.ivf ?? 0 },
          { label: 'Progress notes', value: ehr.notes ?? 0 },
        ]}
      />

      <Text style={styles.sectionTitle}>Vital signs over the stay</Text>
      <Table
        head={['Vital', 'Min', 'Avg', 'Max', 'Readings']}
        rows={vitalRows}
        emptyText="No vital signs were charted during this stay."
      />

      <Text style={styles.sectionTitle}>Abnormal findings</Text>
      {(vitals.findings ?? []).length === 0 ? (
        <Text style={styles.empty}>No readings fell outside their reference range.</Text>
      ) : (
        (vitals.findings ?? []).map((finding, i) => (
          <Text key={i} style={{ marginBottom: 3 }}>
            {finding.severity === 'critical' ? '[CRITICAL] ' : '• '}
            {finding.message}
            {finding.recommendation ? ` — ${finding.recommendation}` : ''}
          </Text>
        ))
      )}

      <Text style={styles.sectionTitle}>Follow-up recommendations</Text>
      {followUp.length === 0 ? (
        <Text style={styles.empty}>
          No follow-up recommendations have been drafted for this discharge.
        </Text>
      ) : (
        followUp.map((item, i) => (
          <Text key={i} style={{ marginBottom: 4 }}>
            {i + 1}. {item.title ?? ''} — {item.detail ?? ''}
          </Text>
        ))
      )}
      {followUp.length > 0 && summary.ai_generated_at && (
        <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 4 }}>
          Follow-up recommendations were AI-drafted on {date(summary.ai_generated_at)} from the
          recorded data above, and are intended for review by the supervising instructor.
        </Text>
      )}
      {(ehr.ivf_ongoing ?? 0) > 0 && (
        <Text style={{ marginTop: 6 }}>
          Note: {ehr.ivf_ongoing} IVF line(s) were still recorded as running at discharge.
        </Text>
      )}
    </ReportShell>
  );

  return { subject: name, pdf };
}

/**
 * Clinical attendance for one section: a per-student rate plus the shift-by-
 * shift grid behind it.
 *
 * Rates come from `tallyAttendance`, the same function the attendance screens
 * use, so a printed report and the page it was printed from can never disagree
 * about what counts as attended.
 */
export async function buildAttendanceReport(
  supabase: Supabase,
  meta: ReportMeta,
  sectionId: string,
  scope: StudentScope = null,
): Promise<BuildResult> {
  const { data: section } = await supabase
    .from('sections')
    .select('id, name')
    .eq('id', sectionId)
    .maybeSingle();
  if (!section) return { error: 'Section not found', status: 404 };

  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, label, shift_type, starts_at, status')
    .eq('section_id', sectionId)
    .order('starts_at', { ascending: true })
    .limit(200);

  const shiftList = (shifts ?? []) as {
    id: string;
    label: string | null;
    shift_type: string;
    starts_at: string;
    status: string;
  }[];

  const { data: students } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'student')
    .eq('section_id', sectionId)
    .order('name');

  const studentList = ((students ?? []) as { id: string; name: string }[]).filter(
    (s) => !scope || scope.includes(s.id),
  );

  const assignments = shiftList.length
    ? ((
        await supabase
          .from('shift_assignments')
          .select('shift_id, student_id, attendance_status')
          .in(
            'shift_id',
            shiftList.map((s) => s.id),
          )
      ).data ?? [])
    : [];

  // student -> shift -> status
  const grid = new Map<string, Map<string, ShiftAttendanceStatus>>();
  for (const row of assignments as {
    shift_id: string;
    student_id: string;
    attendance_status: ShiftAttendanceStatus;
  }[]) {
    const byShift = grid.get(row.student_id) ?? new Map<string, ShiftAttendanceStatus>();
    byShift.set(row.shift_id, row.attendance_status);
    grid.set(row.student_id, byShift);
  }

  // A cancelled shift is not a shift anyone failed to attend, so it is left
  // out of the rates entirely rather than counted against the roster.
  const counted = shiftList.filter((s) => s.status !== 'cancelled');

  const perStudent = studentList.map((student) => {
    const byShift = grid.get(student.id);
    const statuses = counted
      .map((shift) => byShift?.get(shift.id))
      .filter((v): v is ShiftAttendanceStatus => !!v);
    const tally = tallyAttendance(statuses);
    return { student, tally };
  });

  const sectionTally = tallyAttendance(
    perStudent.flatMap(({ student }) =>
      counted
        .map((shift) => grid.get(student.id)?.get(shift.id))
        .filter((v): v is ShiftAttendanceStatus => !!v),
    ),
  );


  const summaryRows = perStudent.map(({ student, tally }) => [
    student.name,
    tally.present,
    tally.late,
    tally.absent,
    tally.excused,
    tally.rate === null ? '—' : `${tally.rate}%`,
  ]);

  const pdf = (
    <ReportShell
      title={`Attendance — ${section.name}`}
      heading="Clinical Attendance Report"
      meta={meta}
      metaRows={[
        { label: 'Section', value: section.name },
        { label: 'Students', value: String(studentList.length) },
        { label: 'Shifts', value: String(counted.length) },
        {
          label: 'Section attendance',
          value: sectionTally.rate === null ? 'Not yet marked' : `${sectionTally.rate}%`,
        },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Present', value: sectionTally.present },
          { label: 'Late', value: sectionTally.late },
          { label: 'Absent', value: sectionTally.absent },
          { label: 'Excused', value: sectionTally.excused },
          { label: 'Unmarked', value: sectionTally.scheduled },
        ]}
      />

      <Text style={styles.sectionTitle}>Attendance by student</Text>
      <Table
        head={['Student', 'Present', 'Late', 'Absent', 'Excused', 'Rate']}
        rows={summaryRows}
        emptyText="No students are enrolled in this section."
      />

      <Text style={styles.sectionTitle}>Shifts</Text>
      <Table
        head={['Shift', 'Marked', 'Present', 'Absent']}
        rows={counted.map((shift) => {
          const statuses = studentList
            .map((s) => grid.get(s.id)?.get(shift.id))
            .filter((v): v is ShiftAttendanceStatus => !!v);
          const t = tallyAttendance(statuses);
          return [
            `${shift.label || shift.shift_type.toUpperCase()}, ${date(shift.starts_at)}`,
            t.total - t.scheduled,
            t.present + t.late,
            t.absent,
          ];
        })}
        emptyText="No shifts have been scheduled for this section."
      />
      <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 6 }}>
        Rate counts present and late as attended. Excused and unmarked shifts are excluded from
        the rate rather than counted as absences. Cancelled shifts are omitted entirely.
      </Text>
    </ReportShell>
  );

  return { subject: section.name, pdf };
}

// ---------------------------------------------------------------------------
// Case presentation — one student's hospital case and how it was graded
// ---------------------------------------------------------------------------

/**
 * The patient appears by initials only, exactly as stored: the record never
 * held more, so the printout can't either.
 */
export async function buildCaseReport(
  supabase: Supabase,
  meta: ReportMeta,
  submissionId: string,
  scope: StudentScope,
): Promise<BuildResult> {
  const { data: row } = await supabase
    .from('case_submissions')
    .select(
      'id, student_id, status, patient_initials, age, sex, hospital, ward, admitting_diagnosis, chief_complaint, ' +
        'history, medications, nursing_diagnoses, interventions, observations, submitted_at, graded_at, score, remarks, ' +
        'case_presentations(title, deadline), student:users!case_submissions_student_id_fkey(name)',
    )
    .eq('id', submissionId)
    .maybeSingle();
  if (!row) return { error: 'Case not found', status: 404 };

  const c = row as unknown as {
    student_id: string;
    status: string;
    patient_initials: string | null;
    age: number | null;
    sex: string | null;
    hospital: string;
    ward: string;
    admitting_diagnosis: string;
    chief_complaint: string;
    history: string;
    medications: string;
    nursing_diagnoses: string;
    interventions: string;
    observations: CaseObservations;
    submitted_at: string | null;
    graded_at: string | null;
    score: number | null;
    remarks: string;
    case_presentations: { title: string; deadline: string | null } | null;
    student: { name: string | null } | null;
  };
  if (scope && !scope.includes(c.student_id)) return { error: 'Case not found', status: 404 };
  if (c.status !== 'graded') return { error: 'This case has not been graded yet', status: 409 };

  const { data: ratingRows } = await supabase
    .from('case_submission_ratings')
    .select('criterion, rating, remarks')
    .eq('submission_id', submissionId);
  const ratings = new Map((ratingRows ?? []).map((r) => [r.criterion as string, r as { rating: TaskRating; remarks: string }]));

  const studentName = c.student?.name ?? 'Unknown student';
  const title = c.case_presentations?.title ?? 'Case presentation';
  const score = c.score === null ? null : Number(c.score);
  const late = isLateSubmission(c.submitted_at, c.case_presentations?.deadline ?? null);
  const obs = c.observations ?? { vitals: [], tpr: [], ivf: [] };
  const patient = [c.patient_initials ?? '—', c.age != null ? `${c.age} y/o` : null, c.sex].filter(Boolean).join(', ');
  const n = (v: number | null) => (v === null ? '—' : v);

  const narrative: [string, string][] = [
    ['Chief complaint', c.chief_complaint],
    ['History', c.history],
    ['Medications', c.medications],
    ['Nursing diagnoses', c.nursing_diagnoses],
    ['Interventions & rationale', c.interventions],
  ];

  const rubricRows = CASE_CRITERIA.map((cr) => {
    const r = ratings.get(cr.key);
    return [cr.label, r ? ratingLabel(r.rating) : '—', r?.remarks || ''];
  });

  const pdf = (
    <ReportShell
      title={`Case Presentation — ${studentName}`}
      heading="Case Presentation"
      meta={meta}
      metaRows={[
        { label: 'Student', value: studentName },
        { label: 'Presentation', value: title },
        { label: 'Patient', value: patient },
        { label: 'Hospital / ward', value: [c.hospital, c.ward].filter(Boolean).join(', ') || '—' },
        { label: 'Admitting diagnosis', value: c.admitting_diagnosis || '—' },
        { label: 'Handed in', value: `${date(c.submitted_at)}${late ? ' (late)' : ''}` },
        { label: 'Graded', value: date(c.graded_at) },
      ]}
    >
      <Text style={styles.sectionTitle}>Result</Text>
      <StatGrid
        items={[
          { label: 'Score', value: score === null ? '—' : `${score}%` },
          { label: 'Rating', value: score === null ? '—' : scoreDescriptor(score) },
        ]}
      />
      <Table head={['Criterion', 'Rating', 'Remarks']} rows={rubricRows} />
      {c.remarks ? <Text style={{ marginTop: 6 }}>Instructor remarks: {c.remarks}</Text> : null}

      {narrative.map(([label, text]) => (
        <View key={label} wrap={false}>
          <Text style={styles.sectionTitle}>{label}</Text>
          <Text>{text || '—'}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Vital signs observed</Text>
      <Table
        head={['Observed', 'HR', 'BP', 'Temp °C', 'RR', 'SpO2 %', 'Pain']}
        rows={obs.vitals.map((v) => [
          v.observed_at ? date(v.observed_at) : '—',
          n(v.heart_rate),
          v.bp_systolic != null && v.bp_diastolic != null ? `${v.bp_systolic}/${v.bp_diastolic}` : '—',
          n(v.temperature_c),
          n(v.respiratory_rate),
          n(v.oxygen_saturation),
          n(v.pain_score),
        ])}
        emptyText="No vital signs were recorded for this case."
      />
      <Text style={styles.sectionTitle}>TPR</Text>
      <Table
        head={['Observed', 'Temp °C', 'Pulse', 'Resp', 'Remarks']}
        rows={obs.tpr.map((t) => [t.observed_at ? date(t.observed_at) : '—', n(t.temperature_c), n(t.pulse), n(t.respiration), t.remarks || ''])}
        emptyText="No TPR entries were recorded for this case."
      />
      <Text style={styles.sectionTitle}>IV fluids</Text>
      <Table
        head={['Solution', 'Volume mL', 'Rate mL/hr', 'Site', 'Remarks']}
        rows={obs.ivf.map((f) => [f.solution, n(f.volume_ml), n(f.rate_ml_hr), f.site || '—', f.remarks || ''])}
        emptyText="No IV fluids were recorded for this case."
      />
    </ReportShell>
  );

  return { subject: `${studentName} ${title}`, pdf };
}
