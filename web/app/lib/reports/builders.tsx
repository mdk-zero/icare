import { Text, View } from '@react-pdf/renderer';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { GRID_AHEAD, Note, ReportShell, Section, StatGrid, TEAL, Table, scoreColor, scoreTile, styles, type ReportMeta, type ReportDocument } from './kit';
import {
  CASE_STATUS_LABEL,
  PASSING_SCORE,
  avg,
  date,
  grade,
  groupNames,
  isLate,
  pct,
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
import type { GridMember } from './activity-sheet';
import { GroupReportBody, RosterReportBody, SectionReportBody, type GroupMember, type RosterStudent, type SectionStudent } from './cohort-sheet';
import { StudentReportBody, type SkillAreaRating, type StudentWorkItem } from './student-sheet';
import { addScore, emptyTotals } from './view';
import { getLatestRiskByStudent } from '../faculty-dashboard';
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
    .select('id, name, sections!section_id(name)')
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
        .select('assessment_id, score, submitted_at, time_taken_seconds, assessments(title, time_limit_seconds)')
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

  type QuizInfo = { title: string; time_limit_seconds: number | null } | null;
  // A quiz the student sat counts even when it was never assigned to them (visibility is by section), as it does in the Analytics figures.
  const triesOf = new Map<string, NonNullable<typeof attempts>>();
  for (const a of attempts ?? []) triesOf.set(a.assessment_id as string, [...(triesOf.get(a.assessment_id as string) ?? []), a]);
  const quizIds = [...new Set([...(quizAssignments ?? []).map((a) => a.assessment_id as string), ...triesOf.keys()])];

  // The course each assigned activity was made for (070), so the work reads course by course.
  const scenarioIds = (scenarios ?? []).map((a) => a.scenario_id as string);
  const presentationIds = (cases.data ?? []).map((c) => c.presentation_id as string);
  const [kinds, scenarioCourse, quizCourse, presentationCourse] = await Promise.all([
    scenarioKinds(supabase, scenarioIds),
    activityOfferings(supabase, 'scenarios', scenarioIds),
    activityOfferings(supabase, 'assessments', quizIds),
    activityOfferings(supabase, 'case_presentations', presentationIds),
  ]);

  // Where an unfinished row sits among its kind: awaiting a grade, then in progress, then not started.
  const stageOf = (state: 'awaiting' | 'progress' | 'none') => (state === 'awaiting' ? 0 : state === 'progress' ? 1 : 2);
  const scenarioItem = (kind: 'patient_case' | 'return_demo') => (a: NonNullable<typeof scenarios>[number]): StudentWorkItem => {
    const title = (a as unknown as { scenarios: { title: string } | null }).scenarios?.title ?? (kind === 'patient_case' ? 'Unknown Patient Case' : 'Return Demonstration');
    const label = scenarioStatus(a);
    return {
      kind,
      offering: scenarioCourse.get(a.scenario_id as string) ?? null,
      title,
      status: label,
      // A Return Demonstration is dated by when it was performed, a Patient Case by when it was handed in.
      at: kind === 'return_demo' ? (a.status === 'completed' ? a.completed_at : null) : a.submitted_at,
      late: kind === 'patient_case' && isLate(a.submitted_at, a.deadline),
      score: a.status === 'completed' && a.score !== null ? Number(a.score) : null,
      tries: 0,
      overdue: label === 'Overdue',
      awaiting: label === 'Awaiting grade',
      stage: stageOf(label === 'Awaiting grade' ? 'awaiting' : label === 'In progress' ? 'progress' : 'none'),
    };
  };
  const caseItems: StudentWorkItem[] = (cases.data ?? []).map((c) => {
    const p = (c as unknown as { case_presentations: { title: string; deadline: string | null } | null }).case_presentations;
    return {
      kind: 'case_presentation',
      offering: presentationCourse.get(c.presentation_id as string) ?? null,
      title: p?.title ?? 'Case Presentation',
      status: CASE_STATUS_LABEL[c.status as string] ?? String(c.status),
      at: c.submitted_at,
      late: isLate(c.submitted_at, p?.deadline ?? null),
      score: c.status === 'graded' && c.score !== null ? Number(c.score) : null,
      tries: 0,
      overdue: false,
      awaiting: c.status === 'submitted',
      stage: stageOf(c.status === 'submitted' ? 'awaiting' : c.status === 'draft' ? 'progress' : 'none'),
    };
  });
  // One row per quiz, graded as the average of its graded tries.
  const quizItems: StudentWorkItem[] = quizIds.map((quizId) => {
    const given = (quizAssignments ?? []).find((q) => q.assessment_id === quizId);
    const tries = triesOf.get(quizId) ?? [];
    const quiz = ((given as unknown as { assessments: QuizInfo } | undefined)?.assessments ??
      (tries[0] as unknown as { assessments: QuizInfo } | undefined)?.assessments) ?? null;
    const graded = tries.filter((t) => t.score !== null).map((t) => Number(t.score));
    const average = quizGrade(graded);
    const latest = tries[0];
    return {
      kind: 'quiz',
      offering: quizCourse.get(quizId) ?? null,
      title: quiz?.title ?? 'Unknown quiz',
      status: tries.length ? 'Completed' : 'Not started',
      at: latest?.submitted_at ?? null,
      late: latest ? isLateAttempt(latest.time_taken_seconds, quiz?.time_limit_seconds ?? null) : false,
      score: average === null ? null : Math.round(average),
      tries: graded.length,
      overdue: false,
      awaiting: false,
      stage: tries.length ? 0 : 2,
    };
  });
  const items = [
    ...ofKind(scenarios ?? [], kinds, 'patient_case', (a) => a.scenario_id as string).map(scenarioItem('patient_case')),
    ...ofKind(scenarios ?? [], kinds, 'return_demo', (a) => a.scenario_id as string).map(scenarioItem('return_demo')),
    ...caseItems,
    ...quizItems,
  ];

  // The same addScore every report uses, so this report and the Section, Group and Roster ones cannot differ.
  const totals = emptyTotals();
  for (const i of items) if (i.kind !== 'quiz' && i.score !== null) addScore(totals, i.kind, i.score);
  for (const t of attempts ?? []) if (t.score !== null) addScore(totals, 'quiz', Number(t.score));

  // Rows arrive newest-first, so the first hit per area is the latest score.
  const byArea = new Map<string, SkillAreaRating>();
  for (const record of scores ?? []) {
    const name = (record as unknown as { competency_areas: { name: string } | null }).competency_areas?.name ?? 'Unknown';
    if (!isActiveSkillArea(name) || byArea.has(name)) continue;
    byArea.set(name, { name, latest: Math.round(Number(record.score)), ratedAt: record.created_at as string | null });
  }

  const section = (student as unknown as { sections: { name: string } | null }).sections?.name ?? 'Unassigned';

  const pdf = (
    <ReportShell
      title="Student Progress Report"
      subject={student.name}
      meta={meta}
      metaRows={[
        { label: 'Section', value: section },
        { label: 'Group', value: groups.get(studentId) ?? 'No group' },
      ]}
    >
      <StudentReportBody totals={totals} items={items} courses={courses} areas={[...byArea.values()]} />
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

const NO_GROUP = 'Students not in a group';

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

  const [groups, work, scores, risks] = await Promise.all([
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
    // The same prediction the dashboards show, so the PDF agrees with them.
    getLatestRiskByStudent(supabase, ids),
  ]);

  // Each group on its own, with only the work given to its members, names A to Z.
  const [grid, groupings] = await Promise.all([
    loadActivityGrid(supabase, ids),
    loadGroupings(supabase, students.map((s) => ({ id: s.id, section_id: sectionId }))),
  ]);
  const blocks = new Map<string, GridMember[]>();
  for (const st of students) {
    const name = groupings.get(st.id)?.groupName ?? NO_GROUP;
    blocks.set(name, [...(blocks.get(name) ?? []), { name: st.name, entries: grid.get(st.id) ?? [] }]);
  }
  const groupBlocks = [...blocks.entries()]
    .sort(([a], [b]) => (a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([name, members]) => ({ name, members: [...members].sort((x, y) => x.name.localeCompare(y.name)) }));

  const byArea = new Map<string, number[]>();
  for (const s of scores) {
    const name = s.competency_areas?.name ?? 'Unknown';
    if (!isActiveSkillArea(name)) continue;
    byArea.set(name, [...(byArea.get(name) ?? []), Number(s.score)]);
  }
  const areas = [...byArea.entries()].map(([name, list]) => ({ name, ratings: list.length, mean: avg(list) }));

  const roster: SectionStudent[] = students.map((s) => {
    const risk = risks.get(s.id)?.risk;
    return {
      name: s.name,
      group: groups.get(s.id) ?? null,
      totals: work.get(s.id)?.totals ?? emptyTotals(),
      prediction: risk === undefined ? 'none' : risk === 'at_risk' ? 'at_risk' : 'on_track',
    };
  });

  // A faculty scope shows only some of the section; say so, so the figures are not read as the whole class's.
  const trimmed = (sectionStudents ?? []).length - students.length;

  const pdf = (
    <ReportShell
      title="Section Performance Report"
      subject={section.name}
      orientation="landscape"
      meta={meta}
      metaRows={
        trimmed > 0 ? [{ label: 'Students shown', value: `${students.length} of ${(sectionStudents ?? []).length} (your students only)` }] : []
      }
    >
      <SectionReportBody students={roster} groups={groupBlocks} areas={areas} />
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
      title="Patient Case Results Report"
      subject={scenario.title}
      meta={meta}
      metaRows={[
        { label: 'Category', value: String(scenario.category) },
      ]}
    >
      <Section title="Summary" />
      <StatGrid
        items={[
          { label: 'Assigned', value: rows.length },
          { label: 'Awaiting grade', value: awaiting },
          { label: 'Performed', value: graded.length },
          scoreTile('Average grade', avg(graded)),
        ]}
      />

      <Section title="Grades" />
      <Table head={['Level', 'Students']} rows={levels} emptyText="Nothing performed yet." />

      <Section title="Students" />
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
      title="Quiz Results Report"
      subject={assessment.title}
      meta={meta}
      metaRows={[
        { label: 'Status', value: assessment.is_published ? 'Published' : 'Draft' },
        {
          label: 'Time limit',
          value: assessment.time_limit_seconds ? `${Math.round(assessment.time_limit_seconds / 60)} min` : 'None',
        },
        { label: 'Tries allowed', value: String(assessment.max_attempts ?? 1) },
        { label: 'Passing grade', value: `${PASSING_SCORE}%` },
      ]}
    >
      <Section title="Summary" />
      <StatGrid
        items={[
          { label: 'Given the quiz', value: rows.length },
          { label: 'Completed', value: grades.length },
          { label: 'Not started', value: rows.length - grades.length },
          scoreTile('Class average', avg(grades)),
          { label: `Passed (${PASSING_SCORE}% and up)`, value: grades.length ? `${passed} (${pct(passRate)})` : '—' },
        ]}
      />

      <Section title="Results by criterion" />
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
                    fontWeight: 700,
                    color: c.score === null ? '#9ca3af' : scoreColor(c.score),
                  },
                ]}
              >
                {c.score === null ? '—' : `${c.score}%`}
              </Text>
            </View>
          ))}
          <Note>
            The share of each criterion&apos;s questions the class answered right, over every graded try. The
            shortest bars are the skills to review with the class.
          </Note>
        </View>
      )}

      <Section title="Grade distribution" />
      <Table head={['Grade', 'Students']} rows={bands} emptyText="No one has completed the quiz yet." />

      {sections.length === 0 ? (
        <>
          <Section title="Students" />
          <Text style={styles.empty}>This quiz has not been given to anyone yet.</Text>
        </>
      ) : (
        sections.map((sec) => (
          <View key={sec.section}>
            <Section title={`Section ${sec.section}`} caption={summaryLine(sec.list)} />
            {sec.groups.map(({ group, members }) => (
              // A group stays on one page, its heading with its students.
              <View key={group || 'none'} style={{ marginBottom: 8 }} wrap={false}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 3 }}
                  wrap={false}
                >
                  <Text style={{ fontWeight: 700, color: TEAL }}>{group || 'Students not in a group'}</Text>
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
      <Note>
        A grade is the average of the student&apos;s graded tries; review quizzes don&apos;t count. Late marks a try
        handed in more than a minute past the time limit; it is still graded and counted.
      </Note>
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

  const rows: RosterStudent[] = (students ?? []).map((s) => ({
    name: s.name,
    section: (s as unknown as { sections: { name: string } | null }).sections?.name ?? 'Unassigned',
    group: groups.get(s.id) ?? null,
    totals: work.get(s.id)?.totals ?? emptyTotals(),
  }));

  const pdf = (
    <ReportShell
      title="Roster Summary Report"
      subject={session.role === 'admin' ? 'Your students' : 'Your groups'}
      meta={meta}
      metaRows={[]}
    >
      <RosterReportBody students={rows} />
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
      title="Discharge Summary"
      subject={`${name}${patient?.age != null ? `, ${patient.age}` : ''}`}
      meta={meta}
      metaRows={[
        { label: 'Record ID', value: patient?.mimic_id ?? '—' },
        { label: 'Diagnosis', value: summary.diagnosis || '—' },
        { label: 'Room', value: summary.room_label || '—' },
        { label: 'Admitted', value: date(summary.admitted_at) },
        { label: 'Discharged', value: date(summary.discharged_at) },
        { label: 'Length of stay', value: days === null ? '—' : `${days} day(s)` },
      ]}
    >
      <Section title="Stay at a glance" />
      <StatGrid
        items={[
          { label: 'Vitals readings', value: vitals.readings ?? 0 },
          { label: 'Flagged', value: vitals.flagged ?? 0 },
          { label: 'TPR sheets', value: ehr.tpr ?? 0 },
          { label: 'IVF records', value: ehr.ivf ?? 0 },
          { label: 'Progress notes', value: ehr.notes ?? 0 },
        ]}
      />

      <Section title="Vital signs over the stay" />
      <Table
        head={['Vital', 'Min', 'Avg', 'Max', 'Readings']}
        rows={vitalRows}
        emptyText="No vital signs were charted during this stay."
      />

      <Section title="Abnormal findings" />
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

      <Section title="Follow-up recommendations" />
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
      title="Case Presentation Report"
      subject={title}
      meta={meta}
      metaRows={[
        { label: 'Group', value: [g.team_name, g.section_name].filter(Boolean).join(' · ') },
        { label: 'Leader', value: leader?.name ?? '—' },
        { label: 'Slides', value: g.file_name ?? '—' },
        { label: 'Presented', value: `${date(g.submitted_at)}${late ? ' (late)' : ''}` },
      ]}
    >
      <Section title="Result" />
      <StatGrid
        items={[
          { label: 'Group score', value: score === null ? '—' : `${score}%` },
          { label: 'Rating', value: score === null ? '—' : scoreDescriptor(score) },
          { label: 'Members', value: String(members.length) },
        ]}
      />
      <Table head={['Criterion', 'Weight', 'Level', 'Points', 'Remarks']} widths={[3, 0.8, 1.4, 0.8, 2]} rows={rubricRows} />
      {g.remarks ? <Text style={{ marginTop: 6 }}>Instructor remarks: {g.remarks}</Text> : null}

      <Section title="Members" />
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
        title={heading}
        subject={p.name}
        runningLabel={`${p.name} · ${roster.title}`}
        meta={meta}
        metaRows={[
          { label: noun, value: roster.title },
          { label: 'Group', value: p.groupLabel },
          { label: 'Date of performance', value: date(p.deadline) },
          { label: 'Performed', value: date(p.completedAt) },
        ]}
      >
        <Section title="Result" />
        <StatGrid
          items={[
            scoreTile('Score', p.score, ''),
            { label: 'Rating', value: p.score === null ? '—' : scoreDescriptor(p.score) },
            // A Return Demonstration's remark already says where it stands, so it has no status tile.
            ...(kind === 'return_demo'
              ? [{ label: 'Remarks', value: competencyRemark(p.score) }]
              : [{ label: 'Status', value: statusOf(p) }]),
          ]}
        />
        <Section title="Checklist and grades" ahead={GRID_AHEAD} />
        <ChecklistSheet columns={['Grade']} skills={skills} />
      </ReportShell>
    );
    return { subject: `${roster.title} ${p.name}`, pdf };
  }

  const graded = members.flatMap((m) => (m.score === null ? [] : [m.score]));
  const groupLabel = members[0].groupLabel;
  const pdf = (
    <ReportShell
      title={heading}
      subject={groupLabel}
      runningLabel={`${groupLabel} · ${roster.title}`}
      orientation="landscape"
      audience="instructor-copy"
      meta={meta}
      metaRows={[{ label: noun, value: roster.title }]}
    >
      <Section title="Summary" />
      <StatGrid
        items={[
          { label: 'Members', value: members.length },
          { label: 'Performed', value: graded.length },
          scoreTile('Group average', avg(graded)),
        ]}
      />
      <Section title="Members" />
      <Table
        head={kind === 'return_demo' ? ['Member', 'Date of performance', 'Score', 'Remarks'] : ['Member', 'Date of performance', 'Status', 'Score']}
        widths={kind === 'return_demo' ? [3, 1.6, 1.8, 1.6] : [3, 1.6, 1.4, 1.6]}
        rows={members.map((m) =>
          kind === 'return_demo'
            ? [m.name, date(m.deadline), grade(m.score), competencyRemark(m.score)]
            : [m.name, date(m.deadline), statusOf(m), grade(m.score)],
        )}
      />
      <Section title="Checklist and grades" ahead={GRID_AHEAD} />
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
  const rows: GroupMember[] = members.map((m) => ({
    name: m.name,
    entries: grid.get(m.id) ?? [],
    totals: work.get(m.id)?.totals ?? emptyTotals(),
  }));

  const pdf = (
    <ReportShell
      title="Group Performance Report"
      subject={`${sectionName} · ${team.name}`}
      orientation="landscape"
      audience="instructor-copy"
      meta={meta}
      metaRows={[]}
    >
      <GroupReportBody members={rows} />
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
        title="Quiz Answers Report"
        subject={p.name}
        runningLabel={`${p.name} · ${roster.title}`}
        meta={meta}
        metaRows={[
          { label: 'Quiz', value: roster.title },
          { label: 'Group', value: p.groupLabel },
          { label: 'Submitted tries', value: String(p.tries) },
        ]}
      >
        <Section title="Result" />
        <StatGrid
          items={[
            scoreTile('Grade', p.grade),
            { label: 'Submitted tries', value: p.tries },
            { label: 'Remarks', value: p.grade === null ? 'Not taken' : p.grade >= PASSING_SCORE ? 'Passed' : 'Below passing' },
          ]}
        />
        <Section title="Results by criterion" />
        <CriterionTable columns={['Correct']} rows={criterionForStudent(questions, criteria, taken)} />
        {taken.length === 0 ? (
          <Text style={styles.empty}>{p.name} has not submitted a try yet.</Text>
        ) : (
          taken.map((t) => (
            <View key={t.number}>
              <Section
                title={`Try ${t.number} - ${pct(t.score === null ? null : Math.round(t.score))}${t.submittedAt ? ` - ${date(t.submittedAt)}` : ''}`}
              />
              <QuizAnswers rows={answerRows(questions, criteria, t)} />
            </View>
          ))
        )}
        <Note>
          The grade is the average of the graded tries; review quizzes don&apos;t count. Each question is shown as the
          student was served it.
        </Note>
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
      title="Quiz Answers Report"
      subject={groupLabel}
      runningLabel={`${groupLabel} · ${roster.title}`}
      orientation="landscape"
      audience="instructor-copy"
      meta={meta}
      metaRows={[{ label: 'Quiz', value: roster.title }]}
    >
      <Section title="Summary" />
      <StatGrid
        items={[
          { label: 'Members', value: members.length },
          { label: 'Completed', value: grades.length },
          scoreTile('Group average', avg(grades)),
        ]}
      />
      <Section title="Members" />
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
      <Section title="Results by criterion" ahead={GRID_AHEAD} />
      <CriterionTable columns={members.map((m) => m.name)} rows={criterionForGroup(questions, criteria, latest)} />
      <Section title="Questions" ahead={GRID_AHEAD} />
      <QuizMatrix columns={columns} rows={rows} />
      <Note>
        Each member&apos;s latest graded try. A dash means the question was not served to that member.
      </Note>
    </ReportShell>
  );
  return { subject: `${roster.title} ${groupLabel}`, pdf };
}
