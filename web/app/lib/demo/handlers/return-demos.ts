"use client";

import { json, notFound, route, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoScenario } from "../fixtures/school";
import { audit } from "./shared";
import { addSkillTasks, caseGroupsOf, myStudentIds, newAssignment } from "./faculty";
import { parseDeadline } from "@/app/lib/deadline-input";
import { mergeAssignees, parseReturnDemoInput, RETURN_DEMO_CATEGORY, returnDemoVisibleTo, skillDiff } from "@/app/lib/return-demos";

/**
 * Return Demonstrations (072) on the demo store, in the shapes the real
 * /api/faculty/return-demos routes answer with: Taylor's skill checklists
 * with no patient, graded on the Patient Case review page.
 */

type Ctx = DemoContext;

const staffOnly = (ctx: Ctx) => ctx.role === "faculty" || ctx.role === "admin";
const forbidden = () => json({ error: "Forbidden" }, 403);
const NOT_FOUND = "Return Demonstration not found";

/** The real rule (returnDemoVisibleTo): its maker, admins, and instructors whose students hold it. */
const visible = (ctx: Ctx, demo: DemoScenario) =>
  returnDemoVisibleTo(
    demo,
    ctx.db.assignments.filter((a) => a.scenario_id === demo.id).map((a) => a.student_id),
    { uid: ctx.viewer.id, role: ctx.role },
    myStudentIds(ctx),
  );

function findDemo(ctx: Ctx, id: string): DemoScenario | null {
  const demo = ctx.db.scenarios.find((s) => s.id === id && s.kind === "return_demo");
  return demo && visible(ctx, demo) ? demo : null;
}

const canEdit = (ctx: Ctx, demo: DemoScenario) => ctx.role === "admin" || demo.created_by === ctx.viewer.id;

/** Tasks anyone has a grade on: a completion row is written when one is graded. */
const gradedTaskIds = (ctx: Ctx, taskIds: string[]) =>
  new Set(ctx.db.completions.filter((c) => taskIds.includes(c.task_id)).map((c) => c.task_id));

const tasksOf = (ctx: Ctx, demoId: string) =>
  ctx.db.tasks.filter((t) => t.scenario_id === demoId).sort((a, b) => a.sort_order - b.sort_order);

function summary(ctx: Ctx, demo: DemoScenario) {
  const mine = ctx.role === "admin" ? null : myStudentIds(ctx);
  const own = ctx.db.assignments.filter((a) => a.scenario_id === demo.id && (!mine || mine.has(a.student_id)));
  return {
    id: demo.id,
    title: demo.title,
    description: demo.description,
    created_by: demo.created_by,
    offering_id: demo.offering_id ?? null,
    created_at: demo.created_at,
    skills: tasksOf(ctx, demo.id).map((t) => ({ id: t.skill_id ?? "", title: t.title })),
    student_count: new Set(own.map((a) => a.student_id)).size,
    graded_count: new Set(own.filter((a) => a.status === "completed").map((a) => a.student_id)).size,
    assigned_groups: caseGroupsOf(ctx, own),
    can_edit: canEdit(ctx, demo),
  };
}

/** The real activityCourse rule: an instructor's must be a course they teach. */
function courseError(ctx: Ctx, offeringId: string | null | undefined): string | null {
  if (ctx.role !== "faculty") return null;
  if (!offeringId) return "Choose the course this is for.";
  return ctx.db.offerings.some((o) => o.id === offeringId && o.faculty_id === ctx.viewer.id)
    ? null
    : "You can only make this for a course you teach.";
}

route("GET", "/api/faculty/return-demos", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return {
    enabled: true,
    return_demos: ctx.db.scenarios
      .filter((s) => s.kind === "return_demo" && visible(ctx, s))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => summary(ctx, s)),
  };
});

