"use client";

import { json, ndjson, notFound, route, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoAssignment, DemoScenario } from "../fixtures/school";
import { audit } from "./shared";
import {
  DAY_MS,
  assignmentRow,
  caseAverage,
  hasWork,
  lastActivity,
  levelForCredit,
  mean,
  prediction,
  quizAverage,
  scoreAssignment,
  scoredAt,
  studentRow,
  submittedAttempts,
  taskCredit,
} from "./derive";
import {
  byName,
  canSeeStudent,
  memberInfo,
  ownTeams,
  sectionName,
  teamLabel,
  userById,
  visibleSections,
  visibleStudents,
} from "./scope";
import { isTaskRating, resolveRubric, type TaskRating } from "@/app/lib/task-ratings";
import { formatAuditDetails } from "@/app/lib/audit-details";

/**
 * The Instructor portal's API (and the parts of it the Dean shares: the
 * faculty routes accept both roles, scoped as the real ones are).
 */

type Ctx = DemoContext;

const staffOnly = (ctx: Ctx) => ctx.role === "faculty" || ctx.role === "admin";
const forbidden = () => json({ error: "Forbidden" }, 403);

function myStudents(ctx: Ctx) {
  return visibleStudents(ctx.db, ctx.role, ctx.viewer.id);
}

function myStudentIds(ctx: Ctx) {
  return new Set(myStudents(ctx).map((s) => s.id));
}

// ---------------------------------------------------------------------------
// Alerts and the dashboard
// ---------------------------------------------------------------------------

function alertsFor(ctx: Ctx) {
  const alerts = myStudents(ctx)
    .filter((s) => s.risk_level === "at_risk" && hasWork(ctx.db, s.id))
    .map((s) => ({
      id: `risk-${s.id}`,
      student_id: s.id,
      student_name: s.name,
      alert_type: "Low Performance Prediction",
      severity: "high" as const,
      description: `ML model flagged this student as low performing (${Math.round((s.risk_probability ?? 0) * 100)}% probability).`,
      status: "pending" as const,
      created_at: scoredAt(),
    }));
  return alerts.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

route("GET", "/api/faculty/alerts", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const status = ctx.query.get("status");
  const all = alertsFor(ctx);
  const alerts = status && status !== "all" ? all.filter((a) => a.status === status) : all;
  return { alerts, total: all.length, pending: all.filter((a) => a.status === "pending").length };
});

function weekStart(ms: number): number {
  const d = new Date(ms);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday);
}

const RECENT_DAYS = 14;
const TRACE_WEEKS = 8;
const DUE_SOON_DAYS = 7;
const LOW_AVERAGE = 60;
const INACTIVE_DAYS = 7;

