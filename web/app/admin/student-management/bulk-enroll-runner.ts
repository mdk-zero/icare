"use client";

import {
  apiFetch,
  autoSplitTeams,
  createTeam,
  fetchFacultyTeams,
  moveStudentToTeam,
} from "../../lib/api";
import { startTask } from "../../lib/background-tasks";

/** Mirrors MAX_TEAMS_PER_SECTION on the server. */
const MAX_GROUPS = 20;

export interface EnrollStudent {
  fname: string;
  lname: string;
  email: string;
  sex: "" | "male" | "female";
  /** Group name within the section; blank means "not in a group yet". */
  group: string;
}

export interface BulkEnrollJob {
  sectionId: string;
  sectionName: string;
  /** The section's groups when the job started, matched by name. */
  groups: { id: string; name: string }[];
  students: EnrollStudent[];
  /** Group the students the list leaves without one. */
  autoGroup: boolean;
  /** Students per group when the section has no groups to fill. */
  groupSize: number;
  /** Called when the job is over, to reload the roster and the groups. */
  onDone: () => void;
}

async function enrollOne(sectionId: string, s: EnrollStudent) {
  const res = await apiFetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: `${s.fname.trim()} ${s.lname.trim()}`,
      email: s.email.trim(),
      role: "student",
      section_id: sectionId,
      sex: s.sex,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    user?: { id: string };
    password?: string;
    warning?: string;
    error?: string;
  };
  if (!res.ok || !json.user) return { ok: false as const, error: json.error ?? "Failed to enroll" };
  return { ok: true as const, userId: json.user.id, password: json.password, warning: json.warning };
}

/**
 * Enrolls a batch in the background. The dialog that starts it closes at
 * once; progress shows in the background-tasks tray, and the job carries on
 * while the admin moves around the app.
 */
export function runBulkEnroll(job: BulkEnrollJob) {
  const { sectionId, sectionName, students } = job;
  const task = startTask(
    `Enrolling ${students.length} student${students.length === 1 ? "" : "s"} into ${sectionName}`,
    students.map((s) => ({ id: s.email.trim().toLowerCase(), label: `${s.fname} ${s.lname}`.trim() })),
  );

  void (async () => {
    // Groups named in the list but not yet in the section are made first.
    const groupIds = new Map(job.groups.map((g) => [g.name.trim().toLowerCase(), g.id]));
    const missing = [...new Set(students.map((s) => s.group.trim()).filter(Boolean))].filter(
      (name) => !groupIds.has(name.toLowerCase()),
    );
    if (missing.length > 0) {
      task.phase("Creating groups…");
      for (const name of missing) await createTeam(sectionId, name);
      const fresh = await fetchFacultyTeams();
      for (const t of fresh?.teams ?? []) {
        if (t.section_id === sectionId) groupIds.set(t.name.trim().toLowerCase(), t.id);
      }
      task.phase(undefined);
    }

    let enrolled = 0;
    const leftOver: string[] = [];
    for (const s of students) {
      const itemId = s.email.trim().toLowerCase();
      task.item(itemId, { status: "working" });
      const outcome = await enrollOne(sectionId, s);
      if (!outcome.ok) {
        task.item(itemId, { status: "failed", message: outcome.error });
        continue;
      }
      enrolled++;
      const notes: string[] = [];
      if (outcome.warning) notes.push("The invitation email didn't go out; hand them this password.");
      const groupName = s.group.trim();
      if (groupName) {
        const teamId = groupIds.get(groupName.toLowerCase());
        const moved = teamId ? await moveStudentToTeam(outcome.userId, teamId) : { error: "the group couldn't be made" };
        if ("error" in moved) notes.push(`Not added to ${groupName}: ${moved.error}`);
      } else {
        leftOver.push(outcome.userId);
      }
      task.item(itemId, {
        status: notes.length > 0 ? "warning" : "done",
        message: notes.join(" ") || undefined,
        secret: outcome.warning ? outcome.password : undefined,
      });
    }

    let groupNote = "";
    if (job.autoGroup && leftOver.length > 0) {
      task.phase("Putting students into groups…");
      groupNote = await groupLeftOver(job, leftOver);
    }

    const failed = students.length - enrolled;
    task.finish(
      enrolled === 0
        ? `No one was enrolled into ${sectionName}`
        : failed > 0
          ? `Enrolled ${enrolled} of ${students.length} into ${sectionName}`
          : `Enrolled ${enrolled} into ${sectionName}${groupNote}`,
    );
    job.onDone();
  })();
}

/** Puts newly enrolled students who have no group into one; returns a short note. */
async function groupLeftOver(job: BulkEnrollJob, studentIds: string[]): Promise<string> {
  const fresh = await fetchFacultyTeams();
  const sectionGroups = (fresh?.teams ?? []).filter((t) => t.section_id === job.sectionId);

  if (sectionGroups.length === 0) {
    // No groups yet: split the whole section, newcomers included.
    const total = (fresh?.students ?? []).filter((st) => st.section_id === job.sectionId).length;
    const count = Math.min(MAX_GROUPS, Math.max(1, Math.ceil(total / Math.max(1, job.groupSize))));
    const result = await autoSplitTeams(job.sectionId, count);
    return "error" in result ? "" : `, in ${count} group${count === 1 ? "" : "s"}`;
  }

  // Groups exist: each newcomer joins whichever is smallest right now.
  const sizes = new Map(sectionGroups.map((g) => [g.id, g.members.length]));
  for (const id of studentIds) {
    const [teamId] = [...sizes.entries()].sort((a, b) => a[1] - b[1])[0];
    const moved = await moveStudentToTeam(id, teamId);
    if (!("error" in moved)) sizes.set(teamId, (sizes.get(teamId) ?? 0) + 1);
  }
  return "";
}
