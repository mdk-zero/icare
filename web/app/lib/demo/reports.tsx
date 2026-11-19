"use client";

import { pdf, View } from "@react-pdf/renderer";
import { GRID_AHEAD, Note, ReportShell, Section, StatGrid, Table, registerReportFonts, scoreTile, type ReportDocument, type ReportMeta } from "../reports/kit-ui";
import { addScore, dateLabel, emptyTotals, generatedStamp, type KindTotals } from "../reports/view";
import { StudentReportBody, type StudentWorkItem } from "../reports/student-sheet";
import { GroupReportBody, RosterReportBody, SectionReportBody, type SectionStudent } from "../reports/cohort-sheet";
import { isLateSubmission as isLateAttempt } from "../assessment-timing";
import { CASE_CRITERIA, caseLevelLabel } from "../case-rubric";
import { ChecklistSheet } from "../reports/checklist-sheet";
import { buildSheetSkills } from "../reports/checklist-grades";
import { parseTarget } from "../reports/targets";
import { competencyRemark } from "../return-demo-remarks";
import type { GridEntry, GridMember } from "../reports/activity-sheet";
import { CriterionTable, QuizAnswers, QuizMatrix } from "../reports/quiz-sheet";
import { answerRows, criterionForGroup, criterionForStudent, matrix, type QuizCriterion, type QuizQuestion, type QuizTry } from "../reports/quiz-model";
import type { DemoAttempt } from "./fixtures/school";
import type { DemoDb } from "./store";
import { scoreDescriptor } from "../task-ratings";
import type { DemoCaseGroup } from "./fixtures/teaching";
import type { DemoContext } from "./router";
import { caseAverage, mean, prediction, quizAverage, submittedAttempts } from "./handlers/derive";
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

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const date = dateLabel;
/** When it was handed in, flagged when that was past its deadline. */
const submitted = (a: { submitted_at: string | null; deadline: string | null }) =>
  a.submitted_at ? `${date(a.submitted_at)}${a.deadline && Date.parse(a.submitted_at) > Date.parse(a.deadline) ? " (late)" : ""}` : "—";

function meta(ctx: Ctx): ReportMeta {
  return {
    campus: DEMO_INSTITUTION,
    generatedBy: ctx.viewer.name,
    generatedAt: generatedStamp(new Date()),
  };
}