/** Port of lib/faculty-dashboard.ts buildFacultyOverview over the demo tables. */
function overview(ctx: Ctx) {
  const { db } = ctx;
  const now = Date.now();
  const students = myStudents(ctx);
  const ids = new Set(students.map((s) => s.id));
  const sections = visibleSections(db, ctx.role, ctx.viewer.id).filter((sec) =>
    ctx.role === "faculty" ? true : students.some((s) => s.section_id === sec.id),
  );
  const studentById = new Map(students.map((s) => [s.id, s]));
  const traceFrom = weekStart(now) - (TRACE_WEEKS - 1) * 7 * DAY_MS;

  const overdueBy = new Map<string, number>();
  const dueBySection = new Map<string, { due: number; done: number }>();
  const reviewItems: { assignment_id: string; student_id: string; student_name: string; scenario_title: string; submitted_at: string }[] = [];
  const dueSoon = new Map<string, { kind: "scenario" | "quiz"; id: string; title: string; deadline: string; open: number }>();

  const tally = (studentId: string, deadline: string | null, done: boolean) => {
    if (!deadline || Date.parse(deadline) >= now) return;
    const sectionId = studentById.get(studentId)?.section_id;
    if (sectionId) {
      const d = dueBySection.get(sectionId) ?? { due: 0, done: 0 };
      d.due += 1;
      if (done) d.done += 1;
      dueBySection.set(sectionId, d);
    }
    if (!done) overdueBy.set(studentId, (overdueBy.get(studentId) ?? 0) + 1);
  };
  const noteDueSoon = (kind: "scenario" | "quiz", itemId: string, title: string, deadline: string | null, done: boolean) => {
    if (!deadline || done) return;
    const at = Date.parse(deadline);
    if (at < now || at > now + DUE_SOON_DAYS * DAY_MS) return;
    const key = `${kind}:${itemId}`;
    const item = dueSoon.get(key) ?? { kind, id: itemId, title, deadline, open: 0 };
    item.open += 1;
    dueSoon.set(key, item);
  };

  for (const a of db.assignments.filter((x) => ids.has(x.student_id))) {
    const title = db.scenarios.find((s) => s.id === a.scenario_id)?.title ?? "Patient Case";
    const done = a.status === "completed" || Boolean(a.submitted_at);
    tally(a.student_id, a.deadline, done);
    noteDueSoon("scenario", a.scenario_id, title, a.deadline, done);
    if (a.submitted_at && a.status !== "completed") {
      reviewItems.push({
        assignment_id: a.id,
        student_id: a.student_id,
        student_name: studentById.get(a.student_id)?.name ?? "Unknown student",
        scenario_title: title,
        submitted_at: a.submitted_at,
      });
    }
  }
  for (const q of db.quizAssignments.filter((x) => ids.has(x.student_id))) {
    const title = db.quizzes.find((x) => x.id === q.assessment_id)?.title ?? "Quiz";
    const done = q.status === "completed";
    tally(q.student_id, q.deadline, done);
    noteDueSoon("quiz", q.assessment_id, title, q.deadline, done);
  }

  const recentFrom = now - RECENT_DAYS * DAY_MS;
  const priorFrom = now - 2 * RECENT_DAYS * DAY_MS;
  const recentBy = new Map<string, number[]>();
  const sectionScores = new Map<string, { recent: number[]; prior: number[]; weeks: Map<number, number[]> }>();
  const cohortRecent: number[] = [];
  const cohortPrior: number[] = [];
  for (const a of db.attempts) {
    if (!ids.has(a.student_id) || a.status !== "submitted" || a.score == null || !a.submitted_at) continue;
    const at = Date.parse(a.submitted_at);
    const sectionId = studentById.get(a.student_id)?.section_id ?? null;
    const bucket = sectionId
      ? (sectionScores.get(sectionId) ?? { recent: [] as number[], prior: [] as number[], weeks: new Map<number, number[]>() })
      : null;
    if (at >= recentFrom) {
      recentBy.set(a.student_id, [...(recentBy.get(a.student_id) ?? []), a.score]);
      cohortRecent.push(a.score);
      bucket?.recent.push(a.score);
    } else if (at >= priorFrom) {
      cohortPrior.push(a.score);
      bucket?.prior.push(a.score);
    }
    if (bucket && at >= traceFrom) {
      const week = weekStart(at);
      bucket.weeks.set(week, [...(bucket.weeks.get(week) ?? []), a.score]);
    }
    if (sectionId && bucket) sectionScores.set(sectionId, bucket);
  }

  const risk = (id: string) => {
    const s = studentById.get(id);
    return s && hasWork(db, id) ? s.risk_level : null;
  };

  const ranked = students
    .map((s) => {
      const overdue = overdueBy.get(s.id) ?? 0;
      const recentAvg = mean(recentBy.get(s.id) ?? []);
      const last = lastActivity(db, s.id);
      const inactive = !last || Date.parse(last) < now - INACTIVE_DAYS * DAY_MS;
      const atRisk = risk(s.id) === "at_risk";
      const urgency =
        (atRisk ? 3 + (s.risk_probability ?? 0) : 0) +
        Math.min(overdue, 4) * 1.5 +
        (recentAvg != null && recentAvg < LOW_AVERAGE ? 2 : 0) +
        (inactive ? 1 : 0);
      return {
        urgency,
        student: {
          id: s.id,
          name: s.name,
          section: sectionName(db, s.section_id),
          picture_url: s.picture_url,
          sex: s.sex,
          risk: risk(s.id),
          probability: risk(s.id) ? s.risk_probability : null,
          overdue,
          recent_avg: recentAvg,
          last_activity: last,
          open_assistance: 0,
        },
      };
    })
    .filter((r) => r.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency || a.student.name.localeCompare(b.student.name));

  const teams = ownTeams(db, ctx.role, ctx.viewer.id);
  const upcoming = db.shifts
    .filter((s) => s.status === "scheduled" && Date.parse(s.ends_at) > now)
    .filter((s) => !s.team_id || teams.some((t) => t.id === s.team_id))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4)
    .map((s) => {
      const roster = db.shiftEntries.filter((e) => e.shift_id === s.id);
      const room = db.rooms.find((r) => r.id === s.room_id);
      return {
        id: s.id,
        label: s.label,
        shift_type: s.shift_type,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        section: s.team_id ? teamLabel(db, s.team_id) : sectionName(db, s.section_id),
        room: room ? `${room.name} · ${room.room_number}` : null,
        rostered: roster.length,
        checked_in: roster.filter((r) => r.attendance_status === "present" || r.attendance_status === "late").length,
        absent: roster.filter((r) => r.attendance_status === "absent").length,
      };
    });

  return {
    sections: sections.map((section) => {
      const members = students.filter((s) => s.section_id === section.id);
      const scores = sectionScores.get(section.id);
      const due = dueBySection.get(section.id);
      return {
        id: section.id,
        name: section.name,
        students: members.length,
        at_risk: members.filter((s) => risk(s.id) === "at_risk").length,
        overdue: members.reduce((sum, s) => sum + (overdueBy.get(s.id) ?? 0), 0),
        completion: due && due.due > 0 ? Math.round((due.done / due.due) * 100) : null,
        avg_recent: mean(scores?.recent ?? []),
        avg_prior: mean(scores?.prior ?? []),
        weekly: Array.from({ length: TRACE_WEEKS }, (_, i) => {
          const week = traceFrom + i * 7 * DAY_MS;
          return { week_start: new Date(week).toISOString().slice(0, 10), average: mean(scores?.weeks.get(week) ?? []) };
        }),
      };
    }),
    attention: ranked.slice(0, 8).map((r) => r.student),
    attention_total: ranked.length,
    review_queue: {
      total: reviewItems.length,
      items: reviewItems.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).slice(0, 5),
    },
    upcoming_shifts: upcoming,
    due_soon: [...dueSoon.values()].sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5),
    overdue_assignments: [...overdueBy.values()].reduce((sum, n) => sum + n, 0),
    students_behind: overdueBy.size,
    cohort_avg_recent: mean(cohortRecent),
    cohort_avg_prior: mean(cohortPrior),
    scored_at: scoredAt(),
  };
}

route("GET", "/api/faculty/dashboard", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const students = myStudents(ctx);
  const ids = new Set(students.map((s) => s.id));
  const view = overview(ctx);
  const statuses = db.assignments.filter((a) => ids.has(a.student_id)).map((a) => a.status);
  const noise = /^(login|logout|view[_ .])/i;
  return {
    stats: {
      total_students: students.length,
      at_risk_students: students.filter((s) => s.risk_level === "at_risk" && hasWork(db, s.id)).length,
      active_alerts: alertsFor(ctx).length,
      completed_reviews: db.assignments.filter((a) => ids.has(a.student_id) && a.status === "completed").length,
      active_scenarios: statuses.filter((s) => s === "pending" || s === "in_progress").length,
      pending_scenarios: statuses.filter((s) => s === "pending").length,
      awaiting_review: view.review_queue.total,
      overdue_assignments: view.overdue_assignments,
      students_behind: view.students_behind,
    },
    recent_activities: db.audit
      .filter((row) => row.actor_id === ctx.viewer.id && !noise.test(row.action))
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        faculty_id: row.actor_id ?? "",
        faculty_name: ctx.viewer.name,
        tab: "overview",
        action: row.action,
        details: formatAuditDetails(row.details),
        metadata: row.details,
        created_at: row.created_at,
      })),
    overview: view,
  };
});

// ---------------------------------------------------------------------------
// Audit trail (the viewer's own)
// ---------------------------------------------------------------------------

route("GET", "/api/faculty/audit", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const action = ctx.query.get("action");
  const rows = ctx.db.audit
    .filter((r) => r.actor_id === ctx.viewer.id)
    .filter((r) => !action || action === "all" || r.action.toLowerCase().includes(action.toLowerCase()))
    .slice(0, 200);
  return {
    logs: rows.map((row) => ({
      id: row.id,
      faculty_id: row.actor_id ?? "",
      faculty_name: ctx.viewer.name,
      tab: row.entity_type ?? "general",
      action: row.action,
      details: formatAuditDetails(row.details),
      target_id: row.entity_id,
      created_at: row.created_at,
    })),
  };
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

route("GET", "/api/faculty/students", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return { students: myStudents(ctx).map((s) => studentRow(ctx.db, s)) };
});

