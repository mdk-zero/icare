import type { DemoDb } from "../store";
import type { DemoUser } from "../fixtures/people";
import type { DemoAssignment } from "../fixtures/school";
import type { TaskRating } from "@/app/lib/task-ratings";
import { sectionName, teamLabel } from "./scope";

/**
 * Read-side helpers shared by the demo's handlers: the joins and roll-ups
 * the real routes do in SQL, done over the in-browser tables.
 */

export const DAY_MS = 86_400_000;

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/** When the nightly risk check last ran: 03:00 today. */
export function scoredAt(): string {
  const d = new Date();
  d.setHours(3, 0, 0, 0);
  return d.toISOString();
}

// --- Scoring -------------------------------------------------------------------

const CREDIT: Record<TaskRating, number> = { excellent: 1, satisfactory: 2 / 3, needs_practice: 1 / 3 };

export function levelForCredit(credit: number): TaskRating {
  const score = Math.round(credit * 100);
  if (score >= 90) return "excellent";
  if (score >= 60) return "satisfactory";
  return "needs_practice";
}

/** A task's credit: its rated sub-tasks' share, or its whole-task rating. */
export function taskCredit(db: DemoDb, assignmentId: string, taskId: string): { credit: number; rated: number; total: number } {
  const steps = db.steps.filter((s) => s.task_id === taskId);
  const completion = db.completions.find((c) => c.assignment_id === assignmentId && c.task_id === taskId);
  if (steps.length > 0) {
    const ids = new Set(steps.map((s) => s.id));
    const ratings = db.stepRatings.filter((r) => r.assignment_id === assignmentId && ids.has(r.step_id));
    if (ratings.length > 0) {
      const earned = ratings.reduce((sum, r) => sum + CREDIT[r.rating], 0);
      return { credit: Math.min(1, earned / steps.length), rated: ratings.length, total: steps.length };
    }
    if (completion) return { credit: completion.rating ? CREDIT[completion.rating] : 1, rated: steps.length, total: steps.length };
    return { credit: 0, rated: 0, total: steps.length };
  }
  if (!completion) return { credit: 0, rated: 0, total: 1 };
  return { credit: completion.rating ? CREDIT[completion.rating] : 1, rated: 1, total: 1 };
}

export function scoreAssignment(db: DemoDb, a: DemoAssignment): { score: number; remaining: number } {
  let earned = 0;
  let total = 0;
  let remaining = 0;
  for (const task of db.tasks.filter((t) => t.scenario_id === a.scenario_id)) {
    const c = taskCredit(db, a.id, task.id);
    earned += task.points * c.credit;
    total += task.points;
    remaining += c.total - c.rated;
  }
  return { score: total > 0 ? Math.round((earned / total) * 100) : 0, remaining };
}

/** How many of the case's tasks the student performed (has any grade on). */
export function performedTasks(db: DemoDb, a: DemoAssignment): number {
  return db.tasks
    .filter((t) => t.scenario_id === a.scenario_id)
    .filter((t) => db.completions.some((c) => c.assignment_id === a.id && c.task_id === t.id)).length;
}

// --- Rows as the routes return them -----------------------------------------------

/** A scenario_assignments row as GET /api/faculty/scenarios/assignments formats it. */
export function assignmentRow(db: DemoDb, a: DemoAssignment) {
  const student = db.users.find((u) => u.id === a.student_id);
  const team = db.teams.find((t) => t.id === student?.team_id);
  return {
    id: a.id,
    scenario_id: a.scenario_id,
    scenario_title: db.scenarios.find((s) => s.id === a.scenario_id)?.title ?? "Unknown Patient Case",
    student_id: a.student_id,
    student_name: student?.name ?? "Unknown Student",
    student_picture_url: student?.picture_url ?? null,
    student_sex: student?.sex ?? null,
    team_id: team?.id ?? null,
    team_name: team?.name ?? null,
    team_label: team ? teamLabel(db, team.id) : null,
    assigned_team_id: a.team_id,
    assigned_at: a.assigned_at,
    deadline: a.deadline,
    status: a.status,
    required: a.required,
    score: a.score,
    completed_at: a.completed_at,
    time_taken: a.time_taken,
    submitted_at: a.submitted_at,
    finalized_by: a.finalized_by,
    total_tasks: db.tasks.filter((t) => t.scenario_id === a.scenario_id).length,
    completed_tasks: performedTasks(db, a),
  };
}