function Shell({ ctx, title, subject, runningLabel, rows, orientation, audience, children }: { ctx: Ctx; title: string; subject: string; runningLabel?: string; rows: { label: string; value: string }[]; orientation?: "portrait" | "landscape"; audience?: "instructor-copy"; children: React.ReactNode }) {
  return (
    <ReportShell title={title} subject={subject} runningLabel={runningLabel} meta={meta(ctx)} metaRows={rows} logo={LOGO} orientation={orientation} audience={audience}>
      {children}
      <Note>Demo report: built from sample data in your browser.</Note>
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

function scenarioReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const sc = db.scenarios.find((s) => s.id === id);
  if (!sc) return { error: "Not found", status: 404 };
  const mine = new Set(visibleStudents(db, ctx.role, ctx.viewer.id).map((s) => s.id));
  const rows = db.assignments.filter((a) => a.scenario_id === id && mine.has(a.student_id));
  return {
    subject: sc.title,
    doc: (
      <Shell ctx={ctx} title="Patient Case Results Report" subject={sc.title} rows={[{ label: "Category", value: sc.category }]}>
        <StatGrid items={[
          { label: "Assigned", value: rows.length },
          { label: "Performed", value: rows.filter((a) => a.status === "completed").length },
          { label: "Awaiting review", value: rows.filter((a) => a.submitted_at && a.status !== "completed").length },
          scoreTile("Average", mean(rows.filter((a) => a.score != null).map((a) => a.score!))),
        ]} />
        <Section title="Students" />
        <Table head={["Student", "Group", "Status", "Performed", "Score"]} widths={[3, 2, 1.4, 1.4, 1]} rows={rows.map((a) => {
          const s = userById(db, a.student_id);
          return [s?.name ?? "—", teamLabel(db, s?.team_id) ?? "—", a.status === "completed" ? "Performed" : a.submitted_at ? "Awaiting review" : a.status, submitted(a), pct(a.score)];
        })} />
      </Shell>
    ),
  };
}

const CHECKLIST = {
  return_demo: { noun: "Return Demonstration", heading: "Return Demonstration Report" },
  patient_case: { noun: "Patient Case", heading: "Patient Case Report" },
} as const;

/** The checklist report of one student or group on a Return Demonstration or a Patient Case. */
function checklistReport(ctx: Ctx, kind: keyof typeof CHECKLIST, id: string): Built {
  const { db } = ctx;
  const { noun, heading } = CHECKLIST[kind];
  const target = parseTarget(id);
  const demo = target && db.scenarios.find((s) => s.id === target.parentId && (s.kind ?? "patient_case") === kind);
  if (!target || !demo) return { error: "Not found", status: 404 };
  const mine = new Set(visibleStudents(db, ctx.role, ctx.viewer.id).map((s) => s.id));
  const members = db.assignments
    .filter((a) => a.scenario_id === demo.id && mine.has(a.student_id))
    .map((a) => ({ a, student: userById(db, a.student_id) }))
    .filter((m) => (target.kind === "student" ? m.a.student_id === target.studentId : m.student?.team_id === target.teamId))
    .sort((x, y) => (x.student?.name ?? "").localeCompare(y.student?.name ?? ""));
  if (members.length === 0) return { error: "Not found", status: 404 };

  const tasks = db.tasks.filter((t) => t.scenario_id === demo.id).sort((a, b) => a.sort_order - b.sort_order);
  const taskIds = new Set(tasks.map((t) => t.id));
  const steps = db.steps.filter((st) => taskIds.has(st.task_id)).sort((a, b) => a.position - b.position);
  const ids = members.map((m) => m.a.id);
  const skills = buildSheetSkills({
    tasks,
    steps,
    assignmentIds: ids,
    completions: db.completions.filter((c) => ids.includes(c.assignment_id) && taskIds.has(c.task_id)),
    stepRatings: db.stepRatings.filter((r) => ids.includes(r.assignment_id)),
  });
  const score = (a: (typeof members)[number]["a"]) => (a.status === "completed" ? a.score : null);

  if (target.kind === "student") {
    const { a, student } = members[0];
    const sc = score(a);
    return {
      subject: `${demo.title} ${student?.name ?? ""}`.trim(),
      doc: (
        <Shell ctx={ctx} title={heading} subject={student?.name ?? "—"} runningLabel={`${student?.name ?? "—"} · ${demo.title}`} rows={[
          { label: noun, value: demo.title },
          { label: "Group", value: teamLabel(db, student?.team_id) ?? "—" },
          { label: "Date of performance", value: date(a.deadline) },
        ]}>
          <StatGrid items={[
            scoreTile("Score", sc, ""),
            { label: "Rating", value: sc === null ? "—" : scoreDescriptor(sc) },
            ...(kind === "return_demo"
              ? [{ label: "Remarks", value: competencyRemark(sc) }]
              : [{ label: "Status", value: a.status === "completed" ? "Performed" : "Not yet performed" }]),
          ]} />
          <Section title="Checklist and grades" ahead={GRID_AHEAD} />
          <ChecklistSheet columns={["Grade"]} skills={skills} />
        </Shell>
      ),
    };
  }

  const label = teamLabel(db, target.teamId) ?? "Group";
  const scores = members.flatMap((m) => (score(m.a) === null ? [] : [score(m.a)!]));
  return {
    subject: `${demo.title} ${label}`,
    doc: (
      <Shell ctx={ctx} title={heading} subject={label} runningLabel={`${label} · ${demo.title}`} orientation="landscape" audience="instructor-copy" rows={[{ label: noun, value: demo.title }]}>
        <StatGrid items={[
          { label: "Members", value: members.length },
          { label: "Performed", value: scores.length },
          scoreTile("Group average", mean(scores)),
        ]} />
        <Section title="Members" />
        <Table head={kind === "return_demo" ? ["Member", "Date of performance", "Score", "Remarks"] : ["Member", "Date of performance", "Status", "Score"]} widths={kind === "return_demo" ? [3, 1.6, 1.8, 1.6] : [3, 1.6, 1.4, 1.6]} rows={members.map((m) => kind === "return_demo"
          ? [m.student?.name ?? "—", date(m.a.deadline), pct(score(m.a)), competencyRemark(score(m.a))]
          : [m.student?.name ?? "—", date(m.a.deadline), m.a.status === "completed" ? "Performed" : "Not yet performed", pct(score(m.a))])} />
        <Section title="Checklist and grades" ahead={GRID_AHEAD} />
        <ChecklistSheet columns={members.map((m) => m.student?.name ?? "—")} skills={skills} />
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

function quizDetailReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const target = parseTarget(id);
  const quiz = target && db.quizzes.find((q) => q.id === target.parentId);
  if (!target || !quiz) return { error: "Not found", status: 404 };
  const questions: QuizQuestion[] = db.questions
    .filter((q) => q.assessment_id === quiz.id)
    .sort((a, b) => a.position - b.position)
    .map((q) => ({ id: q.id, text: q.content, options: q.options, correctIndex: q.correct_index, criteriaId: q.criteria_id }));
  const criteria: QuizCriterion[] = db.criteria
    .filter((c) => c.assessment_id === quiz.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ id: c.id, name: c.name, weight: c.weight }));
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
    const taken = triesOf(student.id);
    const g = gradeOf(student.id);
    return {
      subject: `${quiz.title} ${student.name}`,
      doc: (
        <Shell ctx={ctx} title="Quiz Answers Report" subject={student.name} runningLabel={`${student.name} · ${quiz.title}`} rows={[
          { label: "Quiz", value: quiz.title },
          { label: "Group", value: teamLabel(db, student.team_id) ?? "—" },
          { label: "Submitted tries", value: String(taken.length) },
        ]}>
          <StatGrid items={[
            scoreTile("Grade", g),
            { label: "Submitted tries", value: taken.length },
            { label: "Remarks", value: g === null ? "Not taken" : g >= 75 ? "Passed" : "Below passing" },
          ]} />
          <Section title="Results by criterion" />
          <CriterionTable columns={["Correct"]} rows={criterionForStudent(questions, criteria, taken)} />
          {taken.length === 0 ? <Note>{student.name} has not submitted a try yet.</Note> : taken.map((t) => (
            <View key={t.number}>
              <Section title={`Try ${t.number} - ${pct(t.score === null ? null : Math.round(t.score))}${t.submittedAt ? ` - ${date(t.submittedAt)}` : ""}`} />
              <QuizAnswers rows={answerRows(questions, criteria, t)} />
            </View>
          ))}
        </Shell>
      ),
    };
  }

  const label = teamLabel(db, target.teamId) ?? "Group";
  const latest = members.map((m) => ({ name: m.name, latest: triesOf(m.id).at(-1) ?? null }));
  const { columns, rows } = matrix(questions, criteria, latest);
  const grades = members.flatMap((m) => (gradeOf(m.id) === null ? [] : [gradeOf(m.id)!]));
  return {
    subject: `${quiz.title} ${label}`,
    doc: (
      <Shell ctx={ctx} title="Quiz Answers Report" subject={label} runningLabel={`${label} · ${quiz.title}`} orientation="landscape" audience="instructor-copy" rows={[{ label: "Quiz", value: quiz.title }]}>
        <StatGrid items={[
          { label: "Members", value: members.length },
          { label: "Completed", value: grades.length },
          scoreTile("Group average", mean(grades)),
        ]} />
        <Section title="Results by criterion" ahead={GRID_AHEAD} />
        <CriterionTable columns={members.map((m) => m.name)} rows={criterionForGroup(questions, criteria, latest)} />
        <Section title="Questions" ahead={GRID_AHEAD} />
        <QuizMatrix columns={columns} rows={rows} />
      </Shell>
    ),
  };
}

function assessmentReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const quiz = db.quizzes.find((q) => q.id === id);
  if (!quiz) return { error: "Not found", status: 404 };
  const students = visibleStudents(db, ctx.role, ctx.viewer.id).filter((s) => db.quizAssignments.some((a) => a.assessment_id === id && a.student_id === s.id));
  const best = (sid: string) => {
    const scores = db.attempts.filter((a) => a.assessment_id === id && a.student_id === sid && a.score != null).map((a) => a.score!);
    return scores.length ? Math.max(...scores) : null;
  };
  return {
    subject: quiz.title,
    doc: (
      <Shell ctx={ctx} title="Quiz Results Report" subject={quiz.title} rows={[]}>
        <StatGrid items={[
          { label: "Assigned", value: students.length },
          { label: "Submitted", value: students.filter((s) => best(s.id) !== null).length },
          scoreTile("Average best score", mean(students.map((s) => best(s.id)).filter((x): x is number => x !== null))),
        ]} />
        <Section title="Results" />
        <Table head={["Student", "Group", "Best score"]} widths={[3, 2, 1]} rows={students.map((s) => [s.name, teamLabel(db, s.team_id) ?? "—", pct(best(s.id))])} />
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
  return {
    subject: `${g.team_name} — ${p?.title ?? "Case"}`,
    doc: (
      <Shell ctx={ctx} title="Case Presentation Report" subject={p?.title ?? "Case"} rows={[
        { label: "Group", value: `${g.team_name} · ${g.section_name}` },
        { label: "Leader", value: members.find((m) => m.leader)?.name ?? "—" },
        { label: "Slides", value: g.file?.name ?? "—" },
      ]}>
        <StatGrid items={[scoreTile("Group score", g.score), { label: "Members", value: String(members.length) }]} />
        <Section title="Grading" />
        <Table head={["Criterion", "Weight", "Level"]} widths={[3, 0.8, 1.4]} rows={CASE_CRITERIA.map((c) => {
          const r = g.ratings.find((x) => x.criterion === c.key);
          return [c.label, `${c.weight}%`, r ? `${caseLevelLabel(r.level)} (${r.level})` : "—"];
        })} />
        <Section title="Members" />
        <Table head={["Member", "Role"]} widths={[3, 1]} rows={members.map((m) => [m.name, m.leader ? "Group leader" : "Member"])} />
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
      <Shell ctx={ctx} title="Discharge Summary" subject={patient?.name ?? "—"} rows={[
        { label: "Diagnosis", value: d.diagnosis },
        { label: "Stay", value: `${date(d.admitted_at)} – ${date(d.discharged_at)}` },
        { label: "Room", value: d.room_label },
      ]}>
        <StatGrid items={[
          { label: "Vital readings", value: d.vitals_digest.readings ?? 0 },
          { label: "Flagged", value: d.vitals_digest.flagged ?? 0 },
        ]} />
        <Section title="Findings" />
        <Table head={["Finding", "Severity"]} widths={[4, 1]} rows={(d.vitals_digest.findings ?? []).map((f) => [f.message, f.severity])} emptyText="No findings recorded." />
        <Section title="Follow-up" />
        <Table head={["Action", "Detail"]} widths={[2, 4]} rows={d.follow_up.map((f) => [f.title, f.detail])} emptyText="No follow-up drafted yet." />
      </Shell>
    ),
  };
}

// --- Dean reports ---------------------------------------------------------------------

function facultyReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const faculty = db.users.filter((u) => u.role === "faculty" && (!id || u.id === id));
  if (faculty.length === 0) return { error: "Not found", status: 404 };
  const groupsOf = (fid: string) => db.teams.filter((t) => t.faculty_id === fid);
  return {
    subject: id ? faculty[0].name : "All instructors",
    doc: (
      <Shell ctx={ctx} title={id ? "Instructor Report" : "All Instructors Report"} subject={id ? faculty[0].name : "Your instructors"} rows={[]}>
        <Table head={["Instructor", "Groups", "Students", "Cases graded", "Last sign-in"]} widths={[3, 2.4, 1, 1, 1.4]} rows={faculty.map((f) => {
          const groups = groupsOf(f.id);
          const members = db.users.filter((u) => u.role === "student" && groups.some((g) => g.id === u.team_id));
          return [
            f.name,
            groups.map((g) => teamLabel(db, g.id)).join("; ") || "—",
            members.length,
            db.assignments.filter((a) => a.finalized_by === f.id).length,
            date(f.last_sign_in_at),
          ];
        })} />
      </Shell>
    ),
  };
}

function roomsReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const rooms = db.rooms.filter((r) => !id || r.id === id);
  if (rooms.length === 0) return { error: "Not found", status: 404 };
  return {
    subject: id ? `${rooms[0].room_number} – ${rooms[0].name}` : "All rooms",
    doc: (
      <Shell ctx={ctx} title={id ? "Room Report" : "All Rooms Report"} subject={id ? rooms[0].name : "Your ward"} rows={id ? [{ label: "Number", value: rooms[0].room_number }, { label: "Status", value: rooms[0].status }] : [{ label: "Rooms", value: String(rooms.length) }]}>
        <Table head={["Room", "Status", "Beds", "Patients"]} widths={[3, 1.2, 1, 1]} rows={rooms.map((r) => [
          `${r.room_number} – ${r.name}`, r.status, r.capacity, db.patients.filter((p) => p.room_id === r.id && p.status === "admitted").length,
        ])} />
      </Shell>
    ),
  };
}

function usersReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const users = db.users.filter((u) => u.role !== "super_admin" && (!id || u.id === id));
  return {
    subject: id ? (users[0]?.name ?? "User") : "All accounts",
    doc: (
      <Shell ctx={ctx} title={id ? "User Report" : "All Users Report"} subject={id ? (users[0]?.name ?? "User") : "Your users"} rows={id ? [] : [{ label: "Users", value: String(users.length) }]}>
        <Table head={["Name", "Role", "Section", "Last sign-in"]} widths={[3, 1.2, 1.4, 1.4]} rows={users.map((u) => [
          u.name, roleLabel(u.role, u.admin_title), sectionName(db, u.section_id) ?? "—", date(u.last_sign_in_at),
        ])} />
      </Shell>
    ),
  };
}