route("GET", "/api/faculty/students/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const student = userById(db, ctx.params.id);
  if (!student || student.role !== "student") return notFound("Student not found");
  if (!canSeeStudent(db, ctx.role, ctx.viewer.id, student.id)) return forbidden();
  const attempts = submittedAttempts(db, student.id);
  const scores = attempts.map((a) => a.score ?? 0);
  return {
    student: {
      ...studentRow(db, student),
      average_score: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : null,
      quiz_count: scores.length,
    },
    performance_history: attempts.map((a) => ({
      id: a.id,
      assessment_id: a.assessment_id,
      quiz_title: db.quizzes.find((q) => q.id === a.assessment_id)?.title ?? "Assessment",
      score: a.score,
      submitted_at: a.submitted_at,
      started_at: a.started_at,
      time_taken_seconds: a.time_taken_seconds,
      correct_answers: a.correct_answers,
      total_questions: a.total_questions,
    })),
  };
});

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

route("POST", "/api/faculty/students", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const sectionId = typeof body?.section_id === "string" ? body.section_id : "";
  if (!name) return json({ error: "Student name is required" }, 400);
  if (!email) return json({ error: "Student email is required" }, 400);
  if (!sectionId) return json({ error: "Section is required" }, 400);
  if (!validEmail(email)) return json({ error: "Invalid email format" }, 400);
  if (!visibleSections(db, ctx.role, ctx.viewer.id).some((s) => s.id === sectionId)) {
    return json({ error: "You can only add students to your own sections" }, 403);
  }
  if (db.users.some((u) => u.email === email)) return json({ error: "A user with this email already exists" }, 409);
  const sex = body?.sex === "male" || body?.sex === "female" ? body.sex : null;
  const student = {
    id: newId(),
    email,
    name,
    role: "student" as const,
    sex,
    picture_url: null,
    section_id: sectionId,
    team_id: null,
    admin_id: null,
    student_number: null,
    created_at: new Date().toISOString(),
    last_sign_in_at: null,
    last_activity: null,
    status: "active" as const,
    google_linked: false,
    risk_level: null,
    risk_probability: null,
  };
  db.users.push(student);
  audit(db, ctx.viewer, "user.create", "users", { message: `Created student account for ${name}` }, student.id);
  return json(
    {
      student: { id: student.id, email, name, role: "student", section_id: sectionId },
      password: "Demo-Pass-2026",
      warning: "This is a demo: no invitation email was sent. In the real app the student gets this temporary password by email.",
    },
    201,
  );
});

route("PUT", "/api/faculty/students", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const student = userById(db, body?.id ?? body?.student_id);
  if (!student || student.role !== "student") return notFound("Student not found");
  if (!canSeeStudent(db, ctx.role, ctx.viewer.id, student.id)) return forbidden();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name) return json({ error: "Student name is required" }, 400);
  if (!email) return json({ error: "Student email is required" }, 400);
  if (!validEmail(email)) return json({ error: "Invalid email format" }, 400);
  if (db.users.some((u) => u.email === email && u.id !== student.id)) {
    return json({ error: "A user with this email already exists" }, 409);
  }
  student.name = name;
  student.email = email;
  if (body?.sex === "male" || body?.sex === "female") student.sex = body.sex;
  if (typeof body?.section_id === "string" && body.section_id !== student.section_id) {
    student.section_id = body.section_id;
    student.team_id = null;
  }
  return { student: { ...studentRow(db, student) } };
});

route("DELETE", "/api/faculty/students", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const id = body?.id ?? body?.student_id;
  const student = userById(db, id);
  if (!student || student.role !== "student" || !canSeeStudent(db, ctx.role, ctx.viewer.id, student.id)) {
    return notFound("Student not found");
  }
  db.users = db.users.filter((u) => u.id !== student.id);
  db.assignments = db.assignments.filter((a) => a.student_id !== student.id);
  db.quizAssignments = db.quizAssignments.filter((a) => a.student_id !== student.id);
  db.attempts = db.attempts.filter((a) => a.student_id !== student.id);
  db.shiftEntries = db.shiftEntries.filter((e) => e.student_id !== student.id);
  audit(db, ctx.viewer, "user.delete", "users", { message: `Deleted student ${student.name}` }, student.id);
  return { success: true };
});

route("GET", "/api/faculty/predictions", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const id = ctx.query.get("student_id");
  if (id) {
    const s = userById(db, id);
    if (!s || !canSeeStudent(db, ctx.role, ctx.viewer.id, id)) return notFound("Student not found");
    return { prediction: prediction(db, s) };
  }
  return { predictions: myStudents(ctx).map((s) => prediction(db, s)).filter(Boolean) };
});

route("GET", "/api/faculty/competency-scores", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const id = ctx.query.get("student_id") ?? "";
  if (!canSeeStudent(db, ctx.role, ctx.viewer.id, id)) return forbidden();
  // One score per skill area per submitted attempt, from the quiz's criteria.
  const scores = submittedAttempts(db, id).flatMap((attempt) => {
    const areas = [
      ...new Set(
        db.criteria.filter((c) => c.assessment_id === attempt.assessment_id && c.competency_id).map((c) => c.competency_id!),
      ),
    ];
    return areas.map((areaId, i) => ({
      id: `${attempt.id}-${i}`,
      student_id: id,
      competency_id: areaId,
      score: Math.max(0, Math.min(100, (attempt.score ?? 0) + ((i * 7) % 11) - 5)),
      attempt_id: attempt.id,
      remarks: null,
      created_at: attempt.submitted_at ?? attempt.started_at,
      competency_areas: { name: AREA_NAMES[areaId] ?? "Skill area" },
    }));
  });
  return { scores };
});

const AREA_NAMES: Record<string, string> = {
  "47a5fabc-e6a0-48bd-9b1b-c8e1cbf8d0d8": "Vital Signs",
  "6a1a5251-8871-4e94-ab2b-57bc58f4ea5b": "Oxygenation",
  "086113d0-4f87-47d2-b6b1-9ed69e3c741e": "Fluid, Electrolyte, and Acid–Base Balance",
};

