import {
  ADMIN_ID,
  DEAN_ID,
  INSTRUCTOR_2_ID,
  INSTRUCTOR_3_ID,
  INSTRUCTOR_ID,
  KIND,
  ago,
  demoId,
} from "./people";

/** An audit_logs row. */
export interface DemoAudit {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

type Entry = [actor: string, role: string, action: string, entity: string, details: Record<string, unknown>, daysAgo: number];

const ENTRIES: Entry[] = [
  [INSTRUCTOR_ID, "faculty", "scenario.assign", "scenarios", { message: "Assigned “Asthma: Pulse Oximetry, Respirations and Nasal Cannula Oxygen” to BSN 3101 · Group A" }, 3],
  [INSTRUCTOR_ID, "faculty", "scenario_assignment.finalize", "scenario_assignments", { message: "Graded Angela Bautista on “Post-Op Day One: Incentive Spirometry and the IV Site”", score: 86 }, 4.1],
  [INSTRUCTOR_ID, "faculty", "scenario_assignment.finalize", "scenario_assignments", { message: "Graded Mark Anthony Cruz on “Post-Op Day One: Incentive Spirometry and the IV Site”", score: 52 }, 4.2],
  [INSTRUCTOR_ID, "faculty", "case_presentation.create", "case_presentations", { message: "Assigned “Case Presentation 2: Fluid balance” to BSN 3101 and BSN 3102" }, 6],
  [INSTRUCTOR_ID, "faculty", "team.move_member", "teams", { message: "Moved Rafael Tan from Group A to Group B", reason: "Balancing group sizes after the schedule change" }, 9],
  [INSTRUCTOR_ID, "faculty", "assessment.assign", "assessments", { message: "Assigned “A Full Set of Vital Signs” to BSN 3102 · Group A" }, 11],
  [INSTRUCTOR_ID, "faculty", "attendance.excuse", "activity_excuses", { message: "Excused an absence from a RetDem", reason: "Medical certificate submitted." }, 12],
  [INSTRUCTOR_ID, "faculty", "library.create", "library", { message: "Added “Vital signs pocket guide” to Vital Signs" }, 15],
  [INSTRUCTOR_2_ID, "faculty", "scenario.assign", "scenarios", { message: "Assigned “Cellulitis: IV Antibiotic Through a Saline Lock” to BSN 3102 · Group B" }, 3.2],
  [INSTRUCTOR_2_ID, "faculty", "scenario_assignment.finalize", "scenario_assignments", { message: "Graded Jasmine Castro on “Dehydration: Starting and Monitoring a Peripheral IV”", score: 88 }, 4.4],
  [INSTRUCTOR_3_ID, "faculty", "library.create", "library", { message: "Added “Oxygen delivery devices” to Oxygenation" }, 8],
  [DEAN_ID, "admin", "team.assign_faculty", "teams", { message: "Gave BSN 3102 · Group A to Maria Santos" }, 20],
  [DEAN_ID, "admin", "user.create", "users", { message: "Created instructor account for Liza Fernandez" }, 40],
  [DEAN_ID, "admin", "grade_edit.accepted", "scenario_assignments", { message: "Approved Jose Reyes changing a saved grade" }, 7],
  [DEAN_ID, "admin", "room.update", "rooms", { message: "Closed Simulation Ward B for equipment upgrades" }, 13],
  [DEAN_ID, "admin", "ml.run", "ml", { message: "Ran the nightly risk check by hand" }, 1],
  [ADMIN_ID, "super_admin", "user.create", "users", { message: "Created dean account for Ramon Castillo" }, 120],
  [ADMIN_ID, "super_admin", "access_request.accepted", "users", { message: "Accepted a sign-up request from Liza Fernandez" }, 41],
  [ADMIN_ID, "super_admin", "test_run.start", "system_tests", { message: "Ran the Playwright suite" }, 2],
  [ADMIN_ID, "super_admin", "user.update", "users", { message: "Reset the password for Jose Reyes" }, 16],
];

export function seedAudit(): DemoAudit[] {
  return ENTRIES.map(([actor, role, action, entity, details, days], i) => ({
    id: demoId(KIND.audit, i + 1),
    actor_id: actor,
    actor_role: role,
    action,
    entity_type: entity,
    entity_id: null,
    details,
    ip_address: "203.177.42.18",
    created_at: ago(days),
  })).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
