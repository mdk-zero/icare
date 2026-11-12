import { Text, View } from '@react-pdf/renderer';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { CourseCriteria, ReportShell, StatGrid, TEAL, Table, scoreColor, styles, type ReportMeta, type ReportDocument } from './kit';
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
  plural,
  scenarioStatus,
  studentWork,
} from './data';
import { ofKind, scenarioKinds } from '../scenario-kind';
import { isActiveSkillArea } from '@/scripts/taylors-chapters';
import { CASE_CRITERIA, caseLevelLabel, isLateSubmission } from '../case-rubric';
import { isLateSubmission as isLateAttempt } from '../assessment-timing';
import { quizGrade } from '../quiz-attempts';
import { activityOfferings } from '../activity-course';
import { readMatching } from '../fetch-all';
import { scoreDescriptor } from '../task-ratings';
import { ChecklistSheet } from './checklist-sheet';
import { loadChecklistRoster, loadSheetSkills, type Performer } from './checklist-data';
import { parseTarget } from './targets';
import { competencyRemark } from '../return-demo-remarks';
import { loadActivityGrid } from './activity-data';
import { ActivityTable, type GridMember } from './activity-sheet';
import { loadGroupings } from './groupings';
import { loadQuizCriteria, loadQuizQuestions, loadQuizRoster, loadQuizTries } from './quiz-data';
import { answerRows, criterionForGroup, criterionForStudent, matrix } from './quiz-model';
import { CriterionTable, QuizAnswers, QuizMatrix } from './quiz-sheet';
import type { ScenarioKind } from '../scenario-kind';
import { loadStudentStandings, type StudentCourseStanding } from '../course-requirements';
import { isMissingCourseSchema } from '../courses';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const REPORT_TYPES = ['student', 'section', 'scenario', 'assessment', 'roster', 'discharge', 'case', 'return_demo', 'patient_case', 'quiz', 'section_group'] as const;
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
  // One group's graded case presentation (a group id, or a member's case_submissions id).
  case: true,
  // "<scenario>:student:<id>" or "<scenario>:group:<id>": one student's or one group's checklist grades.
  return_demo: true,
  // The same, for a Patient Case's checklist.
  patient_case: true,
  // "<quiz>:student:<id>" or "<quiz>:group:<id>": the questions and how each was answered.
  quiz: true,
  // One group of a section (a team id).
  section_group: true,
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
    .select('id, name, email, sections!section_id(name)')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle();
  if (!student) return { error: 'Student not found', status: 404 };

  const [groups, { data: scenarios }, cases, { data: quizAssignments }, { data: attempts }, { data: scores }, courses] =
    await Promise.all([
      groupNames(supabase, [studentId]),
      supabase
        .from('scenario_assignments')
        .select('scenario_id, status, score, submitted_at, completed_at, deadline, scenarios(title)')
        .eq('student_id', studentId)
        .order('assigned_at', { ascending: false }),
      supabase
        .from('case_submissions')
        .select('presentation_id, status, score, submitted_at, case_presentations(title, deadline)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      supabase
        .from('assessment_assignments')
        .select('assessment_id, deadline, assessments(title, time_limit_seconds)')
        .eq('student_id', studentId),
      supabase
        .from('assessment_attempts')
        .select('assessment_id, score, submitted_at, time_taken_seconds')
        .eq('student_id', studentId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('competency_scores')
        .select('score, created_at, competency_areas(name)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      studentCourses(supabase, studentId),
    ]);
  if (cases.error) console.error('Report: failed to read case submissions', cases.error);

  // The course each assigned activity was made for (070), so the work reads course by course.
  const scenarioIds = (scenarios ?? []).map((a) => a.scenario_id as string);
  const quizIds = (quizAssignments ?? []).map((a) => a.assessment_id as string);
  const presentationIds = (cases.data ?? []).map((c) => c.presentation_id as string);
  const [kinds, scenarioCourse, quizCourse, presentationCourse] = await Promise.all([
    scenarioKinds(supabase, scenarioIds),
    activityOfferings(supabase, 'scenarios', scenarioIds),
    activityOfferings(supabase, 'assessments', quizIds),
    activityOfferings(supabase, 'case_presentations', presentationIds),
  ]);

  type Row = { offering: string | null; cells: string[]; score: number | null };
  const scenarioRows: Row[] = ofKind(scenarios ?? [], kinds, 'patient_case', (a) => a.scenario_id as string).map((a) => {
    const title = (a as unknown as { scenarios: { title: string } | null }).scenarios?.title ?? 'Unknown patient case';
    const late = isLate(a.submitted_at, a.deadline);
    const score = a.status === 'completed' && a.score !== null ? Number(a.score) : null;
    return {
      offering: scenarioCourse.get(a.scenario_id as string) ?? null,
      cells: [title, scenarioStatus(a), a.submitted_at ? `${date(a.submitted_at)}${late ? ' (late)' : ''}` : '—', grade(score)],
      score,
    };
  });
  const returnDemoRows: Row[] = ofKind(scenarios ?? [], kinds, 'return_demo', (a) => a.scenario_id as string).map((a) => {
    const score = a.status === 'completed' && a.score !== null ? Number(a.score) : null;
    return {
      offering: scenarioCourse.get(a.scenario_id as string) ?? null,
      cells: [
        (a as unknown as { scenarios: { title: string } | null }).scenarios?.title ?? 'Return Demonstration',
        scenarioStatus(a),
        a.status === 'completed' && a.completed_at ? date(a.completed_at) : '—',
        grade(score),
        competencyRemark(score),
      ],
      score,
    };
  });
  const caseRows: Row[] = (cases.data ?? []).map((c) => {
    const p = (c as unknown as { case_presentations: { title: string; deadline: string | null } | null }).case_presentations;
    const late = isLate(c.submitted_at, p?.deadline ?? null);
    const score = c.status === 'graded' && c.score !== null ? Number(c.score) : null;
    return {
      offering: presentationCourse.get(c.presentation_id as string) ?? null,
      cells: [
        p?.title ?? 'Case presentation',
        CASE_STATUS_LABEL[c.status as string] ?? String(c.status),
        c.submitted_at ? `${date(c.submitted_at)}${late ? ' (late)' : ''}` : '—',
        grade(score),
      ],
      score,
    };
  });
  // One row per quiz the student was given, graded as the average of their graded tries.
  const triesOf = new Map<string, NonNullable<typeof attempts>>();
  for (const a of attempts ?? []) triesOf.set(a.assessment_id as string, [...(triesOf.get(a.assessment_id as string) ?? []), a]);
  const quizRows: Row[] = (quizAssignments ?? []).map((q) => {
    const quiz = (q as unknown as { assessments: { title: string; time_limit_seconds: number | null } | null }).assessments;
    const tries = triesOf.get(q.assessment_id as string) ?? [];
    const graded = tries.filter((t) => t.score !== null).map((t) => Number(t.score));
    const average = quizGrade(graded);
    const latest = tries[0];
    const late = latest ? isLateAttempt(latest.time_taken_seconds, quiz?.time_limit_seconds ?? null) : false;
    const score = average === null ? null : Math.round(average);
    return {
      offering: quizCourse.get(q.assessment_id as string) ?? null,
      cells: [
        quiz?.title ?? 'Unknown assessment',
        tries.length ? 'Completed' : 'Not started',
        latest ? `${date(latest.submitted_at)}${late ? ' (late)' : ''}` : '—',
        pct(score),
      ],
      score,
    };
  });
  const scoresOf = (rows: Row[]) => rows.flatMap((r) => (r.score === null ? [] : [r.score]));

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

  const section = (student as unknown as { sections: { name: string } | null }).sections?.name ?? 'Unassigned';

  // The student's courses in the order the criteria list them, then work made for no course of theirs.
  const known = new Set(courses.map((c) => c.id));
  const all = [...scenarioRows, ...returnDemoRows, ...caseRows, ...quizRows];
  const blocks = [
    ...courses.map((c) => ({ key: c.id, heading: `${c.course.code} – ${c.course.title}`, sub: `${c.term.name} – Instructor: ${c.instructor}` })),
    ...(all.some((r) => !r.offering || !known.has(r.offering))
      ? [{ key: 'none', heading: 'Not in one of their courses', sub: 'Work assigned outside a course' }]
      : []),
  ];
  const inBlock = (key: string, rows: Row[]) =>
    rows.filter((r) => (key === 'none' ? !r.offering || !known.has(r.offering) : r.offering === key));
  const tables: { title: string; head: string[]; widths?: number[]; cols?: number[]; rows: Row[] }[] = [
    // The grade says whether a patient case is done, so its table leaves out the status.
    { title: 'Patient Cases', head: ['Patient Case', 'Performed', 'Grade'], cols: [0, 2, 3], rows: scenarioRows },
    {
      title: 'Return Demonstrations',
      // The remark says whether it is done and good enough, so the status is left out.
      head: ['Return Demonstration', 'Performed', 'Grade', 'Remarks'],
      cols: [0, 2, 3, 4],
      widths: [3, 1.4, 1.9, 1.6],
      rows: returnDemoRows,
    },
    { title: 'Case Presentations', head: ['Presentation', 'Status', 'Presented', 'Grade'], rows: caseRows },
    { title: 'Quizzes', head: ['Quiz', 'Status', 'Last submitted', 'Grade'], rows: quizRows },
  ];

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
          gradeTile('Patient case average', avg(scoresOf(scenarioRows))),
          gradeTile('Case presentation average', avg(scoresOf(caseRows))),
          { label: 'Quiz average', value: pct(avg(scoresOf(quizRows))) },
        ]}
      />

      <Text style={styles.sectionTitle}>Courses and criteria for assessment</Text>
      <CourseCriteria courses={courses} />

      <Text style={styles.sectionTitle}>Assigned work by course</Text>
      {blocks.length === 0 ? (
        <Text style={styles.empty}>Nothing has been assigned to this student yet.</Text>
      ) : (
        blocks.map((b) => {
          const own = tables.map((t) => ({ ...t, rows: inBlock(b.key, t.rows) })).filter((t) => t.rows.length > 0);
          return (
            <View key={b.key} style={{ marginBottom: 6 }}>
              <Text style={styles.courseTitle}>{b.heading}</Text>
              <Text style={styles.courseSub}>{b.sub}</Text>
              {own.length === 0 ? (
                <Text style={styles.empty}>Nothing assigned to this student in this course yet.</Text>
              ) : (
                own.map((t) => (
                  <View key={t.title} wrap={false} style={{ marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 4, marginBottom: 2 }}>{t.title}</Text>
                    <Table
                      head={t.head}
                      widths={t.widths ?? (t.cols ? [3, 1.6, 2.1] : [3, 1.3, 1.3, 1.9])}
                      rows={t.rows.map((r) => (t.cols ? t.cols.map((i) => r.cells[i]) : r.cells))}
                    />
                  </View>
                ))
              )}
            </View>
          );
        })
      )}

      <Text style={styles.sectionTitle}>Skill areas</Text>
      <Table
        head={['Area', 'Ratings', 'Latest']}
        rows={areas.map(([name, a]) => [name, a.count, `${a.latest}%`])}
        emptyText="No skill area ratings recorded yet."
      />

      <Text style={note}>
        Only work assigned to the student is listed. Grades use the verbal scale instructors grade on: Excellent,
        Satisfactory or Needs Practice. A quiz grade is the average of the student&apos;s graded tries. Skill
        Assessments pass at {PASSING_SCORE}%.
      </Text>
    </ReportShell>
  );

  return { subject: student.name, pdf };
}

