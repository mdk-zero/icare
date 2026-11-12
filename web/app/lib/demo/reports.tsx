"use client";

import { pdf, Text, View } from "@react-pdf/renderer";
import { CourseCriteria, ReportShell, StatGrid, Table, type ReportDocument, type ReportMeta } from "../reports/kit-ui";
import { CASE_CRITERIA, caseLevelLabel } from "../case-rubric";
import { ChecklistSheet } from "../reports/checklist-sheet";
import { buildSheetSkills } from "../reports/checklist-grades";
import { parseTarget } from "../reports/targets";
import { competencyRemark } from "../return-demo-remarks";
import { ActivityTable, type GridEntry, type GridMember } from "../reports/activity-sheet";
import { CriterionTable, QuizAnswers, QuizMatrix } from "../reports/quiz-sheet";
import { answerRows, criterionForGroup, criterionForStudent, matrix, type QuizCriterion, type QuizQuestion, type QuizTry } from "../reports/quiz-model";
import type { DemoAttempt } from "./fixtures/school";
import type { DemoDb } from "./store";
import { scoreDescriptor } from "../task-ratings";
import type { DemoCaseGroup } from "./fixtures/teaching";
import type { DemoContext } from "./router";
import { caseAverage, mean, quizAverage, submittedAttempts } from "./handlers/derive";
import { sectionName, teamLabel as teamLabelUi, userById, visibleSections, visibleStudents } from "./handlers/scope";
import { DEMO_INSTITUTION } from "./fixtures/school";
import { demoStudentStandings } from "./handlers/courses";
import { roleLabel } from "../role-labels";

/** The PDF's built-in Helvetica has no middle dot, so labels use an en dash. */
const teamLabel: typeof teamLabelUi = (db, id) => teamLabelUi(db, id)?.replace(" – ", " – ") ?? null;

/**
 * The demo's PDF reports: the same letterhead, tiles and tables as the real
 * ones (lib/reports/kit-ui), laid out from the demo's data and rendered in
 * the browser. Loaded only when a report is asked for.
 */

type Ctx = DemoContext;
type Built = { subject: string; doc: ReportDocument } | { error: string; status: number };

const LOGO = "/logo-no-bg.png";
const section = { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 6 } as const;
const note = { fontSize: 8, color: "#6b7280", marginTop: 6 } as const;

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—");
/** When it was handed in, flagged when that was past its deadline. */
const submitted = (a: { submitted_at: string | null; deadline: string | null }) =>
  a.submitted_at ? `${date(a.submitted_at)}${a.deadline && Date.parse(a.submitted_at) > Date.parse(a.deadline) ? " (late)" : ""}` : "—";

function meta(ctx: Ctx): ReportMeta {
  return {
    campus: DEMO_INSTITUTION,
    generatedBy: ctx.viewer.name,
    generatedAt: new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" }),
  };
}

function Shell({ ctx, title, heading, rows, orientation, children }: { ctx: Ctx; title: string; heading: string; rows: { label: string; value: string }[]; orientation?: "portrait" | "landscape"; children: React.ReactNode }) {
  return (
    <ReportShell title={title} heading={heading} meta={meta(ctx)} metaRows={rows} logo={LOGO} orientation={orientation}>
      {children}
      <Text style={note}>Demo report: built from sample data in your browser.</Text>
    </ReportShell>
  );
}

function H({ children }: { children: string }) {
  return <Text style={section}>{children}</Text>;
}

// --- Instructor reports -----------------------------------------------------------

function studentReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const s = userById(db, id);
  if (!s || !visibleStudents(db, ctx.role, ctx.viewer.id).some((x) => x.id === id)) return { error: "Not found", status: 404 };
  // Return Demonstrations (072) get their own table; the case table and average leave them out.
  const demos = new Set(db.scenarios.filter((x) => x.kind === "return_demo").map((x) => x.id));
  const work = db.assignments.filter((a) => a.student_id === id).sort((a, b) => b.assigned_at.localeCompare(a.assigned_at));
  const cases = work.filter((a) => !demos.has(a.scenario_id));
  const returnDemos = work.filter((a) => demos.has(a.scenario_id));
  const attempts = submittedAttempts(db, id);
  return {
    subject: s.name,
    doc: (
      <Shell ctx={ctx} title={`Student report — ${s.name}`} heading="Student Performance Report" rows={[
        { label: "Student", value: s.name },
        { label: "Section / group", value: teamLabel(db, s.team_id) ?? sectionName(db, s.section_id) ?? "—" },
        { label: "Risk check", value: s.risk_level === "at_risk" ? `Low performing (${Math.round((s.risk_probability ?? 0) * 100)}%)` : "On track" },
      ]}>
        <StatGrid items={[
          { label: "Patient case average", value: pct(caseAverage(db, id)) },
          { label: "Quiz average", value: pct(quizAverage(db, id)) },
          { label: "Cases performed", value: cases.filter((a) => a.status === "completed").length },
        ]} />
        <H>Courses and assessment criteria</H>
        <CourseCriteria courses={demoStudentStandings(db, id)} />
        <H>Patient cases</H>
        <Table head={["Case", "Score", "Performed"]} widths={[4, 1, 1.4]} rows={cases.map((a) => [
          db.scenarios.find((x) => x.id === a.scenario_id)?.title ?? "—",
          pct(a.score),
          submitted(a),
        ])} />
        <H>Return Demonstrations</H>
        <Table head={["Return Demonstration", "Score", "Performed", "Remarks"]} widths={[4, 1, 1.4, 1.6]} rows={returnDemos.map((a) => [
          db.scenarios.find((x) => x.id === a.scenario_id)?.title ?? "—",
          pct(a.score),
          a.status === "completed" ? date(a.completed_at) : "—",
          competencyRemark(a.status === "completed" ? a.score : null),
        ])} />
        <H>Quizzes</H>
        <Table head={["Quiz", "Score", "Submitted"]} widths={[4, 1, 1.4]} rows={attempts.map((a) => [
          db.quizzes.find((q) => q.id === a.assessment_id)?.title ?? "—",
          pct(a.score),
          date(a.submitted_at),
        ])} />
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
  const blocks = new Map<string, GridMember[]>();
  for (const s of students) {
    const group = db.teams.find((t) => t.id === s.team_id)?.name ?? NO_GROUP;
    blocks.set(group, [...(blocks.get(group) ?? []), { name: s.name, entries: demoGrid(db, s.id) }]);
  }
  const groups = [...blocks.entries()]
    .sort(([a], [b]) => (a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([group, members]) => ({ group, members: [...members].sort((x, y) => x.name.localeCompare(y.name)) }));
  return {
    subject: name,
    doc: (
      <Shell ctx={ctx} title={`Section report — ${name}`} heading="Section Performance Report" orientation="landscape" rows={[{ label: "Section", value: name }]}>
        <StatGrid items={[
          { label: "Students", value: students.length },
          { label: "Case average", value: pct(mean(students.map((s) => caseAverage(db, s.id)).filter((x): x is number => x !== null))) },
          { label: "Quiz average", value: pct(mean(students.map((s) => quizAverage(db, s.id)).filter((x): x is number => x !== null))) },
          { label: "Low performing", value: students.filter((s) => s.risk_level === "at_risk").length },
        ]} />
        <H>Groups</H>
        {groups.map((g) => (
          <ActivityTable key={g.group} members={g.members} heading={<Text style={{ fontWeight: 700, marginTop: 4, marginBottom: 3 }}>{g.group}</Text>} />
        ))}
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
      <Shell ctx={ctx} title={`Patient case report — ${sc.title}`} heading="Patient Case Report" rows={[{ label: "Patient case", value: sc.title }, { label: "Category", value: sc.category }]}>
        <StatGrid items={[
          { label: "Assigned", value: rows.length },
          { label: "Performed", value: rows.filter((a) => a.status === "completed").length },
          { label: "Awaiting review", value: rows.filter((a) => a.submitted_at && a.status !== "completed").length },
          { label: "Average", value: pct(mean(rows.filter((a) => a.score != null).map((a) => a.score!))) },
        ]} />
        <H>Students</H>
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
        <Shell ctx={ctx} title={`${noun} — ${demo.title}`} heading={heading} rows={[
          { label: noun, value: demo.title },
          { label: "Student", value: student?.name ?? "—" },
          { label: "Group", value: teamLabel(db, student?.team_id) ?? "—" },
          { label: "Date of performance", value: date(a.deadline) },
        ]}>
          <StatGrid items={[
            { label: "Score", value: pct(sc) },
            { label: "Rating", value: sc === null ? "—" : scoreDescriptor(sc) },
            ...(kind === "return_demo"
              ? [{ label: "Remarks", value: competencyRemark(sc) }]
              : [{ label: "Status", value: a.status === "completed" ? "Performed" : "Not yet performed" }]),
          ]} />
          <H>Checklist and grades</H>
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
      <Shell ctx={ctx} title={`${noun} — ${demo.title}`} heading={heading} orientation="landscape" rows={[
        { label: noun, value: demo.title },
        { label: "Group", value: label },
        { label: "Members", value: String(members.length) },
      ]}>
        <StatGrid items={[
          { label: "Members", value: members.length },
          { label: "Performed", value: scores.length },
          { label: "Group average", value: pct(mean(scores)) },
        ]} />
        <H>Members</H>
        <Table head={kind === "return_demo" ? ["Member", "Date of performance", "Score", "Remarks"] : ["Member", "Date of performance", "Status", "Score"]} widths={kind === "return_demo" ? [3, 1.6, 1.8, 1.6] : [3, 1.6, 1.4, 1.6]} rows={members.map((m) => kind === "return_demo"
          ? [m.student?.name ?? "—", date(m.a.deadline), pct(score(m.a)), competencyRemark(score(m.a))]
          : [m.student?.name ?? "—", date(m.a.deadline), m.a.status === "completed" ? "Performed" : "Not yet performed", pct(score(m.a))])} />
        <H>Checklist and grades</H>
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
      <Shell ctx={ctx} title={`Group report — ${label}`} heading="Group Performance Report" orientation="landscape" rows={[
        { label: "Group", value: label },
        { label: "Members", value: String(members.length) },
      ]}>
        <StatGrid items={[
          { label: "Members", value: members.length },
          { label: "Case average", value: pct(mean(members.map((s) => caseAverage(db, s.id)).filter((x): x is number => x !== null))) },
          { label: "Quiz average", value: pct(mean(members.map((s) => quizAverage(db, s.id)).filter((x): x is number => x !== null))) },
        ]} />
        <H>Work given to this group</H>
        <ActivityTable members={members.map((s) => ({ name: s.name, entries: demoGrid(db, s.id) }))} />
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
        <Shell ctx={ctx} title={`Quiz — ${quiz.title}`} heading="Quiz Answers Report" rows={[
          { label: "Quiz", value: quiz.title },
          { label: "Student", value: student.name },
          { label: "Group", value: teamLabel(db, student.team_id) ?? "—" },
          { label: "Submitted tries", value: String(taken.length) },
        ]}>
          <StatGrid items={[
            { label: "Grade", value: pct(g) },
            { label: "Submitted tries", value: taken.length },
            { label: "Remarks", value: g === null ? "Not taken" : g >= 75 ? "Passed" : "Below passing" },
          ]} />
          <H>Results by criterion</H>
          <CriterionTable columns={["Correct"]} rows={criterionForStudent(questions, criteria, taken)} />
          {taken.length === 0 ? <Text style={note}>{student.name} has not submitted a try yet.</Text> : taken.map((t) => (
            <View key={t.number}>
              <H>{`Try ${t.number} - ${pct(t.score === null ? null : Math.round(t.score))}${t.submittedAt ? ` - ${date(t.submittedAt)}` : ""}`}</H>
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
      <Shell ctx={ctx} title={`Quiz — ${quiz.title}`} heading="Quiz Answers Report" orientation="landscape" rows={[
        { label: "Quiz", value: quiz.title },
        { label: "Group", value: label },
        { label: "Members", value: String(members.length) },
      ]}>
        <StatGrid items={[
          { label: "Members", value: members.length },
          { label: "Completed", value: grades.length },
          { label: "Group average", value: pct(mean(grades)) },
        ]} />
        <H>Results by criterion</H>
        <CriterionTable columns={members.map((m) => m.name)} rows={criterionForGroup(questions, criteria, latest)} />
        <H>Questions</H>
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
      <Shell ctx={ctx} title={`Quiz report — ${quiz.title}`} heading="Quiz Results Report" rows={[{ label: "Quiz", value: quiz.title }]}>
        <StatGrid items={[
          { label: "Assigned", value: students.length },
          { label: "Submitted", value: students.filter((s) => best(s.id) !== null).length },
          { label: "Average best score", value: pct(mean(students.map((s) => best(s.id)).filter((x): x is number => x !== null))) },
        ]} />
        <H>Results</H>
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
      <Shell ctx={ctx} title="Roster summary" heading="Roster Summary" rows={[{ label: "Sections", value: visibleSections(db, ctx.role, ctx.viewer.id).map((s) => s.name).join(", ") }]}>
        <StatGrid items={[
          { label: "Students", value: students.length },
          { label: "With graded work", value: students.filter((s) => caseAverage(db, s.id) !== null).length },
          { label: "Low performing", value: students.filter((s) => s.risk_level === "at_risk").length },
        ]} />
        <H>Every student</H>
        <Table head={["Student", "Section / group", "Cases", "Quizzes"]} widths={[3, 2.4, 1, 1]} rows={students.map((s) => [s.name, teamLabel(db, s.team_id) ?? "—", pct(caseAverage(db, s.id)), pct(quizAverage(db, s.id))])} />
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
      <Shell ctx={ctx} title="Case presentation" heading="Case Presentation" rows={[
        { label: "Group", value: `${g.team_name} · ${g.section_name}` },
        { label: "Presentation", value: p?.title ?? "—" },
        { label: "Leader", value: members.find((m) => m.leader)?.name ?? "—" },
        { label: "Slides", value: g.file?.name ?? "—" },
      ]}>
        <StatGrid items={[{ label: "Group score", value: pct(g.score) }, { label: "Members", value: String(members.length) }]} />
        <H>Grading</H>
        <Table head={["Criterion", "Weight", "Level"]} widths={[3, 0.8, 1.4]} rows={CASE_CRITERIA.map((c) => {
          const r = g.ratings.find((x) => x.criterion === c.key);
          return [c.label, `${c.weight}%`, r ? `${caseLevelLabel(r.level)} (${r.level})` : "—"];
        })} />
        <H>Members</H>
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
      <Shell ctx={ctx} title="Discharge summary" heading="Discharge Summary" rows={[
        { label: "Patient", value: patient?.name ?? "—" },
        { label: "Diagnosis", value: d.diagnosis },
        { label: "Stay", value: `${date(d.admitted_at)} – ${date(d.discharged_at)}` },
        { label: "Room", value: d.room_label.replace(" · ", " – ") },
      ]}>
        <StatGrid items={[
          { label: "Vital readings", value: d.vitals_digest.readings ?? 0 },
          { label: "Flagged", value: d.vitals_digest.flagged ?? 0 },
        ]} />
        <H>Findings</H>
        <Table head={["Finding", "Severity"]} widths={[4, 1]} rows={(d.vitals_digest.findings ?? []).map((f) => [f.message, f.severity])} emptyText="No findings recorded." />
        <H>Follow-up</H>
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
      <Shell ctx={ctx} title="Instructor report" heading="Instructor Report" rows={[{ label: "Scope", value: id ? faculty[0].name : "Every instructor" }]}>
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
      <Shell ctx={ctx} title="Room report" heading="Ward Room Report" rows={[{ label: "Rooms", value: String(rooms.length) }]}>
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
      <Shell ctx={ctx} title="Account report" heading="Account Report" rows={[{ label: "Accounts", value: String(users.length) }]}>
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
      <Shell ctx={ctx} title={title} heading="Program Summary" rows={[{ label: "Sections", value: db.sections.map((s) => s.name).join(", ") }]}>
        <StatGrid items={[
          { label: "Students", value: students.length },
          { label: "Instructors", value: db.users.filter((u) => u.role === "faculty").length },
          { label: "On track", value: `${students.filter((s) => s.risk_level === "safe").length}/${students.length}` },
          { label: "Patients admitted", value: db.patients.filter((p) => p.status === "admitted").length },
        ]} />
        <H>Sections</H>
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

export async function buildDemoReport(ctx: Ctx, type: string, id: string): Promise<{ response: Response; subject?: string }> {
  const build = BUILDERS[type];
  if (!build) return { response: Response.json({ error: `Unknown report type "${type}"` }, { status: 404 }) };
  const result = build(ctx, id);
  if ("error" in result) return { response: Response.json({ error: result.error }, { status: result.status }) };
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
