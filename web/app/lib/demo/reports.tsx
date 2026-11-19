"use client";

import { pdf } from "@react-pdf/renderer";
import { ReportShell, registerReportFonts, type MetaRow, type ReportDocument, type ReportMeta } from "../reports/kit-ui";
import { addScore, dateLabel, earlierOf, emptyTotals, generatedStamp, poolTotals, totalOf, type KindTotals } from "../reports/view";
import { FacultyListBody, FacultyOneBody, RoomOneBody, RoomsListBody, SummaryBody, UserOneBody, UsersListBody, type InstructorFacts, type InstructorRow, type InstructorTotals, type RoomRow, type SupervisedGroup } from "../reports/dean-sheet";
import { StudentReportBody, type StudentWorkItem } from "../reports/student-sheet";
import { GroupReportBody, RosterReportBody, SectionReportBody, type SectionStudent } from "../reports/cohort-sheet";
import { isLateSubmission as isLateAttempt } from "../assessment-timing";
import { buildSheetSkills } from "../reports/checklist-grades";
import { parseTarget } from "../reports/targets";
import { CHECKLIST_NOUN, ChecklistGroupBody, ChecklistStudentBody, checklistStudentMeta, type ChecklistMember } from "../reports/checklist-report";
import { AssessmentReportBody, ScenarioReportBody, assessmentMeta, classSkillScores, type AssessmentStudent, type ScenarioStudent } from "../reports/class-sheet";
import { CaseReportBody, caseMeta } from "../reports/case-sheet";
import { DischargeReportBody, dischargeMeta, stayDays } from "../reports/discharge-sheet";
import { QuizGroupBody, QuizStudentBody, quizStudentMeta } from "../reports/quiz-report";
import type { GridEntry, GridMember } from "../reports/activity-sheet";
import { criterionForClass, type QuizCriterion, type QuizQuestion, type QuizTry } from "../reports/quiz-model";
import type { DemoAttempt, DemoRoom } from "./fixtures/school";
import type { DemoDb } from "./store";
import type { DemoUser } from "./fixtures/people";
import type { DemoCaseGroup } from "./fixtures/teaching";
import type { DemoContext } from "./router";
import { mean, prediction, submittedAttempts } from "./handlers/derive";
import { sectionName, teamLabel, userById, visibleStudents } from "./handlers/scope";
import { DEMO_INSTITUTION } from "./fixtures/school";
import { demoStudentStandings } from "./handlers/courses";
import { roleLabel } from "../role-labels";

/**
 * The demo's PDF reports: the same letterhead, tiles and tables as the real
 * ones (lib/reports/kit-ui), laid out from the demo's data and rendered in
 * the browser. Loaded only when a report is asked for.
 */

type Ctx = DemoContext;
type Built = { subject: string; doc: ReportDocument } | { error: string; status: number };

const LOGO = "/logo-no-bg.png";

const date = dateLabel;
function meta(ctx: Ctx): ReportMeta {
  return {
    campus: DEMO_INSTITUTION,
    generatedBy: ctx.viewer.name,
    generatedAt: generatedStamp(new Date()),
  };
}

function Shell({ ctx, title, subject, runningLabel, rows, orientation, audience, children }: { ctx: Ctx; title: string; subject: string; runningLabel?: string; rows: MetaRow[]; orientation?: "portrait" | "landscape"; audience?: "instructor-copy"; children: React.ReactNode }) {
  return (
    <ReportShell title={title} subject={subject} runningLabel={runningLabel} meta={meta(ctx)} metaRows={rows} logo={LOGO} orientation={orientation} audience={audience} footerNote="Demo report: built from sample data in your browser.">
      {children}
    </ReportShell>
  );
}

// --- Instructor reports -----------------------------------------------------------

/**
 * A student's graded work pooled by kind, as the real reports' studentWork
 * does it: completed Patient Cases and Return Demonstrations, graded case
 * presentations and every submitted quiz try, each added once through the
 * shared addScore.
 */
function demoTotals(db: DemoDb, studentId: string): KindTotals {
  const totals = emptyTotals();
  const demos = new Set(db.scenarios.filter((x) => x.kind === "return_demo").map((x) => x.id));
  for (const a of db.assignments) {
    if (a.student_id === studentId && a.status === "completed" && a.score != null) addScore(totals, demos.has(a.scenario_id) ? "return_demo" : "patient_case", a.score);
  }
  for (const c of db.caseSubmissions) {
    if (c.student_id === studentId && c.status === "graded" && c.score != null) addScore(totals, "case_presentation", c.score);
  }
  for (const a of submittedAttempts(db, studentId)) {
    if (a.score != null) addScore(totals, "quiz", a.score);
  }
  return totals;
}

