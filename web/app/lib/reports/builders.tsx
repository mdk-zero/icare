import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getFacultyStudentIds } from '@/app/lib/roster';
import { ReportShell, type ReportMeta, type ReportDocument } from './kit';
import { CASE_STATUS_LABEL, avg, groupNames, isLate, scenarioStatus, studentWork } from './data';
import { ofKind, scenarioKinds } from '../scenario-kind';
import { isActiveSkillArea } from '@/scripts/taylors-chapters';
import { isLateSubmission } from '../case-rubric';
import { isLateSubmission as isLateAttempt } from '../assessment-timing';
import { quizGrade } from '../quiz-attempts';
import { activityOfferings } from '../activity-course';
import { readMatching } from '../fetch-all';
import { loadChecklistRoster, loadSheetSkills } from './checklist-data';
import { CHECKLIST_NOUN, ChecklistGroupBody, ChecklistStudentBody, checklistStudentMeta } from './checklist-report';
import { AssessmentReportBody, ScenarioReportBody, assessmentMeta, classSkillScores, type AssessmentCriterion, type AssessmentStudent, type ScenarioStudent } from './class-sheet';
import { CaseReportBody, caseMeta } from './case-sheet';
import { DischargeReportBody, dischargeMeta, stayDays, type DischargeDigest, type FollowUp } from './discharge-sheet';
import { QuizGroupBody, QuizStudentBody, quizStudentMeta } from './quiz-report';
import { parseTarget } from './targets';
import { loadActivityGrid } from './activity-data';
import type { GridMember } from './activity-sheet';
import { GroupReportBody, RosterReportBody, SectionReportBody, type GroupMember, type RosterStudent, type SectionStudent } from './cohort-sheet';
import { StudentReportBody, type SkillAreaRating, type StudentWorkItem } from './student-sheet';
import { addScore, emptyTotals } from './view';
import { getLatestRiskByStudent } from '../faculty-dashboard';
import { loadGroupings } from './groupings';
import { loadQuizCriteria, loadQuizQuestions, loadQuizRoster, loadQuizTries } from './quiz-data';
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
    .select('id, student_id, status, score, submitted_at, completed_at, deadline, users!scenario_assignments_student_id_fkey(name)')
    .eq('scenario_id', scenarioId)
    .order('assigned_at', { ascending: false });
  const assignments = (allAssignments ?? []).filter((a) => !scope || scope.includes(a.student_id as string));
  // The skills to review need the graded checklists; they read beside the groups, and a failure leaves that section out.
  const graded = assignments.filter((a) => a.status === 'completed' && a.score !== null).map((a) => a.id as string);
  const [groups, skills] = await Promise.all([
    groupNames(supabase, assignments.map((a) => a.student_id as string)),
    loadSheetSkills(supabase, scenarioId, graded).catch((err) => {
      console.error('Report: failed to read the checklist skills', err);
      return null;
    }),
  ]);

  const students: ScenarioStudent[] = assignments.map((a) => ({
    name: (a as unknown as { users: { name: string } | null }).users?.name ?? 'Unknown student',
    group: groups.get(a.student_id as string) ?? null,
    status: scenarioStatus(a),
    late: isLate(a.submitted_at, a.deadline),
    submitted: a.submitted_at,
    score: a.status === 'completed' && a.score !== null ? Number(a.score) : null,
  }));

  const pdf = (
    <ReportShell
      title="Patient Case Results Report"
      subject={scenario.title}
      meta={meta}
      metaRows={[{ label: 'Category', value: String(scenario.category) }]}
    >
      <ScenarioReportBody students={students} skills={skills && classSkillScores(skills)} />
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
    .select('id, title, time_limit_seconds, max_attempts')
    .eq('id', assessmentId)
    .maybeSingle();
  if (!assessment) return { error: 'Quiz not found', status: 404 };

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

  const attemptIds: string[] = [];
  const rows: AssessmentStudent[] = inScope.map(([id, s]) => {
    const submitted = s.attempts.filter((a) => a.status === 'submitted' && a.score !== null);
    const average = quizGrade(submitted.map((a) => Number(a.score)));
    attemptIds.push(...submitted.map((a) => a.id as string));
    return {
      name: s.name,
      section: sectionOf.get(id) ?? 'No section',
      group: groups.get(id) ?? null,
      tries: submitted.length,
      grade: average === null ? null : Math.round(average),
      latest: submitted.map((a) => a.submitted_at as string).sort().at(-1) ?? null,
      late: submitted.some((a) => isLateAttempt(a.time_taken_seconds, assessment.time_limit_seconds)),
    };
  });

  // The class on each criterion: questions answered right out of those served, over every graded try.
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
  const criteriaRows: AssessmentCriterion[] = (criteria ?? []).map((c) => {
    const t = answered.get(c.id as string);
    return {
      name: c.name as string,
      weight: Number(c.weight),
      score: t && t.total > 0 ? Math.round((t.correct / t.total) * 100) : null,
    };
  });

  const pdf = (
    <ReportShell
      title="Quiz Results Report"
      subject={assessment.title}
      meta={meta}
      metaRows={assessmentMeta({ timeLimitSeconds: assessment.time_limit_seconds, maxAttempts: assessment.max_attempts })}
    >
      <AssessmentReportBody students={rows} criteria={criteriaRows} />
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
      'id, admitted_at, discharged_at, diagnosis, room_label, vitals_digest, follow_up, ai_generated_at, patients(name, age, gender)',
    )
    .eq('id', summaryId)
    .maybeSingle();

  if (!summary) return { error: 'Discharge summary not found', status: 404 };

  const patient = (summary as unknown as {
    patients: { name: string; age: number | null; gender: string; mimic_id: string } | null;
  }).patients;

  const vitals = (summary.vitals_digest ?? {}) as DischargeDigest;
  const followUp = (Array.isArray(summary.follow_up) ? summary.follow_up : []) as FollowUp[];

  const name = patient?.name ?? 'Unknown patient';
  const days = stayDays(summary.admitted_at, summary.discharged_at);

  const pdf = (
    <ReportShell
      title="Discharge Summary"
      subject={`${name}${patient?.age != null ? `, ${patient.age}` : ''}`}
      meta={meta}
      metaRows={dischargeMeta({
        diagnosis: summary.diagnosis,
        room: summary.room_label,
        admittedAt: summary.admitted_at,
        dischargedAt: summary.discharged_at,
      })}
    >
      <DischargeReportBody days={days} vitals={vitals} followUp={followUp} aiDraftedAt={summary.ai_generated_at} />
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
      'id, team_name, section_name, leader_id, status, submitted_at, graded_at, score, remarks, ' +
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

  const title = g.case_presentations?.title ?? 'Case presentation';
  const score = g.score === null ? null : Number(g.score);
  const late = isLateSubmission(g.submitted_at, g.case_presentations?.deadline ?? null);
  const leader = members.find((m) => m.leader);

  const pdf = (
    <ReportShell
      title="Case Presentation Report"
      subject={title}
      meta={meta}
      metaRows={caseMeta({
        team: g.team_name,
        section: g.section_name,
        leader: leader?.name ?? null,
        presentedAt: g.submitted_at,
        late,
        gradedAt: g.graded_at,
      })}
    >
      <CaseReportBody
        score={score}
        remarks={g.remarks}
        ratings={(ratingRows ?? []) as { criterion: string; level: number; remarks: string }[]}
        members={members}
      />
    </ReportShell>
  );

  return { subject: `${g.team_name} ${title}`, pdf };
}

// ---------------------------------------------------------------------------
// Return Demonstration and Patient Case — the checklist and its grades, per student or per group
// ---------------------------------------------------------------------------

const CHECKLIST_REPORT: Record<ScenarioKind, string> = {
  return_demo: 'Return Demonstration Report',
  patient_case: 'Patient Case Report',
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
  const heading = CHECKLIST_REPORT[kind];
  const noun = CHECKLIST_NOUN[kind];
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
        metaRows={checklistStudentMeta(kind, roster.title, p.groupLabel, p)}
      >
        <ChecklistStudentBody kind={kind} member={p} skills={skills} />
      </ReportShell>
    );
    return { subject: `${roster.title} ${p.name}`, pdf };
  }

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
      <ChecklistGroupBody kind={kind} members={members} skills={skills} />
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
        metaRows={quizStudentMeta(roster.title, p.groupLabel)}
      >
        <QuizStudentBody name={p.name} grade={p.grade} taken={taken} questions={questions} criteria={criteria} />
      </ReportShell>
    );
    return { subject: `${roster.title} ${p.name}`, pdf };
  }

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
      <QuizGroupBody
        members={members.map((m) => ({ name: m.name, tries: m.tries, grade: m.grade, latest: tries.get(m.studentId)?.at(-1) ?? null }))}
        questions={questions}
        criteria={criteria}
      />
    </ReportShell>
  );
  return { subject: `${roster.title} ${groupLabel}`, pdf };
}
