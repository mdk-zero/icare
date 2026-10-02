import { ADMIN_ID, DEAN_ID, INSTRUCTOR_2_ID, INSTRUCTOR_ID, KIND, ago, demoId, type DemoUser } from "./people";
import type { DemoAssignment, DemoScenario } from "./school";

export interface DemoNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

let n = 0;
function note(
  userId: string,
  type: string,
  title: string,
  body: string,
  createdDaysAgo: number,
  read: boolean,
  data: Record<string, unknown> = {},
): DemoNotification {
  n += 1;
  const created_at = ago(createdDaysAgo);
  return { id: demoId(KIND.notification, n), user_id: userId, type, title, body, data, read_at: read ? created_at : null, created_at };
}

const WELCOME = "Everything here is sample data. Explore freely — it resets when you log out.";

/**
 * Each demo account's inbox. The Dean has a grade change waiting for an
 * answer; the Instructor has one already approved, so "Edit" on that saved
 * grade works straight away.
 */
export function seedNotifications(users: DemoUser[], assignments: DemoAssignment[], scenarios: DemoScenario[]): DemoNotification[] {
  n = 0;
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "a student";
  const title = (a: DemoAssignment) => scenarios.find((s) => s.id === a.scenario_id)?.title ?? "a patient case";
  const graded = assignments.filter((a) => a.status === "completed");
  const joses = graded.find((a) => a.assigned_by === INSTRUCTOR_2_ID);
  const marias = graded.find((a) => a.assigned_by === INSTRUCTOR_ID);
  const out: DemoNotification[] = [
    note(INSTRUCTOR_ID, "system", "Welcome to the iCARE++ demo", WELCOME, 0.01, false),
    note(DEAN_ID, "system", "Welcome to the iCARE++ demo", WELCOME, 0.01, false),
    note(ADMIN_ID, "system", "Welcome to the iCARE++ demo", WELCOME, 0.01, false),
  ];

  if (joses) {
    const reason = "I rated the IV site check before the student finished the step; the re-watch shows it was done correctly.";
    out.push(
      note(DEAN_ID, "system", "Grade change request", `Jose Reyes wants to change ${name(joses.student_id)}'s grade on "${title(joses)}". Reason: ${reason}`, 0.2, false, {
        kind: "grade_edit_request",
        request_id: demoId(KIND.misc, 500),
        status: "pending",
        assignment_id: joses.id,
        faculty_id: INSTRUCTOR_2_ID,
        faculty_name: "Jose Reyes",
        student_name: name(joses.student_id),
        scenario_title: title(joses),
        reason,
        requested_at: ago(0.2),
      }),
    );
  }

  if (marias) {
    const reason = "Two sub-tasks were rated against the wrong checklist step.";
    const data = {
      kind: "grade_edit_request",
      request_id: demoId(KIND.misc, 501),
      status: "accepted",
      assignment_id: marias.id,
      faculty_id: INSTRUCTOR_ID,
      faculty_name: "Maria Santos",
      student_name: name(marias.student_id),
      scenario_title: title(marias),
      reason,
      requested_at: ago(1.5),
      resolved_by: DEAN_ID,
      resolved_by_name: "Ramon Castillo",
      resolved_at: ago(1.2),
    };
    out.push(
      note(DEAN_ID, "system", "Grade change request", `Maria Santos wants to change ${data.student_name}'s grade on "${data.scenario_title}". Reason: ${reason}`, 1.5, true, data),
      note(INSTRUCTOR_ID, "system", "Grade change approved", `Ramon Castillo approved changing ${data.student_name}'s grade on "${data.scenario_title}". Open it in Review Submissions and click Edit.`, 1.2, false, {
        ...data,
        kind: "grade_edit_decision",
      }),
    );
  }

  out.push(
    note(DEAN_ID, "system", "Student moved between groups", "Maria Santos moved Rafael Tan from BSN 3101 · Group A to BSN 3101 · Group B. Reason: Balancing group sizes after the schedule change", 9, true, { kind: "group_move" }),
    note(INSTRUCTOR_ID, "at_risk_flag", "Low performance flagged", "The nightly risk check flagged Hannah Villareal as low performing.", 0.3, false),
    note(INSTRUCTOR_ID, "assignment_created", "Patient cases waiting for review", "13 patient cases from last week are handed in and waiting for your grade.", 0.5, true),
    note(ADMIN_ID, "system", "Test run finished", "The nightly Playwright suite passed: 142 of 142 tests.", 0.4, false),
  );
  return out;
}