const isLate = (at: string | null, deadline: string | null) => !!at && !!deadline && Date.parse(at) > Date.parse(deadline);
const CASE_STATUS: Record<string, string> = { not_started: "Not started", draft: "Draft", submitted: "Awaiting grade", graded: "Presented" };

/** Everything given to a student as rows for the shared Student report, each filed under the course it was made for. */
function demoWork(db: DemoDb, studentId: string): StudentWorkItem[] {
  const items: StudentWorkItem[] = [];
  for (const a of db.assignments.filter((x) => x.student_id === studentId)) {
    const sc = db.scenarios.find((x) => x.id === a.scenario_id);
    const kind = sc?.kind === "return_demo" ? "return_demo" : "patient_case";
    const label = a.status === "completed" ? "Performed" : a.submitted_at ? "Awaiting grade" : a.status === "in_progress" ? "In progress" : a.status === "overdue" ? "Overdue" : "Not started";
    items.push({
      kind,
      offering: sc?.offering_id ?? null,
      title: sc?.title ?? (kind === "return_demo" ? "Return Demonstration" : "Unknown Patient Case"),
      status: label,
      at: kind === "return_demo" ? (a.status === "completed" ? a.completed_at : null) : a.submitted_at,
      late: kind === "patient_case" && isLate(a.submitted_at, a.deadline),
      score: a.status === "completed" ? a.score : null,
      tries: 0,
      overdue: label === "Overdue",
      awaiting: label === "Awaiting grade",
      stage: label === "Awaiting grade" ? 0 : label === "In progress" ? 1 : 2,
    });
  }
  for (const c of db.caseSubmissions.filter((x) => x.student_id === studentId)) {
    const p = db.casePresentations.find((x) => x.id === c.presentation_id);
    items.push({
      kind: "case_presentation",
      offering: p?.offering_id ?? null,
      title: p?.title ?? "Case Presentation",
      status: CASE_STATUS[c.status] ?? c.status,
      at: c.submitted_at,
      late: isLate(c.submitted_at, p?.deadline ?? null),
      score: c.status === "graded" ? c.score : null,
      tries: 0,
      overdue: false,
      awaiting: c.status === "submitted",
      stage: c.status === "submitted" ? 0 : c.status === "draft" ? 1 : 2,
    });
  }
  const tries = submittedAttempts(db, studentId);
  const quizIds = new Set([...db.quizAssignments.filter((x) => x.student_id === studentId).map((x) => x.assessment_id), ...tries.map((x) => x.assessment_id)]);
  for (const quizId of quizIds) {
    const quiz = db.quizzes.find((q) => q.id === quizId);
    const own = tries.filter((t) => t.assessment_id === quizId);
    const scores = own.filter((t) => t.score != null).map((t) => t.score!);
    const latest = own[0];
    items.push({
      kind: "quiz",
      offering: quiz?.offering_id ?? null,
      title: quiz?.title ?? "Unknown quiz",
      status: own.length ? "Completed" : "Not started",
      at: latest?.submitted_at ?? null,
      late: latest ? isLateAttempt(latest.time_taken_seconds, quiz?.time_limit_seconds ?? null) : false,
      score: scores.length ? Math.round(mean(scores)!) : null,
      tries: scores.length,
      overdue: false,
      awaiting: false,
      stage: own.length ? 0 : 2,
    });
  }
  return items;
}

function studentReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const s = userById(db, id);
  if (!s || !visibleStudents(db, ctx.role, ctx.viewer.id).some((x) => x.id === id)) return { error: "Not found", status: 404 };
  // Reads each activity's course (070) before the work is filed under it.
  const courses = demoStudentStandings(db, id);
  const label = teamLabel(db, s.team_id);
  const [section, ...group] = (label ?? sectionName(db, s.section_id) ?? "—").split(" · ");
  return {
    subject: s.name,
    doc: (
      <Shell ctx={ctx} title="Student Progress Report" subject={s.name} rows={[
        { label: "Section", value: section },
        { label: "Group", value: group.join(" · ") || "No group" },
      ]}>
        <StudentReportBody totals={demoTotals(db, id)} items={demoWork(db, id)} courses={courses} />
      </Shell>
    ),
  };
}

