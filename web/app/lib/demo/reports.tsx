"use client";

import { pdf, Text, View } from "@react-pdf/renderer";
import { ReportShell, StatGrid, Table, type ReportDocument, type ReportMeta } from "../reports/kit-ui";
import { CASE_CRITERIA } from "../case-rubric";
import { ratingLabel } from "../task-ratings";
import type { DemoContext } from "./router";
import { caseAverage, lastActivity, mean, quizAverage, submittedAttempts } from "./handlers/derive";
import { sectionName, teamLabel as teamLabelUi, userById, visibleSections, visibleStudents } from "./handlers/scope";

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

function meta(ctx: Ctx): ReportMeta {
  return {
    campus: "Batangas State University – TNEU ARASOF Nasugbu",
    generatedBy: ctx.viewer.name,
    generatedAt: new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" }),
  };
}

function Shell({ ctx, title, heading, rows, children }: { ctx: Ctx; title: string; heading: string; rows: { label: string; value: string }[]; children: React.ReactNode }) {
  return (
    <ReportShell title={title} heading={heading} meta={meta(ctx)} metaRows={rows} logo={LOGO}>
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
  const cases = db.assignments.filter((a) => a.student_id === id).sort((a, b) => b.assigned_at.localeCompare(a.assigned_at));
  const attempts = submittedAttempts(db, id);
  const shifts = db.shiftEntries.filter((e) => e.student_id === id && e.attendance_status !== "scheduled");
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
          { label: "Cases graded", value: cases.filter((a) => a.status === "completed").length },
          { label: "Shifts attended", value: `${shifts.filter((e) => e.attendance_status !== "absent").length}/${shifts.length}` },
        ]} />
        <H>Patient cases</H>
        <Table head={["Case", "Status", "Score", "Deadline"]} widths={[4, 1.4, 1, 1.4]} rows={cases.map((a) => [
          db.scenarios.find((x) => x.id === a.scenario_id)?.title ?? "—",
          a.status === "completed" ? "Graded" : a.submitted_at ? "Awaiting review" : a.status === "overdue" ? "Overdue" : "Open",
          pct(a.score),
          date(a.deadline),
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

function sectionReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const name = sectionName(db, id);
  if (!name) return { error: "Not found", status: 404 };
  const students = visibleStudents(db, ctx.role, ctx.viewer.id).filter((s) => s.section_id === id);
  return {
    subject: name,
    doc: (
      <Shell ctx={ctx} title={`Section report — ${name}`} heading="Section Performance Report" rows={[{ label: "Section", value: name }]}>
        <StatGrid items={[
          { label: "Students", value: students.length },
          { label: "Case average", value: pct(mean(students.map((s) => caseAverage(db, s.id)).filter((x): x is number => x !== null))) },
          { label: "Quiz average", value: pct(mean(students.map((s) => quizAverage(db, s.id)).filter((x): x is number => x !== null))) },
          { label: "Low performing", value: students.filter((s) => s.risk_level === "at_risk").length },
        ]} />
        <H>Students</H>
        <Table head={["Student", "Group", "Cases", "Quizzes", "Last active"]} widths={[3, 1.6, 1, 1, 1.4]} rows={students.map((s) => [
          s.name,
          db.teams.find((t) => t.id === s.team_id)?.name ?? "—",
          pct(caseAverage(db, s.id)),
          pct(quizAverage(db, s.id)),
          date(lastActivity(db, s.id)),
        ])} />
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
          { label: "Graded", value: rows.filter((a) => a.status === "completed").length },
          { label: "Awaiting review", value: rows.filter((a) => a.submitted_at && a.status !== "completed").length },
          { label: "Average", value: pct(mean(rows.filter((a) => a.score != null).map((a) => a.score!))) },
        ]} />
        <H>Students</H>
        <Table head={["Student", "Group", "Status", "Score"]} widths={[3, 2, 1.4, 1]} rows={rows.map((a) => {
          const s = userById(db, a.student_id);
          return [s?.name ?? "—", teamLabel(db, s?.team_id) ?? "—", a.status === "completed" ? "Graded" : a.submitted_at ? "Awaiting review" : a.status, pct(a.score)];
        })} />
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

function attendanceReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const name = sectionName(db, id);
  if (!name) return { error: "Not found", status: 404 };
  const students = visibleStudents(db, ctx.role, ctx.viewer.id).filter((s) => s.section_id === id);
  const tally = (sid: string, status: string) => db.shiftEntries.filter((e) => e.student_id === sid && e.attendance_status === status).length;
  return {
    subject: name,
    doc: (
      <Shell ctx={ctx} title={`Attendance — ${name}`} heading="Shift Attendance Report" rows={[{ label: "Section", value: name }]}>
        <Table head={["Student", "Present", "Late", "Absent", "Excused"]} widths={[3, 1, 1, 1, 1]} rows={students.map((s) => [
          s.name, tally(s.id, "present"), tally(s.id, "late"), tally(s.id, "absent"), tally(s.id, "excused"),
        ])} />
        <Text style={note}>Attendance is detected from sign-ins and app activity during each shift; instructors only excuse absences.</Text>
      </Shell>
    ),
  };
}

function caseReport(ctx: Ctx, id: string): Built {
  const { db } = ctx;
  const s = db.caseSubmissions.find((x) => x.id === id);
  if (!s) return { error: "Not found", status: 404 };
  const p = db.casePresentations.find((x) => x.id === s.presentation_id);
  const student = userById(db, s.student_id);
  return {
    subject: `${student?.name ?? "Student"} — ${p?.title ?? "Case"}`,
    doc: (
      <Shell ctx={ctx} title="Case presentation" heading="Case Presentation" rows={[
        { label: "Student", value: student?.name ?? "—" },
        { label: "Presentation", value: p?.title ?? "—" },
        { label: "Patient", value: `${s.patient_initials ?? "—"}, ${s.age ?? "—"}` },
      ]}>
        <StatGrid items={[{ label: "Score", value: pct(s.score) }, { label: "Status", value: s.status }]} />
        <H>Admitting diagnosis</H>
        <Text>{s.admitting_diagnosis || "—"}</Text>
        <H>Nursing diagnoses</H>
        <Text>{s.nursing_diagnoses || "—"}</Text>
        <H>Interventions</H>
        <Text>{s.interventions || "—"}</Text>
        <H>Grading</H>
        <Table head={["Criterion", "Rating"]} widths={[3, 1.4]} rows={CASE_CRITERIA.map((c) => {
          const r = s.ratings.find((x) => x.criterion === c.key);
          return [c.label, r ? ratingLabel(r.rating) : "—"];
        })} />
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
          u.name, u.role === "admin" ? "Dean" : u.role === "faculty" ? "Instructor" : "Student", sectionName(db, u.section_id) ?? "—", date(u.last_sign_in_at),
        ])} />
      </Shell>
    ),
  };
}

function summaryReport(ctx: Ctx): Built {
  const { db } = ctx;
  const students = db.users.filter((u) => u.role === "student");
  return {
    subject: "Dean summary",
    doc: (
      <Shell ctx={ctx} title="Dean summary" heading="Program Summary" rows={[{ label: "Sections", value: db.sections.map((s) => s.name).join(", ") }]}>
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
  roster: (ctx) => rosterReport(ctx),
  attendance: attendanceReport,
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