route("POST", "/api/faculty/students/:id/summary", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const s = userById(db, ctx.params.id);
  if (!s || !canSeeStudent(db, ctx.role, ctx.viewer.id, s.id)) return notFound("Student not found");
  await new Promise((r) => setTimeout(r, 900));
  const first = s.name.split(" ")[0];
  const quiz = quizAverage(db, s.id);
  const cases = caseAverage(db, s.id);
  const weak = s.risk_level === "at_risk";
  return {
    generated_at: new Date().toISOString(),
    summary: {
      overview: weak
        ? `${first} is behind the group: patient case grades average ${cases ?? "—"}% and quizzes ${quiz ?? "—"}%, with at least one case not handed in. The pattern is consistent rather than a single bad week, which is why the risk model flags ${first} as low performing.`
        : `${first} is progressing well, averaging ${cases ?? "—"}% on graded patient cases and ${quiz ?? "—"}% on quizzes. Work is handed in on time and ward attendance is steady.`,
      strengths: weak
        ? ["Attends most ward duties", "Vital sign technique is sound when supervised"]
        : ["Accurate, well-sequenced vital sign technique", "Consistent quiz performance across skill areas", "Hands in patient cases on time"],
      areas_for_improvement: weak
        ? ["Peripheral IV monitoring steps are often skipped", "Patient cases submitted late or not at all", "Quiz scores on Oxygenation are below the group"]
        : ["Explaining each step to the patient while performing it", "Documentation of IV site checks"],
      recommendations: weak
        ? [
            `Meet ${first} this week to agree a catch-up plan for the overdue case`,
            "Assign the IV site monitoring checklist (Skill 15-3) for return demonstration",
            "Pair with a stronger group member on the next ward duty",
          ]
        : ["Offer the next case as a team lead", "Encourage peer coaching on IV therapy skills"],
    },
  };
});

route("GET", "/api/faculty/students/:id/reflections", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const id = ctx.params.id;
  if (!canSeeStudent(db, ctx.role, ctx.viewer.id, id)) return forbidden();
  const graded = db.assignments
    .filter((a) => a.student_id === id && a.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 2);
  return {
    enabled: true,
    reflections: graded.map((a, i) => {
      const title = db.scenarios.find((s) => s.id === a.scenario_id)?.title ?? "Patient case";
      const updated = new Date(Date.parse(a.completed_at!) + DAY_MS).toISOString();
      return {
        id: `refl-${a.id}`,
        source_type: "scenario",
        title,
        score: a.score,
        reflection:
          i === 0
            ? "I was more confident with the blood pressure this time because I palpated the systolic first. I still forgot to tell the patient what I was doing before I started, and I rushed the IV site check at the end."
            : "I counted the respirations while still holding the pulse like the checklist says, and it felt natural. Next time I want to prepare all my equipment before I go to the bedside.",
        feedback_summary:
          i === 0
            ? "Good insight into your technique. Work on explaining each step to the patient and slowing down the IV site assessment."
            : "Well-observed. Preparing equipment first is the right next goal.",
        updated_at: updated,
        goals: [
          {
            id: `goal-${a.id}`,
            text: i === 0 ? "Explain each step to the patient before I do it" : "Gather all equipment before going to the bedside",
            skill_id: i === 0 ? "1-7" : "1-1",
            status: i === 0 ? "open" : "met",
            met_at: i === 0 ? null : updated,
          },
        ],
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

route("GET", "/api/faculty/teams", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const sections = visibleSections(db, ctx.role, ctx.viewer.id);
  const teams = ownTeams(db, ctx.role, ctx.viewer.id).filter((t) => sections.some((s) => s.id === t.section_id));
  const students = myStudents(ctx);
  const sectionStudents =
    ctx.role === "faculty"
      ? students
      : db.users.filter((u) => u.role === "student" && sections.some((s) => s.id === u.section_id)).sort(byName);
  return {
    enabled: true,
    faculty_enabled: true,
    viewer_id: ctx.viewer.id,
    faculty:
      ctx.role === "admin"
        ? db.users.filter((u) => u.role === "faculty" && u.admin_id === ctx.viewer.id).sort(byName).map((u) => ({ id: u.id, name: u.name }))
        : [],
    sections: sections.map((s) => ({ id: s.id, name: s.name })),
    teams: teams
      .map((t) => ({
        id: t.id,
        section_id: t.section_id,
        name: t.name,
        faculty_id: t.faculty_id,
        faculty_name: userById(db, t.faculty_id)?.name ?? null,
        members: db.users.filter((u) => u.role === "student" && u.team_id === t.id).sort(byName).map(memberInfo),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    students: sectionStudents.map((s) => ({ ...memberInfo(s), section_id: s.section_id, team_id: s.team_id })),
  };
});

route("GET", "/api/faculty/teams/summary", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const sections = visibleSections(db, ctx.role, ctx.viewer.id);
  const teams = ownTeams(db, ctx.role, ctx.viewer.id).filter((t) => sections.some((s) => s.id === t.section_id));
  return {
    viewer_id: ctx.viewer.id,
    groups: teams.map((t) => {
      const members = db.users.filter((u) => u.role === "student" && u.team_id === t.id);
      const ids = new Set(members.map((m) => m.id));
      const assigned = db.assignments.filter((a) => ids.has(a.student_id));
      const graded = assigned.filter((a) => a.status === "completed");
      const attempts = db.attempts.filter((a) => ids.has(a.student_id) && a.status === "submitted");
      return {
        team_id: t.id,
        name: t.name,
        section_id: t.section_id,
        section_name: sectionName(db, t.section_id),
        faculty_id: t.faculty_id,
        faculty_name: userById(db, t.faculty_id)?.name ?? null,
        members: members.length,
        scenarios: {
          assigned: assigned.length,
          graded: graded.length,
          cases: new Set(assigned.map((a) => a.scenario_id)).size,
          average: mean(graded.map((a) => a.score ?? 0)),
        },
        assessments: { taken: attempts.length, average: mean(attempts.map((a) => a.score ?? 0)) },
      };
    }),
  };
});

route("PUT", "/api/faculty/teams/members", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const student = userById(db, body?.student_id);
  if (!student || student.role !== "student") return json({ error: "student_id is required" }, 400);
  const teamId: string | null = typeof body?.team_id === "string" ? body.team_id : null;
  const target = db.teams.find((t) => t.id === teamId);

  if (ctx.role === "faculty") {
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!teamId || !target) return json({ error: "Choose the group to move them to" }, 400);
    if (reason.length < 10) return json({ error: "Give a reason of at least 10 characters" }, 400);
    const from = db.teams.find((t) => t.id === student.team_id);
    if (!from || from.faculty_id !== viewer.id) return json({ error: "That student is not in one of your groups" }, 403);
    if (from.id === target.id) return json({ error: "They are already in that group" }, 409);
    if (target.faculty_id !== viewer.id) return json({ error: "You can only move students into groups you supervise" }, 403);
    if (target.section_id !== from.section_id) return json({ error: "The group is in a different section" }, 400);
    student.team_id = target.id;
    const dean = userById(db, viewer.admin_id);
    if (dean) {
      db.notifications.push({
        id: newId(),
        user_id: dean.id,
        type: "system",
        title: "Student moved between groups",
        body: `${viewer.name} moved ${student.name} from ${teamLabel(db, from.id)} to ${teamLabel(db, target.id)}. Reason: ${reason}`,
        data: { kind: "group_move", student_id: student.id },
        read_at: null,
        created_at: new Date().toISOString(),
      });
    }
    audit(db, viewer, "team.move_member", "teams", { message: `Moved ${student.name} from ${from.name} to ${target.name}`, reason }, student.id);
    return { ok: true };
  }

  if (teamId && !target) return notFound("Team not found");
  if (target && target.section_id !== student.section_id) return json({ error: "The team is in a different section" }, 400);
  student.team_id = target?.id ?? null;
  audit(db, viewer, "team.move_member", "teams", {
    message: target ? `Put ${student.name} in ${teamLabel(db, target.id)}` : `Took ${student.name} out of their group`,
  });
  return { ok: true };
});

route("POST", "/api/faculty/teams", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const { db, body } = ctx;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) return json({ error: "Team name must be 1–60 characters" }, 400);
  if (!db.sections.some((s) => s.id === body?.section_id)) return json({ error: "Not one of your sections" }, 403);
  if (db.teams.some((t) => t.section_id === body.section_id && t.name === name)) {
    return json({ error: "That section already has a team with this name" }, 409);
  }
  const team = { id: newId(), section_id: body.section_id, name, faculty_id: null, created_at: new Date().toISOString() };
  db.teams.push(team);
  return json({ team: { id: team.id, section_id: team.section_id, name, members: [] } }, 201);
});

route("PATCH", "/api/faculty/teams/:id", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const { db, body, params } = ctx;
  const team = db.teams.find((t) => t.id === params.id);
  if (!team) return notFound("Team not found");
  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 60) return json({ error: "Team name must be 1–60 characters" }, 400);
    team.name = name;
  }
  if ("faculty_id" in (body ?? {})) {
    team.faculty_id = body.faculty_id ?? null;
    const instructor = userById(db, team.faculty_id);
    audit(db, ctx.viewer, "team.assign_faculty", "teams", {
      message: instructor ? `Gave ${teamLabel(db, team.id)} to ${instructor.name}` : `Took ${teamLabel(db, team.id)} off its instructor`,
    });
  }
  return { ok: true };
});