route("POST", "/api/faculty/return-demos", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const parsed = parseReturnDemoInput(ctx.body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;
  const courseProblem = courseError(ctx, input.offering_id);
  if (courseProblem) return json({ error: courseProblem }, 400);

  const now = new Date().toISOString();
  const demo: DemoScenario = {
    id: newId(),
    created_by: ctx.viewer.id,
    title: input.title ?? "",
    description: input.description ?? "",
    category: RETURN_DEMO_CATEGORY,
    learning_objectives: [],
    is_ai_generated: false,
    created_at: now,
    updated_at: now,
    patient_id: null,
    patient_case: {},
    rubric: null,
    difficulty: "intermediate",
    offering_id: input.offering_id ?? null,
    kind: "return_demo",
  };
  ctx.db.scenarios.push(demo);
  const added = await addSkillTasks(ctx, demo.id, input.skills ?? []);
  if (added === 0) {
    ctx.db.scenarios = ctx.db.scenarios.filter((s) => s.id !== demo.id);
    return json({ error: "None of those skills are in the catalog" }, 400);
  }
  audit(ctx.db, ctx.viewer, "return_demo.create", "scenarios", { message: `Created Return Demonstration “${demo.title}”` }, demo.id);
  return json({ return_demo: { id: demo.id } }, 201);
});

route("GET", "/api/faculty/return-demos/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const demo = findDemo(ctx, ctx.params.id);
  if (!demo) return notFound(NOT_FOUND);
  const tasks = tasksOf(ctx, demo.id);
  const graded = gradedTaskIds(ctx, tasks.map((t) => t.id));
  return {
    return_demo: {
      ...summary(ctx, demo),
      tasks: tasks.map((t) => ({
        id: t.id,
        skill_id: t.skill_id,
        title: t.title,
        steps: ctx.db.steps.filter((st) => st.task_id === t.id).length,
        step_titles: ctx.db.steps
          .filter((st) => st.task_id === t.id)
          .sort((a, b) => a.position - b.position)
          .map((st) => st.title),
        graded: graded.has(t.id),
      })),
    },
  };
});

route("PATCH", "/api/faculty/return-demos/:id", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const parsed = parseReturnDemoInput(ctx.body, { partial: true });
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;
  const demo = findDemo(ctx, ctx.params.id);
  if (!demo) return notFound(NOT_FOUND);
  if (!canEdit(ctx, demo)) return json({ error: "Only its maker can change this Return Demonstration" }, 403);

  const tasks = tasksOf(ctx, demo.id);
  const diff = input.skills ? skillDiff(tasks, input.skills, gradedTaskIds(ctx, tasks.map((t) => t.id))) : null;
  if (diff && diff.blocked.length > 0) {
    return json({ error: `Students have been graded on ${diff.blocked.join(", ")}, so it can't be removed.` }, 409);
  }
  if (input.offering_id !== undefined) {
    const courseProblem = courseError(ctx, input.offering_id);
    if (courseProblem) return json({ error: courseProblem }, 400);
    demo.offering_id = input.offering_id;
  }
  if (input.title !== undefined) demo.title = input.title;
  if (input.description !== undefined) demo.description = input.description;
  demo.updated_at = new Date().toISOString();

  let added = 0;
  if (diff) {
    if (diff.add.length > 0) added = await addSkillTasks(ctx, demo.id, diff.add);
    const removed = new Set(diff.remove);
    ctx.db.tasks = ctx.db.tasks.filter((t) => !removed.has(t.id));
    ctx.db.steps = ctx.db.steps.filter((st) => !removed.has(st.task_id));
  }
  audit(ctx.db, ctx.viewer, "return_demo.update", "scenarios", { message: `Edited Return Demonstration “${demo.title}”` }, demo.id);
  return { ok: true, added, removed: diff?.remove.length ?? 0 };
});