function summaryReport(ctx: Ctx): Built {
  const { db } = ctx;
  const students = db.users.filter((u) => u.role === "student");
  const title = `${roleLabel("admin", ctx.viewer.admin_title)} summary`;
  return {
    subject: title,
    doc: (
      <Shell ctx={ctx} title={`${roleLabel("admin", ctx.viewer.admin_title)} Summary Report`} subject="Your instructors and students" rows={[{ label: "Sections", value: db.sections.map((s) => s.name).join(", ") }]}>
        <StatGrid items={[
          { label: "Students", value: students.length },
          { label: "Instructors", value: db.users.filter((u) => u.role === "faculty").length },
          { label: "On track", value: `${students.filter((s) => s.risk_level === "safe").length}/${students.length}` },
          { label: "Patients admitted", value: db.patients.filter((p) => p.status === "admitted").length },
        ]} />
        <Section title="Sections" />
        <Table head={["Section", "Students", "Case average", "Quiz average"]} widths={[2, 1, 1.2, 1.2]} rows={db.sections.map((sec) => {
          const members = students.filter((s) => s.section_id === sec.id);
          return [
            sec.name,
            members.length,
            pct(mean(members.map((s) => caseAverage(db, s.id)).filter((x): x is number => x !== null))),
            pct(mean(members.map((s) => quizAverage(db, s.id)).filter((x): x is number => x !== null))),
          ];
        })} />
        <View />
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