/** What the demo gave a student, with their grade: patient cases, return demonstrations and quizzes. */
function demoGrid(db: DemoDb, studentId: string): GridEntry[] {
  const out: GridEntry[] = [];
  for (const a of db.assignments.filter((x) => x.student_id === studentId)) {
    const sc = db.scenarios.find((x) => x.id === a.scenario_id);
    if (!sc) continue;
    const kind = sc.kind === "return_demo" ? "return_demo" : "patient_case";
    out.push({ key: `${kind}:${sc.id}`, kind, title: sc.title, score: a.status === "completed" ? a.score : null });
  }
  const quizIds = new Set([
    ...db.quizAssignments.filter((x) => x.student_id === studentId).map((x) => x.assessment_id),
    ...db.attempts.filter((x) => x.student_id === studentId).map((x) => x.assessment_id),
  ]);
  for (const quizId of quizIds) {
    const quiz = db.quizzes.find((q) => q.id === quizId);
    if (!quiz) continue;
    const scores = db.attempts.filter((x) => x.assessment_id === quizId && x.student_id === studentId && x.status === "submitted" && x.score != null).map((x) => x.score!);
    out.push({ key: `quiz:${quizId}`, kind: "quiz", title: quiz.title, score: scores.length ? Math.round(mean(scores)!) : null });
  }
  return out;
}

const NO_GROUP = "Students not in a group";

function sectionReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const name = sectionName(db, id);
  if (!name) return { error: "Not found", status: 404 };
  const students = visibleStudents(db, ctx.role, ctx.viewer.id).filter((s) => s.section_id === id);
  const inSection = db.users.filter((u) => u.role === "student" && u.section_id === id).length;
  const blocks = new Map<string, GridMember[]>();
  for (const s of students) {
    const group = db.teams.find((t) => t.id === s.team_id)?.name ?? NO_GROUP;
    blocks.set(group, [...(blocks.get(group) ?? []), { name: s.name, entries: demoGrid(db, s.id) }]);
  }
  const groups = [...blocks.entries()]
    .sort(([a], [b]) => (a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([group, members]) => ({ name: group, members: [...members].sort((x, y) => x.name.localeCompare(y.name)) }));
  const roster: SectionStudent[] = students.map((s) => {
    const risk = prediction(db, s)?.risk;
    return {
      name: s.name,
      group: db.teams.find((t) => t.id === s.team_id)?.name ?? null,
      totals: demoTotals(db, s.id),
      prediction: risk === undefined ? "none" : risk === "at_risk" ? "at_risk" : "on_track",
    };
  });
  return {
    subject: name,
    doc: (
      <Shell ctx={ctx} title="Section Performance Report" subject={name} orientation="landscape" rows={
        students.length < inSection ? [{ label: "Students shown", value: `${students.length} of ${inSection} (your students only)` }] : []
      }>
        <SectionReportBody students={roster} groups={groups} />
      </Shell>
    ),
  };
}

/** A scenario's checklist laid out against the given assignments, one grade column each. */
function demoSkills(db: DemoDb, scenarioId: string, assignmentIds: string[]) {
  const tasks = db.tasks.filter((t) => t.scenario_id === scenarioId).sort((a, b) => a.sort_order - b.sort_order);
  const taskIds = new Set(tasks.map((t) => t.id));
  const steps = db.steps.filter((st) => taskIds.has(st.task_id)).sort((a, b) => a.position - b.position);
  return buildSheetSkills({
    tasks,
    steps,
    assignmentIds,
    completions: db.completions.filter((c) => assignmentIds.includes(c.assignment_id) && taskIds.has(c.task_id)),
    stepRatings: db.stepRatings.filter((r) => assignmentIds.includes(r.assignment_id)),
  });
}

function scenarioReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const sc = db.scenarios.find((s) => s.id === id);
  if (!sc) return { error: "Not found", status: 404 };
  const mine = new Set(visibleStudents(db, ctx.role, ctx.viewer.id).map((s) => s.id));
  const rows = db.assignments.filter((a) => a.scenario_id === id && mine.has(a.student_id));
  const students: ScenarioStudent[] = rows.map((a) => ({
    name: userById(db, a.student_id)?.name ?? "Unknown student",
    group: db.teams.find((t) => t.id === userById(db, a.student_id)?.team_id)?.name ?? null,
    status: a.status === "completed" ? "Performed" : a.submitted_at ? "Awaiting grade" : a.status === "in_progress" ? "In progress" : a.status === "overdue" ? "Overdue" : "Not started",
    submitted: a.submitted_at,
    late: isLate(a.submitted_at, a.deadline),
    score: a.status === "completed" ? a.score : null,
  }));
  const graded = rows.filter((a) => a.status === "completed" && a.score != null).map((a) => a.id);
  return {
    subject: sc.title,
    doc: (
      <Shell ctx={ctx} title="Patient Case Results Report" subject={sc.title} rows={[{ label: "Category", value: sc.category }]}>
        <ScenarioReportBody students={students} skills={classSkillScores(demoSkills(db, id, graded))} />
      </Shell>
    ),
  };
}

const CHECKLIST_HEADING = { return_demo: "Return Demonstration Report", patient_case: "Patient Case Report" } as const;