route("DELETE", "/api/faculty/teams/:id", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const { db, params } = ctx;
  if (!db.teams.some((t) => t.id === params.id)) return notFound("Team not found");
  db.teams = db.teams.filter((t) => t.id !== params.id);
  for (const u of db.users) if (u.team_id === params.id) u.team_id = null;
  return { ok: true };
});

route("POST", "/api/faculty/teams/auto", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const { db, body } = ctx;
  const sectionId = body?.section_id;
  const count = Math.max(1, Math.min(20, Number(body?.count) || 2));
  if (!db.sections.some((s) => s.id === sectionId)) return json({ error: "Not one of your sections" }, 403);
  const existing = db.teams.filter((t) => t.section_id === sectionId).sort((a, b) => a.name.localeCompare(b.name));
  const teams = [...existing];
  for (let i = existing.length; i < count; i++) {
    const team = {
      id: newId(),
      section_id: sectionId,
      name: `Group ${String.fromCharCode(65 + i)}`,
      faculty_id: null,
      created_at: new Date().toISOString(),
    };
    db.teams.push(team);
    teams.push(team);
  }
  const students = db.users.filter((u) => u.role === "student" && u.section_id === sectionId).sort(byName);
  students.forEach((s, i) => {
    s.team_id = teams[i % count].id;
  });
  return { ok: true };
});

route("POST", "/api/faculty/teams/:id/assign-cases", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, params, viewer } = ctx;
  const team = ownTeams(db, ctx.role, viewer.id).find((t) => t.id === params.id);
  if (!team) return notFound("Group not found");
  const scenario = db.scenarios.find((s) => s.id === body?.scenario_id);
  if (!scenario) return notFound("Patient case not found");
  const deadline = typeof body?.deadline === "string" ? body.deadline : null;
  if (!deadline || Number.isNaN(Date.parse(deadline))) return json({ error: "Choose a deadline" }, 400);
  const assigned: string[] = [];
  const skipped: string[] = [];
  for (const member of db.users.filter((u) => u.role === "student" && u.team_id === team.id)) {
    if (db.assignments.some((a) => a.student_id === member.id && a.scenario_id === scenario.id)) {
      skipped.push(member.name);
      continue;
    }
    db.assignments.unshift(newAssignment(scenario, member.id, deadline, body?.required !== false, viewer.id, team.id));
    assigned.push(member.name);
  }
  audit(db, viewer, "scenario.assign", "scenarios", { message: `Assigned “${scenario.title}” to ${teamLabel(db, team.id)}` }, scenario.id);
  return { scenario_title: scenario.title, assigned, skipped };
});

function newAssignment(
  scenario: DemoScenario,
  studentId: string,
  deadline: string,
  required: boolean,
  by: string,
  teamId: string | null,
): DemoAssignment {
  return {
    id: newId(),
    scenario_id: scenario.id,
    student_id: studentId,
    assigned_by: by,
    assigned_at: new Date().toISOString(),
    deadline,
    status: "pending",
    required,
    score: null,
    started_at: null,
    completed_at: null,
    time_taken: null,
    submitted_at: null,
    finalized_by: null,
    team_id: teamId,
  };
}

route("POST", "/api/faculty/ml", (ctx) => mlRun(ctx, myStudents(ctx)));

/** A demo ML run: progress ticks, then the same summary the service returns. */
export function mlRun(ctx: Ctx, students: ReturnType<typeof myStudents>) {
  const action = ctx.body?.action;
  const total = 8;
  const scored = students.filter((s) => hasWork(ctx.db, s.id));
  const result =
    action === "recommend"
      ? { recommendations: scored.length * 2 }
      : { scored: scored.length, at_risk: scored.filter((s) => s.risk_level === "at_risk").length };
  if (action === "predict") audit(ctx.db, ctx.viewer, "ml.run", "ml", { message: "Ran the risk check" });
  return ndjson([...Array.from({ length: total }, (_, i) => ({ done: i + 1, total })), { result }], 180);
}

// ---------------------------------------------------------------------------
// Patient cases
// ---------------------------------------------------------------------------