route("DELETE", "/api/faculty/return-demos/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const demo = findDemo(ctx, ctx.params.id);
  if (!demo) return notFound(NOT_FOUND);
  if (!canEdit(ctx, demo)) return json({ error: "Only its maker can change this Return Demonstration" }, 403);
  const taskIds = tasksOf(ctx, demo.id).map((t) => t.id);
  if (gradedTaskIds(ctx, taskIds).size > 0) {
    return json({ error: "Students have been graded on this Return Demonstration, so it can't be deleted." }, 409);
  }
  const tasks = new Set(taskIds);
  ctx.db.scenarios = ctx.db.scenarios.filter((s) => s.id !== demo.id);
  ctx.db.tasks = ctx.db.tasks.filter((t) => !tasks.has(t.id));
  ctx.db.steps = ctx.db.steps.filter((st) => !tasks.has(st.task_id));
  ctx.db.assignments = ctx.db.assignments.filter((a) => a.scenario_id !== demo.id);
  audit(ctx.db, ctx.viewer, "return_demo.delete", "scenarios", { message: `Deleted Return Demonstration “${demo.title}”` }, demo.id);
  return { success: true };
});

route("POST", "/api/faculty/return-demos/:id/assign", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const ids = (value: unknown) =>
    Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))] : [];
  const teamIds = ids(body?.team_ids);
  const studentIds = ids(body?.student_ids);
  if (teamIds.length === 0 && studentIds.length === 0) return json({ error: "Choose at least one group or student" }, 400);
  const deadline = parseDeadline(body?.deadline);
  if (!deadline.ok) return json({ error: deadline.error }, 400);
  const demo = findDemo(ctx, ctx.params.id);
  if (!demo) return notFound(NOT_FOUND);
  if (!canEdit(ctx, demo)) return json({ error: "Only its maker can assign this Return Demonstration" }, 403);

  const teamMembers = new Map<string, string[]>();
  for (const teamId of teamIds) {
    const team = db.teams.find((t) => t.id === teamId);
    if (!team || (ctx.role === "faculty" && team.faculty_id !== viewer.id)) {
      return json({ error: "You can only assign your own groups" }, 403);
    }
    teamMembers.set(teamId, db.users.filter((u) => u.role === "student" && u.team_id === teamId).map((u) => u.id));
  }
  const teamOf = new Map(
    studentIds.flatMap((id) => {
      const teamId = db.users.find((u) => u.id === id)?.team_id;
      return teamId ? [[id, teamId] as const] : [];
    }),
  );
  const { rows, skipped } = mergeAssignees({
    teamMembers,
    studentIds,
    teamOf,
    already: new Set(db.assignments.filter((a) => a.scenario_id === demo.id).map((a) => a.student_id)),
  });
  const mine = myStudentIds(ctx);
  if (ctx.role === "faculty" && rows.some((r) => !mine.has(r.student_id))) {
    return json({ error: "Some students are not in your groups" }, 403);
  }
  if (rows.length === 0) return json({ error: "Everyone chosen already has this Return Demonstration" }, 409);

  const required = typeof body?.required === "boolean" ? body.required : true;
  db.assignments.unshift(...rows.map((r) => newAssignment(demo, r.student_id, deadline.value as string, required, viewer.id, r.team_id)));
  audit(db, viewer, "return_demo.assign", "scenarios", { message: `Assigned Return Demonstration “${demo.title}” to ${rows.length} student(s)` }, demo.id);
  return json({ assigned: rows.length, skipped }, 201);
});

route("PATCH", "/api/faculty/return-demos/:id/assign", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const studentIds: string[] = Array.isArray(body?.student_ids) ? body.student_ids : [];
  if (studentIds.length === 0) return json({ error: "Choose at least one student" }, 400);
  const deadline = parseDeadline(body?.deadline);
  if (!deadline.ok) return json({ error: deadline.error }, 400);
  const demo = findDemo(ctx, ctx.params.id);
  if (!demo) return notFound(NOT_FOUND);
  if (!canEdit(ctx, demo)) return json({ error: "Only its maker can change this Return Demonstration" }, 403);
  let updated = 0;
  for (const a of db.assignments) {
    if (a.scenario_id !== demo.id || !studentIds.includes(a.student_id) || a.status === "completed") continue;
    a.deadline = deadline.value as string;
    updated += 1;
  }
  return { updated };
});