/** The checklist report of one student or group on a Return Demonstration or a Patient Case. */
function checklistReport(ctx: Ctx, kind: keyof typeof CHECKLIST_HEADING, id: string): Built {
  const { db } = ctx;
  const target = parseTarget(id);
  const demo = target && db.scenarios.find((s) => s.id === target.parentId && (s.kind ?? "patient_case") === kind);
  if (!target || !demo) return { error: "Not found", status: 404 };
  const mine = new Set(visibleStudents(db, ctx.role, ctx.viewer.id).map((s) => s.id));
  const found = db.assignments
    .filter((a) => a.scenario_id === demo.id && mine.has(a.student_id))
    .map((a) => ({ a, student: userById(db, a.student_id) }))
    .filter((m) => (target.kind === "student" ? m.a.student_id === target.studentId : m.student?.team_id === target.teamId))
    .sort((x, y) => (x.student?.name ?? "").localeCompare(y.student?.name ?? ""));
  if (found.length === 0) return { error: "Not found", status: 404 };

  const skills = demoSkills(db, demo.id, found.map((m) => m.a.id));
  const members: ChecklistMember[] = found.map((m) => ({
    name: m.student?.name ?? "—",
    status: m.a.status,
    score: m.a.status === "completed" ? m.a.score : null,
    deadline: m.a.deadline,
    completedAt: m.a.completed_at,
  }));
  const heading = CHECKLIST_HEADING[kind];

  if (target.kind === "student") {
    const student = found[0].student;
    return {
      subject: `${demo.title} ${student?.name ?? ""}`.trim(),
      doc: (
        <Shell ctx={ctx} title={heading} subject={members[0].name} runningLabel={`${members[0].name} · ${demo.title}`} rows={checklistStudentMeta(kind, demo.title, teamLabel(db, student?.team_id) ?? "—", members[0])}>
          <ChecklistStudentBody kind={kind} member={members[0]} skills={skills} />
        </Shell>
      ),
    };
  }

  const label = teamLabel(db, target.teamId) ?? "Group";
  return {
    subject: `${demo.title} ${label}`,
    doc: (
      <Shell ctx={ctx} title={heading} subject={label} runningLabel={`${label} · ${demo.title}`} orientation="landscape" audience="instructor-copy" rows={[{ label: CHECKLIST_NOUN[kind], value: demo.title }]}>
        <ChecklistGroupBody kind={kind} members={members} skills={skills} />
      </Shell>
    ),
  };
}

function groupMembers(ctx: Ctx, teamId: string) {
  const { db } = ctx;
  return visibleStudents(db, ctx.role, ctx.viewer.id).filter((s) => s.team_id === teamId).sort((a, b) => a.name.localeCompare(b.name));
}

function sectionGroupReport(ctx: Ctx, teamId: string): Built {
  const { db } = ctx;
  const label = teamLabel(db, teamId);
  const members = groupMembers(ctx, teamId);
  if (!label || members.length === 0) return { error: "Not found", status: 404 };
  return {
    subject: label,
    doc: (
      <Shell ctx={ctx} title="Group Performance Report" subject={label} orientation="landscape" audience="instructor-copy" rows={[]}>
        <GroupReportBody members={members.map((s) => ({ name: s.name, entries: demoGrid(db, s.id), totals: demoTotals(db, s.id) }))} />
      </Shell>
    ),
  };
}

/** A stable number from text, so the demo's sample answers don't change between renders. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** What a demo try answered: the demo records only the score, so right and wrong answers are drawn to fit it. */
function demoTry(attempt: DemoAttempt, questions: QuizQuestion[], number: number): QuizTry {
  const served = [...questions].sort((a, b) => hash(attempt.id + a.id) - hash(attempt.id + b.id)).slice(0, attempt.total_questions);
  const right = new Set(served.slice(0, attempt.correct_answers ?? 0).map((q) => q.id));
  const answers = new Map(
    served.map((q) => {
      const wrong = (q.correctIndex + 1 + (hash(attempt.id + q.id) % Math.max(1, q.options.length - 1))) % Math.max(1, q.options.length);
      return [q.id, right.has(q.id) ? { selected: q.correctIndex, ok: true } : { selected: wrong, ok: false }] as const;
    }),
  );
  return { number, submittedAt: attempt.submitted_at, score: attempt.score, served: served.map((q) => q.id), criteria: new Map(), answers };
}

/** A quiz's questions and scoring criteria, in order. */
function quizParts(db: DemoDb, quizId: string): { questions: QuizQuestion[]; criteria: QuizCriterion[] } {
  const questions: QuizQuestion[] = db.questions
    .filter((q) => q.assessment_id === quizId)
    .sort((a, b) => a.position - b.position)
    .map((q) => ({ id: q.id, text: q.content, options: q.options, correctIndex: q.correct_index, criteriaId: q.criteria_id }));
  const criteria: QuizCriterion[] = db.criteria
    .filter((c) => c.assessment_id === quizId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ id: c.id, name: c.name, weight: c.weight }));
  return { questions, criteria };
}

function quizDetailReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const target = parseTarget(id);
  const quiz = target && db.quizzes.find((q) => q.id === target.parentId);
  if (!target || !quiz) return { error: "Not found", status: 404 };
  const { questions, criteria } = quizParts(db, quiz.id);
  const students = visibleStudents(db, ctx.role, ctx.viewer.id).filter(
    (s) =>
      db.quizAssignments.some((a) => a.assessment_id === quiz.id && a.student_id === s.id) ||
      db.attempts.some((a) => a.assessment_id === quiz.id && a.student_id === s.id),
  );
  const members = (target.kind === "student" ? students.filter((s) => s.id === target.studentId) : students.filter((s) => s.team_id === target.teamId)).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  if (members.length === 0) return { error: "Not found", status: 404 };

  const triesOf = (studentId: string): QuizTry[] =>
    db.attempts
      .filter((a) => a.assessment_id === quiz.id && a.student_id === studentId && a.status === "submitted" && a.score !== null)
      .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""))
      .map((a, i) => demoTry(a, questions, i + 1));
  const gradeOf = (studentId: string) => {
    const scores = triesOf(studentId).map((t) => t.score ?? 0);
    return scores.length ? Math.round(mean(scores)!) : null;
  };

  if (target.kind === "student") {
    const student = members[0];
    return {
      subject: `${quiz.title} ${student.name}`,
      doc: (
        <Shell ctx={ctx} title="Quiz Answers Report" subject={student.name} runningLabel={`${student.name} · ${quiz.title}`} rows={quizStudentMeta(quiz.title, teamLabel(db, student.team_id) ?? "—")}>
          <QuizStudentBody name={student.name} grade={gradeOf(student.id)} taken={triesOf(student.id)} questions={questions} criteria={criteria} />
        </Shell>
      ),
    };
  }

  const label = teamLabel(db, target.teamId) ?? "Group";
  return {
    subject: `${quiz.title} ${label}`,
    doc: (
      <Shell ctx={ctx} title="Quiz Answers Report" subject={label} runningLabel={`${label} · ${quiz.title}`} orientation="landscape" audience="instructor-copy" rows={[{ label: "Quiz", value: quiz.title }]}>
        <QuizGroupBody
          members={members.map((m) => ({ name: m.name, tries: triesOf(m.id).length, grade: gradeOf(m.id), latest: triesOf(m.id).at(-1) ?? null }))}
          questions={questions}
          criteria={criteria}
        />
      </Shell>
    ),
  };
}

function assessmentReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const quiz = db.quizzes.find((q) => q.id === id);
  if (!quiz) return { error: "Not found", status: 404 };
  const { questions, criteria } = quizParts(db, quiz.id);
  // Given the quiz, or sat it anyway, as the real report counts them.
  const given = visibleStudents(db, ctx.role, ctx.viewer.id).filter(
    (s) => db.quizAssignments.some((a) => a.assessment_id === id && a.student_id === s.id) || db.attempts.some((a) => a.assessment_id === id && a.student_id === s.id),
  );
  const all: QuizTry[] = [];
  const students: AssessmentStudent[] = given.map((s) => {
    const own = db.attempts.filter((a) => a.assessment_id === id && a.student_id === s.id && a.status === "submitted" && a.score != null);
    all.push(...own.map((a) => demoTry(a, questions, 0)));
    const grade = own.length ? Math.round(mean(own.map((a) => a.score!))!) : null;
    return {
      name: s.name,
      section: sectionName(db, s.section_id) ?? "No section",
      group: db.teams.find((t) => t.id === s.team_id)?.name ?? null,
      tries: own.length,
      grade,
      latest: own.map((a) => a.submitted_at ?? "").sort().at(-1) || null,
      late: own.some((a) => isLateAttempt(a.time_taken_seconds, quiz.time_limit_seconds)),
    };
  });
  return {
    subject: quiz.title,
    doc: (
      <Shell ctx={ctx} title="Quiz Results Report" subject={quiz.title} rows={assessmentMeta({ timeLimitSeconds: quiz.time_limit_seconds, maxAttempts: quiz.max_attempts })}>
        <AssessmentReportBody students={students} criteria={criterionForClass(questions, criteria, all)} />
      </Shell>
    ),
  };
}