function canSeeScenario(ctx: Ctx, scenarioId: string) {
  if (ctx.role === "admin") return true;
  const mine = myStudentIds(ctx);
  const assigned = ctx.db.assignments.filter((a) => a.scenario_id === scenarioId);
  return assigned.length === 0 || assigned.some((a) => mine.has(a.student_id));
}

function scenarioOut(ctx: Ctx, s: DemoScenario) {
  const mine = ctx.role === "admin" ? null : myStudentIds(ctx);
  const assigned = ctx.db.assignments.filter((a) => a.scenario_id === s.id && (!mine || mine.has(a.student_id)));
  const patient = ctx.db.patients.find((p) => p.id === s.patient_id);
  return {
    ...s,
    patient_name: patient?.name ?? null,
    student_count: assigned.length,
    student_ids: [...new Set(assigned.map((a) => a.student_id))],
  };
}

route("GET", "/api/faculty/scenarios", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return {
    scenarios: ctx.db.scenarios
      .filter((s) => canSeeScenario(ctx, s.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => scenarioOut(ctx, s)),
  };
});

route("GET", "/api/scenarios/:id", (ctx) => {
  const s = ctx.db.scenarios.find((x) => x.id === ctx.params.id);
  if (!s) return notFound("Patient case not found");
  if (!canSeeScenario(ctx, s.id)) return forbidden();
  return { scenario: s };
});

async function addSkillTasks(ctx: Ctx, scenarioId: string, skills: unknown): Promise<number> {
  if (!Array.isArray(skills) || skills.length === 0) return 0;
  const [{ getSkills, skillVariants, stepSource, stepsForSections }, { skillTaskFields }] = await Promise.all([
    import("@/app/lib/taylor-skills"),
    import("@/app/lib/skill-tasks"),
  ]);
  const picks = skills
    .map((s) => (typeof s === "string" ? { skillId: s } : (s as { skillId?: string; sections?: string[] })))
    .filter((s): s is { skillId: string; sections?: string[] } => typeof s?.skillId === "string");
  const existing = new Set(ctx.db.tasks.filter((t) => t.scenario_id === scenarioId).map((t) => t.skill_id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the catalog falls back to its bundled JSON on a failing client
  const details = await getSkills(failingClient as any, picks.map((p) => p.skillId));
  let order = ctx.db.tasks.filter((t) => t.scenario_id === scenarioId).length;
  let added = 0;
  for (const skill of details) {
    if (existing.has(skill.id)) continue;
    const pick = picks.find((p) => p.skillId === skill.id);
    const fields = skillTaskFields(skill);
    const taskId = newId();
    ctx.db.tasks.push({ id: taskId, scenario_id: scenarioId, ...fields, sort_order: order++, skill_id: skill.id });
    const chosen = pick?.sections ?? skillVariants(skill.id, skill.steps).defaults;
    stepsForSections(skill.steps, chosen).forEach((st, i) => {
      ctx.db.steps.push({ id: newId(), task_id: taskId, title: st.text, source: stepSource(skill.id, st), position: i + 1 });
    });
    added += 1;
  }
  return added;
}

/** Every query fails, so the skills catalog code reads its bundled JSON. */
const failingClient: unknown = new Proxy(() => undefined, {
  get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: "demo" } }) : failingClient),
  apply: () => failingClient,
});

route("POST", "/api/faculty/scenarios", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return json({ error: "Title is required" }, 400);
  const now = new Date().toISOString();
  const scenario: DemoScenario = {
    id: newId(),
    created_by: viewer.id,
    title,
    description: typeof body?.description === "string" ? body.description : "",
    category: typeof body?.category === "string" && body.category ? body.category : "General",
    learning_objectives: Array.isArray(body?.learning_objectives) ? body.learning_objectives : [],
    is_ai_generated: Boolean(body?.is_ai_generated),
    created_at: now,
    updated_at: now,
    patient_id: typeof body?.patient_id === "string" && body.patient_id ? body.patient_id : null,
    patient_case: body?.patient_case && typeof body.patient_case === "object" ? body.patient_case : {},
    rubric: body?.rubric ?? null,
    difficulty: "beginner",
  };
  db.scenarios.push(scenario);
  await addSkillTasks(ctx, scenario.id, body?.skills);
  audit(db, viewer, "scenario.create", "scenarios", { message: `Created patient case “${title}”` }, scenario.id);
  return json({ scenario: scenarioOut(ctx, scenario) }, 201);
});

route("PATCH", "/api/faculty/scenarios/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, params, viewer } = ctx;
  const scenario = db.scenarios.find((s) => s.id === params.id);
  if (!scenario) return notFound("Patient case not found");
  if (!canSeeScenario(ctx, scenario.id)) return forbidden();
  for (const key of ["title", "description", "category", "learning_objectives", "patient_id", "patient_case", "rubric", "is_ai_generated"] as const) {
    if (body && key in body) (scenario as unknown as Record<string, unknown>)[key] = body[key];
  }
  scenario.updated_at = new Date().toISOString();
  audit(db, viewer, "scenario.update", "scenarios", { message: `Edited patient case “${scenario.title}”` }, scenario.id);
  return { scenario: scenarioOut(ctx, scenario) };
});

route("DELETE", "/api/faculty/scenarios/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, params, viewer } = ctx;
  const scenario = db.scenarios.find((s) => s.id === params.id);
  if (!scenario) return notFound("Patient case not found");
  const taskIds = new Set(db.tasks.filter((t) => t.scenario_id === scenario.id).map((t) => t.id));
  const assignmentIds = new Set(db.assignments.filter((a) => a.scenario_id === scenario.id).map((a) => a.id));
  db.scenarios = db.scenarios.filter((s) => s.id !== scenario.id);
  db.tasks = db.tasks.filter((t) => !taskIds.has(t.id));
  db.steps = db.steps.filter((s) => !taskIds.has(s.task_id));
  db.assignments = db.assignments.filter((a) => !assignmentIds.has(a.id));
  db.completions = db.completions.filter((c) => !assignmentIds.has(c.assignment_id));
  db.stepRatings = db.stepRatings.filter((r) => !assignmentIds.has(r.assignment_id));
  audit(db, viewer, "scenario.delete", "scenarios", { message: `Deleted patient case “${scenario.title}”` }, scenario.id);
  return { success: true };
});