/** Students row as GET /api/faculty/students returns it. */
export function studentRow(db: DemoDb, s: DemoUser) {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    role: s.role,
    picture_url: s.picture_url,
    sex: s.sex,
    section_id: s.section_id,
    section: sectionName(db, s.section_id),
    risk_level: hasWork(db, s.id) ? s.risk_level : null,
    last_activity: lastActivity(db, s.id),
  };
}

// --- Per-student roll-ups ------------------------------------------------------

export function hasWork(db: DemoDb, studentId: string): boolean {
  return (
    db.assignments.some((a) => a.student_id === studentId) ||
    db.quizAssignments.some((a) => a.student_id === studentId) ||
    db.attempts.some((a) => a.student_id === studentId)
  );
}

export function lastActivity(db: DemoDb, studentId: string): string | null {
  let last = db.users.find((u) => u.id === studentId)?.last_activity ?? null;
  const keep = (at: string | null) => {
    if (at && (!last || at > last)) last = at;
  };
  for (const a of db.attempts) if (a.student_id === studentId) keep(a.submitted_at ?? a.started_at);
  for (const a of db.assignments) if (a.student_id === studentId) keep(a.submitted_at);
  return last;
}

export function submittedAttempts(db: DemoDb, studentId: string) {
  return db.attempts
    .filter((a) => a.student_id === studentId && a.status === "submitted")
    .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
}

export function quizAverage(db: DemoDb, studentId: string): number | null {
  return mean(submittedAttempts(db, studentId).map((a) => a.score ?? 0));
}

export function caseAverage(db: DemoDb, studentId: string): number | null {
  return mean(
    db.assignments.filter((a) => a.student_id === studentId && a.status === "completed").map((a) => a.score ?? 0),
  );
}

/** The latest risk prediction, as performance_predictions holds it. */
export function prediction(db: DemoDb, s: DemoUser) {
  if (!s.risk_level || !hasWork(db, s.id)) return null;
  const quiz = quizAverage(db, s.id) ?? 0;
  const cases = caseAverage(db, s.id) ?? 0;
  const overdue = db.assignments.filter((a) => a.student_id === s.id && a.status === "overdue").length;
  const entries = db.shiftEntries.filter((e) => e.student_id === s.id && e.attendance_status !== "scheduled");
  const attended = entries.filter((e) => ["present", "late", "excused"].includes(e.attendance_status)).length;
  const attendance = entries.length ? Math.round((attended / entries.length) * 100) : 100;
  const daysInactive = Math.round((Date.now() - Date.parse(lastActivity(db, s.id) ?? new Date().toISOString())) / DAY_MS);
  const features = {
    avg_quiz_score: quiz,
    avg_scenario_score: cases,
    overdue_assignments: overdue,
    attendance_rate: attendance,
    days_since_active: daysInactive,
  };
  const cohort = { avg_quiz_score: 80, avg_scenario_score: 72, overdue_assignments: 0.2, attendance_rate: 92, days_since_active: 1 };
  const explanations = (Object.keys(features) as (keyof typeof features)[])
    .map((feature) => {
      const value = features[feature];
      const worse =
        feature === "overdue_assignments" || feature === "days_since_active"
          ? value > cohort[feature]
          : value < cohort[feature];
      return {
        feature,
        value,
        cohort_mean: cohort[feature],
        direction: worse ? ("increases_risk" as const) : ("decreases_risk" as const),
        weight: Math.round(Math.abs(value - cohort[feature]) * 10) / 10,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  return {
    id: `pred-${s.id}`,
    student_id: s.id,
    risk: s.risk_level,
    probability: s.risk_probability,
    features,
    explanations,
    predicted_at: scoredAt(),
    ml_models: { kind: "random_forest", version: "2026.09.1", is_baseline: false },
  };
}