function rosterReport(ctx: Ctx): Built {
  const { db } = ctx;
  const students = visibleStudents(db, ctx.role, ctx.viewer.id);
  return {
    subject: "Roster summary",
    doc: (
      <Shell ctx={ctx} title="Roster Summary Report" subject={ctx.role === "admin" ? "Your students" : "Your groups"} rows={[]}>
        <RosterReportBody students={students.map((s) => ({
          name: s.name,
          section: sectionName(db, s.section_id) ?? "Unassigned",
          group: db.teams.find((t) => t.id === s.team_id)?.name ?? null,
          totals: demoTotals(db, s.id),
        }))} />
      </Shell>
    ),
  };
}

function caseReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const groups = (db as typeof db & { caseGroups?: DemoCaseGroup[] }).caseGroups ?? [];
  // A group id, or a member's submission id that points at it.
  const viaMember = db.caseSubmissions.find((x) => x.id === id)?.group_id;
  const g = groups.find((x) => x.id === id || x.id === viaMember);
  if (!g) return { error: "Not found", status: 404 };
  const p = db.casePresentations.find((x) => x.id === g.presentation_id);
  const members = db.caseSubmissions
    .filter((s) => s.group_id === g.id)
    .map((s) => ({ name: userById(db, s.student_id)?.name ?? "Student", leader: s.student_id === g.leader_id }))
    .sort((a, b) => Number(b.leader) - Number(a.leader) || a.name.localeCompare(b.name));
  const leader = members.find((m) => m.leader);
  return {
    subject: `${g.team_name} — ${p?.title ?? "Case"}`,
    doc: (
      <Shell ctx={ctx} title="Case Presentation Report" subject={p?.title ?? "Case"} rows={caseMeta({
        team: g.team_name,
        section: g.section_name,
        leader: leader?.name ?? null,
        presentedAt: g.submitted_at,
        late: isLate(g.submitted_at, p?.deadline ?? null),
        gradedAt: g.graded_at,
      })}>
        <CaseReportBody score={g.score} remarks={g.remarks} ratings={g.ratings} members={members} />
      </Shell>
    ),
  };
}

function dischargeReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const d = db.dischargeSummaries.find((x) => x.id === id);
  if (!d) return { error: "Not found", status: 404 };
  const patient = db.patients.find((p) => p.id === d.patient_id);
  return {
    subject: patient?.name ?? "Discharge summary",
    doc: (
      <Shell ctx={ctx} title="Discharge Summary" subject={patient ? `${patient.name}, ${patient.age}` : "—"} rows={dischargeMeta({ diagnosis: d.diagnosis, room: d.room_label, admittedAt: d.admitted_at, dischargedAt: d.discharged_at })}>
        <DischargeReportBody days={stayDays(d.admitted_at, d.discharged_at)} vitals={d.vitals_digest} followUp={d.follow_up} aiDraftedAt={d.ai_generated_at} />
      </Shell>
    ),
  };
}

// --- Dean reports ---------------------------------------------------------------------

/** The Dean's own instructors, as the Instructors page lists them. */
const deanInstructors = (db: DemoDb, viewerId: string) => db.users.filter((u) => u.role === "faculty" && u.admin_id === viewerId);

/**
 * What an instructor looks after and has graded, from the demo's data, as the
 * real report reads it: their roster (groups, whole sections, added students),
 * the work they finalized, and what their students handed in that is not
 * graded yet. `waiting` keys each piece so a total counts a shared one once.
 */
function demoLoad(db: DemoDb, instructor: DemoUser) {
  const roster = visibleStudents(db, "faculty", instructor.id);
  const ids = new Set(roster.map((s) => s.id));
  const demoIds = new Set(db.scenarios.filter((x) => x.kind === "return_demo").map((x) => x.id));
  const finalized = db.assignments.filter((a) => a.finalized_by === instructor.id && a.status === "completed");
  const waitingWork = db.assignments.filter((a) => ids.has(a.student_id) && a.status !== "completed" && a.submitted_at);
  const waitingCases = db.caseSubmissions.filter((c) => ids.has(c.student_id) && c.status === "submitted");
  const groups = db.teams.filter((t) => t.faculty_id === instructor.id);
  const patientCasesGraded = finalized.filter((a) => !demoIds.has(a.scenario_id)).length;
  const returnDemosGraded = finalized.length - patientCasesGraded;
  const casesGraded = db.caseSubmissions.filter((c) => c.graded_by === instructor.id && c.status === "graded").length;
  const oldest = [...waitingWork.map((a) => a.submitted_at), ...waitingCases.map((c) => c.submitted_at)].reduce<string | null>((o, v) => earlierOf(o, v), null);
  const facts: InstructorFacts = {
    groups: groups.length,
    students: roster.length,
    patientCasesGraded,
    returnDemosGraded,
    casesGraded,
    awaiting: waitingWork.length + waitingCases.length,
    oldestAwaitingAt: oldest,
  };
  return {
    facts,
    groups,
    roster,
    waiting: [...waitingWork.map((a) => `s:${a.id}`), ...waitingCases.map((c) => `c:${c.id}`)],
    row: {
      name: instructor.name,
      groups: facts.groups,
      students: facts.students,
      graded: patientCasesGraded + returnDemosGraded + casesGraded,
      awaiting: facts.awaiting,
      oldestAwaitingAt: oldest,
      lastLogin: instructor.last_sign_in_at,
    } satisfies InstructorRow,
  };
}