route("POST", "/api/faculty/scenarios/:id/assign", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, params, viewer } = ctx;
  const scenario = db.scenarios.find((s) => s.id === params.id);
  if (!scenario) return notFound("Patient case not found");
  const ids: string[] = Array.isArray(body?.student_ids) ? body.student_ids : [];
  const mine = myStudentIds(ctx);
  if (ids.length === 0) return json({ error: "Choose at least one student" }, 400);
  if (ids.some((id) => !mine.has(id))) return forbidden();
  const created = ids
    .filter((id) => !db.assignments.some((a) => a.student_id === id && a.scenario_id === scenario.id))
    .map((id) => newAssignment(scenario, id, body?.deadline ?? new Date(Date.now() + 7 * DAY_MS).toISOString(), body?.required !== false, viewer.id, userById(db, id)?.team_id ?? null));
  db.assignments.unshift(...created);
  audit(db, viewer, "scenario.assign", "scenarios", { message: `Assigned “${scenario.title}” to ${created.length} student(s)` }, scenario.id);
  return { assignments: created.map((a) => assignmentRow(db, a)) };
});

route("GET", "/api/faculty/scenarios/:id/skills", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, params } = ctx;
  return {
    tasks: db.tasks
      .filter((t) => t.scenario_id === params.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) => ({
        id: t.id,
        title: t.title,
        skill_id: t.skill_id,
        graded: new Set(db.completions.filter((c) => c.task_id === t.id).map((c) => c.assignment_id)).size,
      })),
  };
});

route("POST", "/api/faculty/scenarios/:id/skills", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  if (!ctx.db.scenarios.some((s) => s.id === ctx.params.id)) return notFound("Patient case not found");
  return { added: await addSkillTasks(ctx, ctx.params.id, ctx.body?.skills) };
});

route("DELETE", "/api/faculty/scenarios/:id/skills", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, query } = ctx;
  const taskId = query.get("task_id");
  if (!db.tasks.some((t) => t.id === taskId && t.scenario_id === ctx.params.id)) return notFound("Task not found");
  db.tasks = db.tasks.filter((t) => t.id !== taskId);
  db.steps = db.steps.filter((s) => s.task_id !== taskId);
  db.completions = db.completions.filter((c) => c.task_id !== taskId);
  return { success: true };
});

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

route("GET", "/api/faculty/scenarios/assignments", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, query } = ctx;
  const mine = myStudentIds(ctx);
  const studentId = query.get("student_id");
  if (studentId && !mine.has(studentId)) return forbidden();
  const scenarioId = query.get("scenario_id");
  return {
    assignments: db.assignments
      .filter((a) => (studentId ? a.student_id === studentId : mine.has(a.student_id)))
      .filter((a) => !scenarioId || a.scenario_id === scenarioId)
      .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))
      .map((a) => assignmentRow(db, a)),
  };
});

function loadAssignment(ctx: Ctx, id: string) {
  const a = ctx.db.assignments.find((x) => x.id === id);
  if (!a) return { error: notFound("Assignment not found") };
  if (ctx.role !== "admin" && !myStudentIds(ctx).has(a.student_id)) return { error: forbidden() };
  return { assignment: a };
}

route("GET", "/api/faculty/scenarios/assignments/:id/tasks", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const loaded = loadAssignment(ctx, ctx.params.id);
  if (loaded.error) return loaded.error;
  const { db } = ctx;
  const a = loaded.assignment;
  const ratingByStep = new Map(db.stepRatings.filter((r) => r.assignment_id === a.id).map((r) => [r.step_id, r.rating]));
  return {
    tasks: db.tasks
      .filter((t) => t.scenario_id === a.scenario_id)
      .sort((x, y) => x.sort_order - y.sort_order)
      .map((t) => {
        const completion = db.completions.find((c) => c.assignment_id === a.id && c.task_id === t.id);
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          category: t.category,
          points: t.points,
          verification: t.verification,
          system_trigger: t.system_trigger,
          sort_order: t.sort_order,
          is_completed: Boolean(completion),
          completed_via: completion?.completed_via ?? null,
          completed_at: completion?.completed_at ?? null,
          rating: completion?.rating ?? null,
          remarks: completion?.remarks ?? null,
          steps: db.steps
            .filter((s) => s.task_id === t.id)
            .sort((x, y) => x.position - y.position)
            .map((s) => ({ id: s.id, title: s.title, source: s.source, rating: ratingByStep.get(s.id) ?? null })),
        };
      }),
    status: a.status,
    ratings_enabled: true,
    steps_enabled: true,
    rubric: resolveRubric(db.scenarios.find((s) => s.id === a.scenario_id)?.rubric),
  };
});

/** An accepted grade-edit request the instructor hasn't used yet. */
function activeApproval(ctx: Ctx, assignmentId: string) {
  const latest = latestEditRequest(ctx, assignmentId);
  return latest && latest.status === "accepted" && !latest.used_at ? latest : null;
}