/** The student's courses for the report; without the course tables (065) the report leaves them out. */
async function studentCourses(supabase: Supabase, studentId: string): Promise<StudentCourseStanding[]> {
  try {
    return await loadStudentStandings(supabase, studentId);
  } catch (err) {
    if (!isMissingCourseSchema(err)) console.error('Report: failed to read the student\'s courses', err);
    return [];
  }
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

  const [groups, work, scores] = await Promise.all([
    groupNames(supabase, ids),
    studentWork(supabase, ids),
    // Every rating, paged past the 1,000-row cap.
    readMatching<{ score: number; competency_areas: { name: string } | null }>(ids, (part, from, to) =>
      supabase
        .from('competency_scores')
        .select('id, score, competency_areas(name)')
        .in('student_id', part)
        .order('id')
        .range(from, to),
    ),
  ]);

  const roster = students.map((s) => ({ ...s, group: groups.get(s.id) ?? null, work: work.get(s.id)! }));
  const scenarioAverages = roster.flatMap((r) => (r.work.scenarioAverage === null ? [] : [r.work.scenarioAverage]));
  const quizAverages = roster.flatMap((r) => (r.work.quizAverage === null ? [] : [r.work.quizAverage]));
  const demoAverages = roster.flatMap((r) => (r.work.returnDemoAverage === null ? [] : [r.work.returnDemoAverage]));
  const needsPractice = scenarioAverages.filter((s) => s < NEEDS_PRACTICE_BELOW).length;

  const byGroup = new Map<string, typeof roster>();
  for (const r of roster) {
    const key = r.group ?? 'No group';
    byGroup.set(key, [...(byGroup.get(key) ?? []), r]);
  }
  // Each group on its own, with only the work given to its members, names A to Z.
  const [grid, groupings] = await Promise.all([
    loadActivityGrid(supabase, ids),
    loadGroupings(supabase, students.map((s) => ({ id: s.id, section_id: sectionId }))),
  ]);
  const blocks = new Map<string, GridMember[]>();
  for (const st of students) {
    const name = groupings.get(st.id)?.groupName ?? 'Students not in a group';
    blocks.set(name, [...(blocks.get(name) ?? []), { name: st.name, entries: grid.get(st.id) ?? [] }]);
  }
  const groupBlocks = [...blocks.entries()]
    .sort(([a], [b]) =>
      a === 'Students not in a group' ? 1 : b === 'Students not in a group' ? -1 : a.localeCompare(b, undefined, { numeric: true }),
    )
    .map(([name, members]) => ({ name, members: [...members].sort((x, y) => x.name.localeCompare(y.name)) }));

  const byArea = new Map<string, number[]>();
  for (const s of scores) {
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
      orientation="landscape"
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
          gradeTile('Return demo average', avg(demoAverages)),
          { label: 'Quiz average', value: pct(avg(quizAverages)) },
          { label: 'Needs Practice', value: needsPractice },
        ]}
      />

      <Text style={styles.sectionTitle}>Groups</Text>
      {groupBlocks.length === 0 ? (
        <Text style={styles.empty}>No students in this section yet.</Text>
      ) : (
        groupBlocks.map((g) => (
          <ActivityTable
            key={g.name}
            members={g.members}
            heading={
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 3 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: TEAL }}>{g.name}</Text>
                <Text style={{ fontSize: 8, color: '#6b7280' }}>{plural(g.members.length, 'member')}</Text>
              </View>
            }
          />
        ))
      )}

      <Text style={styles.sectionTitle}>Skill areas (section mean)</Text>
      <Table
        head={['Area', 'Ratings', 'Mean']}
        rows={areaRows}
        emptyText="No skill area ratings recorded for this section yet."
      />
      <Text style={note}>
        Patient cases counts graded out of assigned. A quiz average is over the quizzes the student has taken, each
        graded as the average of its graded tries. Needs Practice counts students whose patient case average is
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
    .select('id, title, category')
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
      submitted: a.submitted_at,
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
        { label: 'Category', value: String(scenario.category) },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Assigned', value: rows.length },
          { label: 'Awaiting grade', value: awaiting },
          { label: 'Performed', value: graded.length },
          gradeTile('Average grade', avg(graded)),
        ]}
      />

      <Text style={styles.sectionTitle}>Grades</Text>
      <Table head={['Level', 'Students']} rows={levels} emptyText="Nothing performed yet." />

      <Text style={styles.sectionTitle}>Students</Text>
      <Table
        head={['Student', 'Group', 'Status', 'Performed', 'Grade']}
        widths={[2.4, 1, 1.4, 1.4, 1.9]}
        rows={rows.map((r) => [
          r.name,
          r.group,
          r.status,
          r.submitted ? `${date(r.submitted)}${r.late ? ' (late)' : ''}` : '—',
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
 * A quiz's results as a report for the whole class: the summary, how the
 * class did on each scoring criterion (each Taylor's skill or chapter), then
 * every section, group by group, with each student's grade. A student counts
 * when they were given the quiz (assessment_assignments) or sat it anyway:
 * target_sections only makes it visible, so it is not who was given it.
 * A student has completed it once a graded try is handed in; until then they
 * have not started it, as the results page shows them.
 */
export async function buildAssessmentReport(
  supabase: Supabase,
  meta: ReportMeta,
  assessmentId: string,
  scope: StudentScope = null,
): Promise<BuildResult> {
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, title, is_published, time_limit_seconds, max_attempts')
    .eq('id', assessmentId)
    .maybeSingle();
  if (!assessment) return { error: 'Assessment not found', status: 404 };

  const [{ data: assigned }, { data: allAttempts }, { data: criteria }] = await Promise.all([
    supabase
      .from('assessment_assignments')
      .select('student_id, deadline, users!assessment_assignments_student_id_fkey(name)')
      .eq('assessment_id', assessmentId),
    supabase
      .from('assessment_attempts')
      .select('id, student_id, status, score, submitted_at, time_taken_seconds, users(name)')
      .eq('assessment_id', assessmentId),
    supabase
      .from('assessment_criteria')
      .select('id, name, weight, sort_order')
      .eq('assessment_id', assessmentId)
      .order('sort_order', { ascending: true }),
  ]);

  const students = new Map<string, { name: string; attempts: NonNullable<typeof allAttempts> }>();
  for (const a of assigned ?? []) {
    const name = (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student';
    students.set(a.student_id as string, { name, attempts: [] });
  }
  for (const a of allAttempts ?? []) {
    const id = a.student_id as string;
    const name = (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student';
    const e = students.get(id) ?? { name, attempts: [] };
    e.attempts.push(a);
    students.set(id, e);
  }
  const inScope = [...students.entries()].filter(([id]) => !scope || scope.includes(id));
  const ids = inScope.map(([id]) => id);

  // Each student's section, for the section-by-section listing.
  const { data: people } = ids.length
    ? await supabase.from('users').select('id, section_id').in('id', ids)
    : { data: [] as { id: string; section_id: string | null }[] };
  const sectionIds = [
    ...new Set((people ?? []).map((p) => p.section_id as string | null).filter((v): v is string => !!v)),
  ];
  const [groups, { data: sectionRows }] = await Promise.all([
    groupNames(supabase, ids),
    sectionIds.length
      ? supabase.from('sections').select('id, name').in('id', sectionIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const sectionName = new Map((sectionRows ?? []).map((s) => [s.id as string, s.name as string]));
  const sectionOf = new Map(
    (people ?? []).map((p) => [p.id as string, p.section_id ? sectionName.get(p.section_id as string) : undefined]),
  );

  const rows = inScope.map(([id, s]) => {
    const submitted = s.attempts.filter((a) => a.status === 'submitted' && a.score !== null);
    const average = quizGrade(submitted.map((a) => Number(a.score)));
    const grade = average === null ? null : Math.round(average);
    const latest = submitted.map((a) => a.submitted_at as string).sort().at(-1) ?? null;
    const late = submitted.some((a) => isLateAttempt(a.time_taken_seconds, assessment.time_limit_seconds));
    return {
      id,
      name: s.name,
      section: sectionOf.get(id) ?? 'No section',
      group: groups.get(id) ?? null,
      tries: submitted.length,
      grade,
      latest,
      late,
      attemptIds: submitted.map((a) => a.id as string),
    };
  });
  type Row = (typeof rows)[number];

  const grades = rows.flatMap((r) => (r.grade === null ? [] : [r.grade]));
  const passed = grades.filter((g) => g >= PASSING_SCORE).length;
  const passRate = grades.length ? Math.round((passed / grades.length) * 100) : null;
  const bands = [
    { label: '90-100', test: (s: number) => s >= 90 },
    { label: `${PASSING_SCORE}-89`, test: (s: number) => s >= PASSING_SCORE && s < 90 },
    { label: `60-${PASSING_SCORE - 1}`, test: (s: number) => s >= 60 && s < PASSING_SCORE },
    { label: 'Below 60', test: (s: number) => s < 60 },
  ].map((b) => [b.label, grades.filter(b.test).length]);

  // The class on each criterion: questions answered right out of those served, over every graded try.
  const attemptIds = rows.flatMap((r) => r.attemptIds);
  const { data: criterionScores } = attemptIds.length
    ? await supabase.from('attempt_criteria_scores').select('criteria_id, correct, total').in('attempt_id', attemptIds)
    : { data: [] as { criteria_id: string; correct: number; total: number }[] };
  const answered = new Map<string, { correct: number; total: number }>();
  for (const c of criterionScores ?? []) {
    const t = answered.get(c.criteria_id as string) ?? { correct: 0, total: 0 };
    t.correct += Number(c.correct ?? 0);
    t.total += Number(c.total ?? 0);
    answered.set(c.criteria_id as string, t);
  }
  const criteriaRows = (criteria ?? []).map((c) => {
    const t = answered.get(c.id as string);
    return {
      name: c.name as string,
      weight: Number(c.weight),
      score: t && t.total > 0 ? Math.round((t.correct / t.total) * 100) : null,
    };
  });

  // Section, then group, in order; the students not in a group close their section.
  const bySection = new Map<string, Row[]>();
  for (const r of rows) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
  const sections = [...bySection.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([section, list]) => {
      const byGroup = new Map<string, Row[]>();
      for (const r of list) byGroup.set(r.group ?? '', [...(byGroup.get(r.group ?? '') ?? []), r]);
      const groupList = [...byGroup.entries()]
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })))
        .map(([group, members]) => ({ group, members: [...members].sort((x, y) => x.name.localeCompare(y.name)) }));
      return { section, list, groups: groupList };
    });

  const summaryLine = (list: Row[]) => {
    const g = list.flatMap((r) => (r.grade === null ? [] : [r.grade]));
    return `${g.length} of ${list.length} completed, average ${pct(avg(g))}, ${g.filter((x) => x >= PASSING_SCORE).length} passed`;
  };
  const remark = (g: number | null) => (g === null ? 'Not taken' : g >= PASSING_SCORE ? 'Passed' : 'Below passing');

  const pdf = (
    <ReportShell
      title={`Quiz Results - ${assessment.title}`}
      heading="Quiz Results Report"
      meta={meta}
      metaRows={[
        { label: 'Quiz', value: assessment.title },
        { label: 'Status', value: assessment.is_published ? 'Published' : 'Draft' },
        {
          label: 'Time limit',
          value: assessment.time_limit_seconds ? `${Math.round(assessment.time_limit_seconds / 60)} min` : 'None',
        },
        { label: 'Tries allowed', value: String(assessment.max_attempts ?? 1) },
        { label: 'Passing grade', value: `${PASSING_SCORE}%` },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Given the quiz', value: rows.length },
          { label: 'Completed', value: grades.length },
          { label: 'Not started', value: rows.length - grades.length },
          { label: 'Class average', value: pct(avg(grades)) },
          { label: `Passed (${PASSING_SCORE}% and up)`, value: grades.length ? `${passed} (${pct(passRate)})` : '—' },
        ]}
      />

      <Text style={styles.sectionTitle}>Results by criterion</Text>
      {criteriaRows.length === 0 ? (
        <Text style={styles.empty}>This quiz has no scoring criteria.</Text>
      ) : (
        <View>
          <View style={[styles.row, styles.headRow]}>
            <Text style={styles.cellWide}>Criterion</Text>
            <Text style={[styles.cell, { flex: 0.7 }]}>Weight</Text>
            <Text style={[styles.cell, { flex: 2.6 }]}>Class score</Text>
          </View>
          {criteriaRows.map((c) => (
            <View key={c.name} style={[styles.row, { alignItems: 'center' }]} wrap={false}>
              <Text style={styles.cellWide}>{c.name}</Text>
              <Text style={[styles.cell, { flex: 0.7, color: '#6b7280' }]}>{`${c.weight}%`}</Text>
              <View style={styles.barTrack}>
                {c.score !== null && (
                  <View
                    style={{
                      width: `${Math.max(c.score, 2)}%`,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: scoreColor(c.score),
                    }}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.cell,
                  {
                    flex: 0.6,
                    fontFamily: 'Helvetica-Bold',
                    color: c.score === null ? '#9ca3af' : scoreColor(c.score),
                  },
                ]}
              >
                {c.score === null ? '—' : `${c.score}%`}
              </Text>
            </View>
          ))}
          <Text style={note}>
            The share of each criterion&apos;s questions the class answered right, over every graded try. The
            shortest bars are the skills to review with the class.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Grade distribution</Text>
      <Table head={['Grade', 'Students']} rows={bands} emptyText="No one has completed the quiz yet." />

      {sections.length === 0 ? (
        <>
          <Text style={styles.sectionTitle}>Students</Text>
          <Text style={styles.empty}>This quiz has not been given to anyone yet.</Text>
        </>
      ) : (
        sections.map((sec) => (
          <View key={sec.section}>
            <Text style={styles.sectionTitle}>{`Section ${sec.section}`}</Text>
            <Text style={styles.courseSub}>{summaryLine(sec.list)}</Text>
            {sec.groups.map(({ group, members }) => (
              // A group stays on one page, its heading with its students.
              <View key={group || 'none'} style={{ marginBottom: 8 }} wrap={false}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 3 }}
                  wrap={false}
                >
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: TEAL }}>{group || 'Students not in a group'}</Text>
                  <Text style={{ fontSize: 8, color: '#6b7280' }}>{summaryLine(members)}</Text>
                </View>
                <Table
                  head={['Student', 'Tries', 'Last submitted', 'Grade', 'Remarks']}
                  widths={[2.6, 0.6, 1.6, 0.7, 1.1]}
                  rows={members.map((r) => [
                    r.name,
                    r.tries || '—',
                    r.latest ? `${date(r.latest)}${r.late ? ' (late)' : ''}` : '—',
                    pct(r.grade),
                    remark(r.grade),
                  ])}
                />
              </View>
            ))}
          </View>
        ))
      )}
      <Text style={note}>
        A grade is the average of the student&apos;s graded tries; review quizzes don&apos;t count. Late marks a try
        handed in more than a minute past the time limit; it is still graded and counted.
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
  let query = supabase.from('users').select('id, name, sections!section_id(name)').eq('role', 'student').order('name');

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
  const demoAverages = rows.flatMap((r) => (r.work.returnDemoAverage === null ? [] : [r.work.returnDemoAverage]));
  const noWork = rows.filter(
    (r) =>
      r.work.scenariosGraded === 0 &&
      r.work.returnDemosGraded === 0 &&
      r.work.casesGraded === 0 &&
      r.work.quizzesTaken === 0,
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
          gradeTile('Return demo average', avg(demoAverages)),
          { label: 'Quiz average', value: pct(avg(quizAverages)) },
          { label: 'Nothing graded yet', value: noWork },
        ]}
      />

      <Text style={styles.sectionTitle}>Students</Text>
      <Table
        head={['Student', 'Section', 'Group', 'Patient case grade', 'Return demo grade', 'Case grade', 'Quiz average']}
        widths={[2.1, 1, 1, 1.8, 1.8, 0.9, 1.1]}
        rows={rows.map((r) => [
          r.name,
          r.section,
          r.group,
          grade(r.work.scenarioAverage),
          grade(r.work.returnDemoAverage),
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

// ---------------------------------------------------------------------------
// Case presentation — one group's presentation and how it was graded
// ---------------------------------------------------------------------------

/**
 * A group's graded case presentation: who was in it, the slides it handed
 * in, and the rubric. The target is the group (093), or any member's
 * case_submissions id, which points at it.
 */
export async function buildCaseReport(
  supabase: Supabase,
  meta: ReportMeta,
  targetId: string,
  scope: StudentScope,
): Promise<BuildResult> {
  let groupId = targetId;
  const { data: direct } = await supabase.from('case_presentation_groups').select('id').eq('id', targetId).maybeSingle();
  if (!direct) {
    const { data: sub } = await supabase.from('case_submissions').select('group_id').eq('id', targetId).maybeSingle();
    const viaMember = (sub as { group_id: string | null } | null)?.group_id;
    if (!viaMember) return { error: 'Case not found', status: 404 };
    groupId = viaMember;
  }

  const { data: row } = await supabase
    .from('case_presentation_groups')
    .select(
      'id, team_name, section_name, leader_id, status, file_name, file_type, submitted_at, graded_at, score, remarks, ' +
        'case_presentations(title, deadline)',
    )
    .eq('id', groupId)
    .maybeSingle();
  if (!row) return { error: 'Case not found', status: 404 };
  const g = row as unknown as {
    id: string;
    team_name: string;
    section_name: string;
    leader_id: string | null;
    status: string;
    file_name: string | null;
    file_type: string | null;
    submitted_at: string | null;
    graded_at: string | null;
    score: number | string | null;
    remarks: string;
    case_presentations: { title: string; deadline: string | null } | null;
  };

  const [{ data: memberRows }, { data: ratingRows }] = await Promise.all([
    supabase
      .from('case_submissions')
      .select('student_id, student:users!case_submissions_student_id_fkey(name)')
      .eq('group_id', groupId),
    supabase.from('case_group_ratings').select('criterion, level, remarks').eq('group_id', groupId),
  ]);
  const members = ((memberRows ?? []) as unknown as { student_id: string; student: { name: string | null } | null }[])
    .map((m) => ({ id: m.student_id, name: m.student?.name ?? 'Unknown student', leader: m.student_id === g.leader_id }))
    .sort((a, b) => Number(b.leader) - Number(a.leader) || a.name.localeCompare(b.name));
  if (scope && !members.some((m) => scope.includes(m.id))) return { error: 'Case not found', status: 404 };
  if (g.status !== 'graded') return { error: 'This group has not been graded yet', status: 409 };

  const ratings = new Map(
    ((ratingRows ?? []) as { criterion: string; level: number; remarks: string }[]).map((r) => [r.criterion, r]),
  );
  const title = g.case_presentations?.title ?? 'Case presentation';
  const score = g.score === null ? null : Number(g.score);
  const late = isLateSubmission(g.submitted_at, g.case_presentations?.deadline ?? null);
  const leader = members.find((m) => m.leader);

  const rubricRows = CASE_CRITERIA.map((cr) => {
    const r = ratings.get(cr.key);
    const earned = r ? Math.round(((cr.weight * r.level) / 4) * 100) / 100 : null;
    return [
      cr.label,
      `${cr.weight}%`,
      r ? `${caseLevelLabel(r.level)} (${r.level})` : '—',
      earned === null ? '—' : String(earned),
      r?.remarks || '',
    ];
  });

  const pdf = (
    <ReportShell
      title={`Case Presentation — ${g.team_name}`}
      heading="Case Presentation"
      meta={meta}
      metaRows={[
        { label: 'Group', value: [g.team_name, g.section_name].filter(Boolean).join(' · ') },
        { label: 'Presentation', value: title },
        { label: 'Leader', value: leader?.name ?? '—' },
        { label: 'Slides', value: g.file_name ?? '—' },
        { label: 'Presented', value: `${date(g.submitted_at)}${late ? ' (late)' : ''}` },
      ]}
    >
      <Text style={styles.sectionTitle}>Result</Text>
      <StatGrid
        items={[
          { label: 'Group score', value: score === null ? '—' : `${score}%` },
          { label: 'Rating', value: score === null ? '—' : scoreDescriptor(score) },
          { label: 'Members', value: String(members.length) },
        ]}
      />
      <Table head={['Criterion', 'Weight', 'Level', 'Points', 'Remarks']} widths={[3, 0.8, 1.4, 0.8, 2]} rows={rubricRows} />
      {g.remarks ? <Text style={{ marginTop: 6 }}>Instructor remarks: {g.remarks}</Text> : null}

      <Text style={styles.sectionTitle}>Members</Text>
      <Text style={{ marginBottom: 4 }}>Graded as a group: every member receives the group score.</Text>
      <Table
        head={['Member', 'Role']}
        widths={[3, 1]}
        rows={members.map((m) => [m.name, m.leader ? 'Group leader' : 'Member'])}
        emptyText="No members are recorded for this group."
      />
    </ReportShell>
  );

  return { subject: `${g.team_name} ${title}`, pdf };
}

// ---------------------------------------------------------------------------
// Return Demonstration — the checklist and its grades, per student or per group
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Return Demonstration and Patient Case — the checklist and its grades, per student or per group
// ---------------------------------------------------------------------------

const statusOf = (p: Performer) => (p.status === 'completed' ? 'Performed' : p.status === 'in_progress' ? 'In progress' : 'Not yet performed');

const CHECKLIST_REPORT: Record<ScenarioKind, { heading: string; noun: string }> = {
  return_demo: { heading: 'Return Demonstration Report', noun: 'Return Demonstration' },
  patient_case: { heading: 'Patient Case Report', noun: 'Patient Case' },
};

/**
 * One scenario's checklist with the grade beside each step: for a single
 * student, or for a group with a column per member. The target id says which
 * (see parseTarget). A Return Demonstration and a Patient Case are graded the
 * same way, so one builder lays out both.
 */
export async function buildChecklistReport(
  supabase: Supabase,
  meta: ReportMeta,
  kind: ScenarioKind,
  id: string,
  scope: StudentScope,
): Promise<BuildResult> {
  const { heading, noun } = CHECKLIST_REPORT[kind];
  const target = parseTarget(id);
  if (!target) return { error: `${noun} not found`, status: 404 };
  const roster = await loadChecklistRoster(supabase, kind, target.parentId, scope);
  if (!roster) return { error: `${noun} not found`, status: 404 };

  const members =
    target.kind === 'student'
      ? roster.performers.filter((p) => p.studentId === target.studentId)
      : roster.performers.filter((p) => p.teamId === target.teamId);
  if (members.length === 0) return { error: `${noun} not found`, status: 404 };

  const skills = await loadSheetSkills(supabase, target.parentId, members.map((m) => m.assignmentId));

  if (target.kind === 'student') {
    const p = members[0];
    const pdf = (
      <ReportShell
        title={`${noun} - ${roster.title} - ${p.name}`}
        heading={heading}
        meta={meta}
        metaRows={[
          { label: noun, value: roster.title },
          { label: 'Student', value: p.name },
          { label: 'Group', value: p.groupLabel },
          { label: 'Date of performance', value: date(p.deadline) },
          { label: 'Performed', value: date(p.completedAt) },
        ]}
      >
        <Text style={styles.sectionTitle}>Result</Text>
        <StatGrid
          items={[
            { label: 'Score', value: pct(p.score) },
            { label: 'Rating', value: p.score === null ? '—' : scoreDescriptor(p.score) },
            // A Return Demonstration's remark already says where it stands, so it has no status tile.
            ...(kind === 'return_demo'
              ? [{ label: 'Remarks', value: competencyRemark(p.score) }]
              : [{ label: 'Status', value: statusOf(p) }]),
          ]}
        />
        <Text style={styles.sectionTitle}>Checklist and grades</Text>
        <ChecklistSheet columns={['Grade']} skills={skills} />
      </ReportShell>
    );
    return { subject: `${roster.title} ${p.name}`, pdf };
  }

  const graded = members.flatMap((m) => (m.score === null ? [] : [m.score]));
  const groupLabel = members[0].groupLabel;
  const pdf = (
    <ReportShell
      title={`${noun} - ${roster.title} - ${groupLabel}`}
      heading={heading}
      orientation="landscape"
      meta={meta}
      metaRows={[
        { label: noun, value: roster.title },
        { label: 'Group', value: groupLabel },
        { label: 'Members', value: String(members.length) },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Members', value: members.length },
          { label: 'Performed', value: graded.length },
          gradeTile('Group average', avg(graded)),
        ]}
      />
      <Text style={styles.sectionTitle}>Members</Text>
      <Table
        head={kind === 'return_demo' ? ['Member', 'Date of performance', 'Score', 'Remarks'] : ['Member', 'Date of performance', 'Status', 'Score']}
        widths={kind === 'return_demo' ? [3, 1.6, 1.8, 1.6] : [3, 1.6, 1.4, 1.6]}
        rows={members.map((m) =>
          kind === 'return_demo'
            ? [m.name, date(m.deadline), grade(m.score), competencyRemark(m.score)]
            : [m.name, date(m.deadline), statusOf(m), grade(m.score)],
        )}
      />
      <Text style={styles.sectionTitle}>Checklist and grades</Text>
      <ChecklistSheet columns={members.map((m) => m.name)} skills={skills} />
    </ReportShell>
  );
  return { subject: `${roster.title} ${groupLabel}`, pdf };
}

// ---------------------------------------------------------------------------
// Section group — one group of a section, member by member
// ---------------------------------------------------------------------------

export async function buildSectionGroupReport(
  supabase: Supabase,
  meta: ReportMeta,
  teamId: string,
  scope: StudentScope = null,
): Promise<BuildResult> {
  const { data: team } = await supabase.from('teams').select('id, name, section_id, sections(name)').eq('id', teamId).maybeSingle();
  if (!team) return { error: 'Group not found', status: 404 };
  const sectionName = (team as unknown as { sections: { name: string } | null }).sections?.name ?? 'Section';

  const { data: memberRows } = await supabase
    .from('team_members')
    .select('student_id, users:student_id(name)')
    .eq('team_id', teamId);
  const members = ((memberRows ?? []) as unknown as { student_id: string; users: { name: string | null } | null }[])
    .filter((m) => !scope || scope.includes(m.student_id))
    .map((m) => ({ id: m.student_id, name: m.users?.name ?? 'Unknown student' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (members.length === 0) return { error: 'Group not found', status: 404 };

  const [work, grid] = await Promise.all([
    studentWork(supabase, members.map((m) => m.id)),
    loadActivityGrid(supabase, members.map((m) => m.id)),
  ]);
  const rows = members.map((m) => ({ ...m, work: work.get(m.id)! }));
  const gridMembers: GridMember[] = members.map((m) => ({ name: m.name, entries: grid.get(m.id) ?? [] }));
  const caseAverages = rows.flatMap((r) => (r.work.scenarioAverage === null ? [] : [r.work.scenarioAverage]));
  const demoAverages = rows.flatMap((r) => (r.work.returnDemoAverage === null ? [] : [r.work.returnDemoAverage]));
  const quizAverages = rows.flatMap((r) => (r.work.quizAverage === null ? [] : [r.work.quizAverage]));

  const pdf = (
    <ReportShell
      title={`Group Report - ${sectionName} - ${team.name}`}
      heading="Group Performance Report"
      orientation="landscape"
      meta={meta}
      metaRows={[
        { label: 'Group', value: `${sectionName} · ${team.name}` },
        { label: 'Members', value: String(rows.length) },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Members', value: rows.length },
          gradeTile('Patient case average', avg(caseAverages)),
          gradeTile('Return demo average', avg(demoAverages)),
          { label: 'Quiz average', value: pct(avg(quizAverages)) },
        ]}
      />
      <Text style={styles.sectionTitle}>Work given to this group</Text>
      <ActivityTable members={gridMembers} />
      <Text style={note}>
        Only the work assigned to the group&apos;s members is listed. A dash means it is not done yet; a blank means
        it was not given to that member.
      </Text>
    </ReportShell>
  );
  return { subject: `${sectionName} ${team.name}`, pdf };
}

// ---------------------------------------------------------------------------
// Quiz — the questions, and how one student or a group answered them
// ---------------------------------------------------------------------------

export async function buildQuizDetailReport(
  supabase: Supabase,
  meta: ReportMeta,
  id: string,
  scope: StudentScope,
): Promise<BuildResult> {
  const target = parseTarget(id);
  if (!target) return { error: 'Quiz not found', status: 404 };
  const roster = await loadQuizRoster(supabase, target.parentId, scope);
  if (!roster) return { error: 'Quiz not found', status: 404 };

  const members =
    target.kind === 'student'
      ? roster.performers.filter((p) => p.studentId === target.studentId)
      : roster.performers.filter((p) => p.teamId === target.teamId);
  if (members.length === 0) return { error: 'Quiz not found', status: 404 };

  const [questions, criteria, tries] = await Promise.all([
    loadQuizQuestions(supabase, target.parentId),
    loadQuizCriteria(supabase, target.parentId),
    loadQuizTries(supabase, target.parentId, members.map((m) => m.studentId)),
  ]);

  if (target.kind === 'student') {
    const p = members[0];
    const taken = tries.get(p.studentId) ?? [];
    const pdf = (
      <ReportShell
        title={`Quiz - ${roster.title} - ${p.name}`}
        heading="Quiz Answers Report"
        meta={meta}
        metaRows={[
          { label: 'Quiz', value: roster.title },
          { label: 'Student', value: p.name },
          { label: 'Group', value: p.groupLabel },
          { label: 'Submitted tries', value: String(p.tries) },
        ]}
      >
        <Text style={styles.sectionTitle}>Result</Text>
        <StatGrid
          items={[
            { label: 'Grade', value: pct(p.grade) },
            { label: 'Submitted tries', value: p.tries },
            { label: 'Remarks', value: p.grade === null ? 'Not taken' : p.grade >= PASSING_SCORE ? 'Passed' : 'Below passing' },
          ]}
        />
        <Text style={styles.sectionTitle}>Results by criterion</Text>
        <CriterionTable columns={['Correct']} rows={criterionForStudent(questions, criteria, taken)} />
        {taken.length === 0 ? (
          <Text style={styles.empty}>{p.name} has not submitted a try yet.</Text>
        ) : (
          taken.map((t) => (
            <View key={t.number}>
              <Text style={styles.sectionTitle}>
                {`Try ${t.number} - ${pct(t.score === null ? null : Math.round(t.score))}${t.submittedAt ? ` - ${date(t.submittedAt)}` : ''}`}
              </Text>
              <QuizAnswers rows={answerRows(questions, criteria, t)} />
            </View>
          ))
        )}
        <Text style={note}>
          The grade is the average of the graded tries; review quizzes don&apos;t count. Each question is shown as the
          student was served it.
        </Text>
      </ReportShell>
    );
    return { subject: `${roster.title} ${p.name}`, pdf };
  }

  const latest = members.map((m) => ({ name: m.name, latest: tries.get(m.studentId)?.at(-1) ?? null }));
  const { columns, rows } = matrix(questions, criteria, latest);
  const grades = members.flatMap((m) => (m.grade === null ? [] : [m.grade]));
  const groupLabel = members[0].groupLabel;
  const pdf = (
    <ReportShell
      title={`Quiz - ${roster.title} - ${groupLabel}`}
      heading="Quiz Answers Report"
      orientation="landscape"
      meta={meta}
      metaRows={[
        { label: 'Quiz', value: roster.title },
        { label: 'Group', value: groupLabel },
        { label: 'Members', value: String(members.length) },
      ]}
    >
      <Text style={styles.sectionTitle}>Summary</Text>
      <StatGrid
        items={[
          { label: 'Members', value: members.length },
          { label: 'Completed', value: grades.length },
          { label: 'Group average', value: pct(avg(grades)) },
        ]}
      />
      <Text style={styles.sectionTitle}>Members</Text>
      <Table
        head={['Member', 'Submitted tries', 'Grade', 'Remarks']}
        widths={[3, 1.2, 1.2, 1.6]}
        rows={members.map((m) => [
          m.name,
          m.tries || '—',
          pct(m.grade),
          m.grade === null ? 'Not taken' : m.grade >= PASSING_SCORE ? 'Passed' : 'Below passing',
        ])}
      />
      <Text style={styles.sectionTitle}>Results by criterion</Text>
      <CriterionTable columns={members.map((m) => m.name)} rows={criterionForGroup(questions, criteria, latest)} />
      <Text style={styles.sectionTitle}>Questions</Text>
      <QuizMatrix columns={columns} rows={rows} />
      <Text style={note}>
        Each member&apos;s latest graded try. A dash means the question was not served to that member.
      </Text>
    </ReportShell>
  );
  return { subject: `${roster.title} ${groupLabel}`, pdf };
}