/** Totals across instructors, with each student and each waiting piece counted once. */
function demoLoadTotals(loads: ReturnType<typeof demoLoad>[]): InstructorTotals {
  return {
    students: new Set(loads.flatMap((l) => l.roster.map((s) => s.id))).size,
    graded: loads.reduce((n, l) => n + l.row.graded, 0),
    awaiting: new Set(loads.flatMap((l) => l.waiting)).size,
    oldestAwaitingAt: loads.reduce<string | null>((o, l) => earlierOf(o, l.facts.oldestAwaitingAt), null),
  };
}

function facultyReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const now = new Date();
  const faculty = deanInstructors(db, ctx.viewer.id).filter((u) => !id || u.id === id);
  if (faculty.length === 0 || (id && faculty.length !== 1)) return { error: "Not found", status: 404 };
  const loads = faculty.map((f) => demoLoad(db, f));

  if (!id) {
    return {
      subject: "All instructors",
      doc: (
        <Shell ctx={ctx} title="All Instructors Report" subject="Your instructors" rows={[]}>
          <FacultyListBody rows={loads.map((l) => l.row)} totals={demoLoadTotals(loads)} now={now} />
        </Shell>
      ),
    };
  }

  const [f] = faculty;
  const load = loads[0];
  const groups: SupervisedGroup[] = load.groups.map((g) => {
    const members = db.users.filter((u) => u.role === "student" && u.team_id === g.id);
    const totals = members.map((m) => demoTotals(db, m.id));
    return { name: teamLabel(db, g.id) ?? g.name, members: members.length, withWork: totals.filter((t) => totalOf(t).n > 0).length, totals: poolTotals(totals) };
  });
  const sections = [...new Set(load.groups.map((g) => sectionName(db, g.section_id) ?? "No section"))].sort();
  return {
    subject: f.name,
    doc: (
      <Shell ctx={ctx} title="Instructor Report" subject={f.name} rows={[
        { label: "Email", value: f.email },
        { label: "Sections", value: sections.join(", ") || "None" },
        { label: "Joined", value: date(f.created_at) },
        { label: "Last login", value: date(f.last_sign_in_at) },
      ]}>
        <FacultyOneBody facts={load.facts} groups={groups} now={now} />
      </Shell>
    ),
  };
}

/** A room and how many students are assigned to it now, as the Rooms page counts them. */
const demoRoomRow = (db: DemoDb, r: DemoRoom): RoomRow => ({
  name: r.name,
  number: r.room_number,
  capacity: r.capacity,
  occupied: db.roomAssignments.filter((a) => a.room_id === r.id && !a.ends_at).length,
  status: r.status,
});

function roomsReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  if (!id) {
    return {
      subject: "All rooms",
      doc: (
        <Shell ctx={ctx} title="All Rooms Report" subject="Your ward" rows={[]}>
          <RoomsListBody rooms={db.rooms.map((r) => demoRoomRow(db, r))} />
        </Shell>
      ),
    };
  }
  const room = db.rooms.find((r) => r.id === id);
  if (!room) return { error: "Not found", status: 404 };
  const occupants = db.roomAssignments
    .filter((a) => a.room_id === room.id && !a.ends_at)
    .map((a) => ({ name: userById(db, a.student_id)?.name ?? "Unknown", since: a.starts_at }));
  return {
    subject: room.name,
    doc: (
      <Shell ctx={ctx} title="Room Report" subject={room.name} rows={[
        { label: "Number", value: room.room_number },
        { label: "Status", value: room.status.charAt(0).toUpperCase() + room.status.slice(1) },
      ]}>
        <RoomOneBody capacity={room.capacity} occupants={occupants} />
      </Shell>
    ),
  };
}

function usersReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const now = new Date();
  // Their students, their own instructors and themselves: the accounts the Users page lists.
  const users = db.users.filter((u) => u.role === "student" || (u.role === "faculty" && u.admin_id === ctx.viewer.id) || u.id === ctx.viewer.id);
  const roleName = (u: DemoUser) => roleLabel(u.role, u.admin_title);

  if (!id) {
    return {
      subject: "All users",
      doc: (
        <Shell ctx={ctx} title="All Users Report" subject="Your users" rows={[]}>
          <UsersListBody
            rows={users.map((u) => ({ name: u.name, email: u.email, role: u.role, roleName: roleName(u), createdAt: u.created_at, lastLogin: u.last_sign_in_at }))}
            now={now}
          />
        </Shell>
      ),
    };
  }

  const user = users.find((u) => u.id === id);
  if (!user) return { error: "Not found", status: 404 };
  const isStudent = user.role === "student";
  const label = isStudent ? teamLabel(db, user.team_id) : null;
  const [section, ...group] = (label ?? sectionName(db, user.section_id) ?? "Unassigned").split(" · ");
  return {
    subject: user.name,
    doc: (
      <Shell ctx={ctx} title="User Report" subject={user.name} rows={[
        { label: "Email", value: user.email },
        { label: "Role", value: roleName(user) },
        ...(isStudent ? [{ label: "Section", value: section }, { label: "Group", value: group.join(" · ") || "No group" }] : []),
        { label: "Joined", value: date(user.created_at) },
        { label: "Last login", value: date(user.last_sign_in_at) },
      ]}>
        <UserOneBody
          student={isStudent ? demoTotals(db, user.id) : undefined}
          instructor={user.role === "faculty" ? demoLoad(db, user).facts : undefined}
          now={now}
        />
      </Shell>
    ),
  };
}

function summaryReport(ctx: Ctx): Built {
  const { db } = ctx;
  const now = new Date();
  const students = db.users.filter((u) => u.role === "student");
  const loads = deanInstructors(db, ctx.viewer.id).map((f) => demoLoad(db, f));
  const totals = demoLoadTotals(loads);
  const onARoster = new Set(loads.flatMap((l) => l.roster.map((s) => s.id)));
  const rooms = db.rooms.map((r) => demoRoomRow(db, r));
  const dean = roleLabel("admin", ctx.viewer.admin_title);
  return {
    subject: `${dean} summary`,
    doc: (
      <Shell ctx={ctx} title={`${dean} Summary Report`} subject="Your instructors and students" rows={[]}>
        <SummaryBody
          students={students.map((s) => ({ section: sectionName(db, s.section_id) ?? "No section", totals: demoTotals(db, s.id) }))}
          sections={db.sections.map((s) => s.name)}
          instructors={loads.map((l) => l.row)}
          awaiting={totals.awaiting}
          oldestAwaitingAt={totals.oldestAwaitingAt}
          notOnRoster={students.filter((s) => !onARoster.has(s.id)).length}
          rooms={{ count: rooms.length, capacity: rooms.reduce((n, r) => n + r.capacity, 0), occupied: rooms.reduce((n, r) => n + r.occupied, 0) }}
          now={now}
        />
      </Shell>
    ),
  };
}

const BUILDERS: Record<string, (ctx: Ctx, id: string) => Built> = {
  student: studentReport,
  section: sectionReport,
  scenario: scenarioReport,
  assessment: assessmentReport,
  return_demo: (ctx, id) => checklistReport(ctx, "return_demo", id),
  patient_case: (ctx, id) => checklistReport(ctx, "patient_case", id),
  quiz: quizDetailReport,
  section_group: sectionGroupReport,
  roster: (ctx) => rosterReport(ctx),
  case: caseReport,
  discharge: dischargeReport,
  faculty: facultyReport,
  rooms: roomsReport,
  users: usersReport,
  summary: (ctx) => summaryReport(ctx),
};

/**
 * The report fonts, fetched from /fonts the way the server reads them from
 * disk. Registered once, after a HEAD check on one file: if the files aren't
 * served the reports stay on Helvetica rather than fail to render.
 */
let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  fontsReady ??= (async () => {
    let served = false;
    try {
      served = (await fetch("/fonts/SourceSans3_400Regular.ttf", { method: "HEAD" })).ok;
    } catch {
      // Offline or blocked: Helvetica.
    }
    registerReportFonts((file) => {
      if (!served) throw new Error("Report fonts are not served");
      return `/fonts/${file}`;
    });
  })();
  return fontsReady;
}

export async function buildDemoReport(ctx: Ctx, type: string, id: string): Promise<{ response: Response; subject?: string }> {
  const build = BUILDERS[type];
  if (!build) return { response: Response.json({ error: `Unknown report type "${type}"` }, { status: 404 }) };
  const result = build(ctx, id);
  if ("error" in result) return { response: Response.json({ error: result.error }, { status: result.status }) };
  await ensureFonts();
  const blob = await pdf(result.doc).toBlob();
  const slug = result.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    subject: result.subject,
    response: new Response(blob, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "Content-Disposition": `attachment; filename="icare-${type}-${slug || "report"}.pdf"`,
      },
    }),
  };
}