function latestEditRequest(ctx: Ctx, assignmentId: string): Record<string, unknown> | null {
  const rows = ctx.db.notifications
    .filter((n) => n.data?.kind === "grade_edit_request" && n.data.assignment_id === assignmentId && n.data.faculty_id === ctx.viewer.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (rows[0]?.data as Record<string, unknown>) ?? null;
}

const EDIT_NEEDS_APPROVAL = "This grade is saved. Ask your dean for permission before changing it.";

route("PUT", "/api/faculty/scenarios/assignments/:id/tasks", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const loaded = loadAssignment(ctx, ctx.params.id);
  if (loaded.error) return loaded.error;
  const { db, body, viewer } = ctx;
  const a = loaded.assignment;
  if (a.status === "completed" && ctx.role === "faculty" && !activeApproval(ctx, a.id)) {
    return json({ error: EDIT_NEEDS_APPROVAL }, 403);
  }
  const task = db.tasks.find((t) => t.id === body?.task_id && t.scenario_id === a.scenario_id);
  if (!task) return notFound("Task not found for this patient case");
  const taskSteps = db.steps.filter((s) => s.task_id === task.id);
  const now = new Date().toISOString();
  let completion = db.completions.find((c) => c.assignment_id === a.id && c.task_id === task.id);
  let level: TaskRating | null = null;

  if (Array.isArray(body?.steps)) {
    if (taskSteps.length === 0) return json({ error: "This task has no sub-tasks" }, 409);
    const known = new Set(taskSteps.map((s) => s.id));
    // A task graded whole shows that level on every sub-task until one is rated.
    const current = db.stepRatings.filter((r) => r.assignment_id === a.id && known.has(r.step_id));
    if (current.length === 0 && completion?.rating) {
      for (const st of taskSteps) db.stepRatings.push({ assignment_id: a.id, step_id: st.id, rating: completion.rating });
    }
    for (const change of body.steps as { step_id: string; rating: TaskRating | null }[]) {
      if (!known.has(change.step_id)) return notFound("Sub-task not found for this task");
      db.stepRatings = db.stepRatings.filter((r) => !(r.assignment_id === a.id && r.step_id === change.step_id));
      if (change.rating && isTaskRating(change.rating)) db.stepRatings.push({ assignment_id: a.id, step_id: change.step_id, rating: change.rating });
    }
    const rated = db.stepRatings.filter((r) => r.assignment_id === a.id && known.has(r.step_id));
    if (rated.length === 0) {
      db.completions = db.completions.filter((c) => c !== completion);
    } else {
      level = levelForCredit(taskCredit(db, a.id, task.id).credit);
      if (!completion) {
        completion = { assignment_id: a.id, task_id: task.id, rating: level, remarks: null, completed_via: "faculty", completed_at: now };
        db.completions.push(completion);
      } else completion.rating = level;
    }
  } else {
    if (body?.rating !== undefined && body.rating !== null && !isTaskRating(body.rating)) {
      return json({ error: "rating must be a rating level or null" }, 400);
    }
    if (body?.rating !== undefined && taskSteps.length > 0) {
      return json({ error: "This task is graded by its sub-tasks — rate those instead" }, 409);
    }
    const remarks = typeof body?.remarks === "string" ? body.remarks.trim().slice(0, 1000) || null : body?.remarks;
    if (body?.rating === undefined) {
      if (!completion) return json({ error: "Rate this criterion before adding a note" }, 409);
      if (remarks !== undefined) completion.remarks = remarks;
      level = completion.rating;
    } else if (body.rating === null) {
      db.completions = db.completions.filter((c) => c !== completion);
    } else {
      if (!completion) {
        completion = { assignment_id: a.id, task_id: task.id, rating: body.rating, remarks: remarks ?? null, completed_via: "faculty", completed_at: now };
        db.completions.push(completion);
      } else {
        completion.rating = body.rating;
        if (remarks !== undefined) completion.remarks = remarks;
      }
      level = body.rating;
    }
  }

  let score: number | undefined;
  if (a.status === "completed") {
    score = scoreAssignment(db, a).score;
    a.score = score;
  }
  void viewer;
  return { ok: true, score, rating: level };
});

route("POST", "/api/faculty/scenarios/assignments/:id/finalize", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const loaded = loadAssignment(ctx, ctx.params.id);
  if (loaded.error) return loaded.error;
  const { db, viewer } = ctx;
  const a = loaded.assignment;
  const approval = a.status === "completed" && ctx.role === "faculty" ? activeApproval(ctx, a.id) : null;
  if (a.status === "completed" && ctx.role === "faculty" && !approval) return json({ error: EDIT_NEEDS_APPROVAL }, 403);
  const { score, remaining } = scoreAssignment(db, a);
  if (remaining > 0 && a.status !== "completed") {
    a.status = "in_progress";
    return { assignment: assignmentRow(db, a), score, completed: false, remaining };
  }
  const now = new Date().toISOString();
  if (a.status !== "completed") {
    a.completed_at = now;
    if (a.started_at) a.time_taken = Math.round((Date.parse(now) - Date.parse(a.started_at)) / 1000);
  }
  a.status = "completed";
  a.score = score;
  a.finalized_by = viewer.id;
  if (approval) {
    for (const n of db.notifications) {
      if (n.data?.kind === "grade_edit_request" && n.data.request_id === approval.request_id) n.data = { ...n.data, used_at: now };
    }
  }
  const student = userById(db, a.student_id);
  const title = db.scenarios.find((s) => s.id === a.scenario_id)?.title ?? "a patient case";
  audit(db, viewer, "scenario_assignment.finalize", "scenario_assignments", { message: `Graded ${student?.name} on “${title}”`, score }, a.id);
  return { assignment: assignmentRow(db, a), score, completed: true, remaining: 0 };
});

function editState(data: Record<string, unknown> | null) {
  if (!data) return { status: "none" };
  if (data.status === "accepted" && data.used_at) return { status: "none" };
  return {
    status: data.status,
    reason: data.reason,
    requested_at: data.requested_at,
    resolved_by_name: data.resolved_by_name ?? null,
    resolved_at: data.resolved_at ?? null,
  };
}

route("GET", "/api/faculty/scenarios/assignments/:id/edit-request", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  if (ctx.role !== "faculty") return { status: "not_required" };
  const loaded = loadAssignment(ctx, ctx.params.id);
  if (loaded.error) return loaded.error;
  return editState(latestEditRequest(ctx, ctx.params.id));
});

route("POST", "/api/faculty/scenarios/assignments/:id/edit-request", (ctx) => {
  if (ctx.role !== "faculty") return json({ error: "Only instructors need permission to change a grade" }, 400);
  const loaded = loadAssignment(ctx, ctx.params.id);
  if (loaded.error) return loaded.error;
  const { db, body, viewer } = ctx;
  const a = loaded.assignment;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) return json({ error: "Give a reason for changing the grade" }, 400);
  if (reason.length > 500) return json({ error: "Keep the reason under 500 characters" }, 400);
  if (a.status !== "completed") return json({ error: "This grade is not saved yet, so it can be changed freely" }, 409);
  const state = editState(latestEditRequest(ctx, a.id));
  if (state.status === "pending") return json({ error: "You already asked; wait for your dean to answer" }, 409);
  if (state.status === "accepted") return json({ error: "You already have permission to change this grade" }, 409);
  const student = userById(db, a.student_id);
  const title = db.scenarios.find((s) => s.id === a.scenario_id)?.title ?? "a patient case";
  const data = {
    kind: "grade_edit_request",
    request_id: newId(),
    status: "pending",
    assignment_id: a.id,
    faculty_id: viewer.id,
    faculty_name: viewer.name,
    student_name: student?.name ?? "a student",
    scenario_title: title,
    reason,
    requested_at: new Date().toISOString(),
  };
  const approver = userById(db, viewer.admin_id);
  db.notifications.push({
    id: newId(),
    user_id: approver?.id ?? "",
    type: "system",
    title: "Grade change request",
    body: `${viewer.name} wants to change ${data.student_name}'s grade on "${title}". Reason: ${reason}`,
    data,
    read_at: null,
    created_at: data.requested_at,
  });
  audit(db, viewer, "grade_edit.request", "scenario_assignments", { request_id: data.request_id, reason }, a.id);
  return json(editState(data), 201);
});
