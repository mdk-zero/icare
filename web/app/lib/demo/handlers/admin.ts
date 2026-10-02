"use client";

import { json, notFound, route, sleep, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoUser } from "../fixtures/people";
import { audit } from "./shared";
import { mlRun } from "./faculty";
import { hasWork, scoredAt, submittedAttempts } from "./derive";
import { byName, sectionName, teamLabel, userById } from "./scope";

/** The Dean portal's own API: the overview, instructors, sections, students, accounts. */

type Ctx = DemoContext;

const deanOnly = (ctx: Ctx) => ctx.role === "admin";
const forbidden = () => json({ error: "Forbidden" }, 403);

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const students = (ctx: Ctx) => ctx.db.users.filter((u) => u.role === "student");
const instructors = (ctx: Ctx) => ctx.db.users.filter((u) => u.role === "faculty" && u.admin_id === ctx.viewer.id);

// ---------------------------------------------------------------------------
// Overview (the server-rendered page asks this only in a demo)
// ---------------------------------------------------------------------------

route("GET", "/api/admin/overview", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db } = ctx;
  const all = students(ctx);
  const assessed = all.filter((s) => s.risk_level && hasWork(db, s.id));
  const atRisk = assessed.filter((s) => s.risk_level === "at_risk").length;
  const unassigned = all.filter((s) => !s.section_id).length;
  const ungrouped = all.filter((s) => s.section_id && !s.team_id).length;
  const sectionRows = db.sections
    .map((sec) => ({ id: sec.id, name: sec.name, students: all.filter((s) => s.section_id === sec.id).length }))
    .filter((s) => s.students > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  // A section is covered when an instructor supervises one of its groups.
  const covered = new Set(db.teams.filter((t) => t.faculty_id).map((t) => t.section_id));
  const uncovered = sectionRows.filter((s) => !covered.has(s.id));
  const idle = instructors(ctx).filter((f) => !db.teams.some((t) => t.faculty_id === f.id)).length;
  const activeRooms = db.rooms.filter((r) => r.status === "active");
  const admitted = db.patients.filter((p) => p.status === "admitted" && p.room_id);
  const inRoom = (id: string) => admitted.filter((p) => p.room_id === id).length;

  const attention: { key: string; message: string; detail: string; href: string; action: string }[] = [];
  if (unassigned > 0) {
    attention.push({ key: "unassigned", message: `${plural(unassigned, "student")} not assigned to a section`, detail: "No instructor can see them until they're placed in a section.", href: "/admin/student-management", action: "Assign" });
  }
  if (ungrouped > 0) {
    attention.push({ key: "ungrouped", message: `${plural(ungrouped, "student")} not in a group`, detail: "Instructors only see the students in the groups they supervise.", href: "/admin/student-management", action: "Group them" });
  }
  if (uncovered.length > 0) {
    attention.push({ key: "uncovered", message: `${plural(uncovered.length, "section")} without an instructor`, detail: `${uncovered.map((s) => s.name).join(", ")} — their students have no one reviewing them.`, href: "/admin/faculty/assignment", action: "Assign instructor" });
  }
  if (idle > 0) {
    attention.push({ key: "idle-faculty", message: `${plural(idle, "instructor account")} with no sections`, detail: "They can sign in but have no students to see.", href: "/admin/faculty/assignment", action: "Assign" });
  }

  return {
    viewerName: ctx.viewer.name,
    totalStudents: all.length,
    assessedCount: assessed.length,
    atRiskCount: atRisk,
    lastPredictedAt: scoredAt(),
    sectionRows,
    assignedStudents: all.length - unassigned,
    unassignedStudents: unassigned,
    activeRoomCount: activeRooms.length,
    occupiedRooms: activeRooms.filter((r) => inRoom(r.id) > 0).length,
    admittedPatients: activeRooms.reduce((sum, r) => sum + inRoom(r.id), 0),
    bedCapacity: activeRooms.reduce((sum, r) => sum + r.capacity, 0),
    attention,
    activity: db.audit
      .filter((r) => r.actor_id === ctx.viewer.id || instructors(ctx).some((f) => f.id === r.actor_id))
      .slice(0, 5)
      .map((r) => ({ action: r.action, created_at: r.created_at, actor: userById(db, r.actor_id) ? { name: userById(db, r.actor_id)!.name } : null })),
  };
});

// ---------------------------------------------------------------------------
// Instructors and their groups
// ---------------------------------------------------------------------------

function groupRows(ctx: Ctx) {
  const { db } = ctx;
  return db.teams
    .map((t) => ({
      id: t.id,
      name: t.name,
      section_id: t.section_id,
      section_name: sectionName(db, t.section_id) ?? "",
      faculty_id: t.faculty_id,
      faculty_name: userById(db, t.faculty_id)?.name ?? null,
      member_count: db.users.filter((u) => u.role === "student" && u.team_id === t.id).length,
    }))
    .sort((a, b) => a.section_name.localeCompare(b.section_name, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

route("GET", "/api/admin/faculty", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const groups = groupRows(ctx);
  return {
    groups,
    faculty: instructors(ctx)
      .sort(byName)
      .map((f) => {
        const own = groups.filter((g) => g.faculty_id === f.id);
        return {
          id: f.id,
          email: f.email,
          name: f.name,
          picture_url: f.picture_url,
          sex: f.sex,
          created_at: f.created_at,
          last_login_at: f.last_sign_in_at,
          groups: own,
          sections: [...new Map(own.map((g) => [g.section_id, { id: g.section_id, name: g.section_name }])).values()],
          student_count: own.reduce((sum, g) => sum + g.member_count, 0),
        };
      }),
  };
});

route("PUT", "/api/admin/faculty/:id/groups", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body, params } = ctx;
  const faculty = instructors(ctx).find((f) => f.id === params.id);
  if (!faculty) return notFound("Instructor not found");
  const ids: string[] = Array.isArray(body?.team_ids) ? body.team_ids : [];
  for (const t of db.teams) {
    if (ids.includes(t.id)) t.faculty_id = faculty.id;
    else if (t.faculty_id === faculty.id) t.faculty_id = null;
  }
  audit(db, ctx.viewer, "team.assign_faculty", "teams", {
    message: `Gave ${faculty.name} ${ids.length ? ids.map((id) => teamLabel(db, id)).join(", ") : "no groups"}`,
  });
  return { success: true, team_ids: ids };
});

/** Whole-section assignment: every group in the section goes to the instructor. */
route("PUT", "/api/admin/faculty/:id/sections", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body, params } = ctx;
  const faculty = instructors(ctx).find((f) => f.id === params.id);
  if (!faculty) return notFound("Instructor not found");
  const ids: string[] = Array.isArray(body?.section_ids) ? body.section_ids : [];
  for (const s of db.sections) {
    const had = s.faculty_ids.includes(faculty.id);
    if (ids.includes(s.id) && !had) s.faculty_ids.push(faculty.id);
    if (!ids.includes(s.id) && had) s.faculty_ids = s.faculty_ids.filter((x) => x !== faculty.id);
  }
  for (const t of db.teams) {
    if (ids.includes(t.section_id)) t.faculty_id = faculty.id;
    else if (t.faculty_id === faculty.id) t.faculty_id = null;
  }
  audit(db, ctx.viewer, "faculty.sections", "users", { message: `Gave ${faculty.name} ${ids.map((id) => sectionName(db, id)).join(", ") || "no sections"}` });
  return { success: true, section_ids: ids };
});

route("PUT", "/api/admin/faculty/:id/students", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  return { success: true, student_ids: Array.isArray(ctx.body?.student_ids) ? ctx.body.student_ids : [] };
});

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

route("POST", "/api/admin/sections", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "Section name is required" }, 400);
  if (db.sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) return json({ error: "A section with that name already exists" }, 409);
  const section = { id: newId(), name, year_level: 3, faculty_ids: [], created_at: new Date().toISOString() };
  db.sections.push(section);
  audit(db, ctx.viewer, "section.create", "sections", { message: `Created section ${name}` }, section.id);
  return json({ section: { id: section.id, name } }, 201);
});

route("GET", "/api/admin/sections/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db } = ctx;
  const section = db.sections.find((s) => s.id === ctx.params.id);
  if (!section) return notFound("Section not found");
  const faculty = [...new Set(db.teams.filter((t) => t.section_id === section.id && t.faculty_id).map((t) => t.faculty_id!))]
    .map((id) => userById(db, id))
    .filter((u): u is DemoUser => Boolean(u))
    .map((u) => ({ id: u.id, name: u.name }));
  return {
    section: { id: section.id, name: section.name },
    student_count: db.users.filter((u) => u.section_id === section.id).length,
    faculty,
    assessment_count: db.quizzes.filter((q) => q.target_sections.includes(section.name)).length,
  };
});

route("PATCH", "/api/admin/sections/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const section = db.sections.find((s) => s.id === ctx.params.id);
  if (!section) return notFound("Section not found");
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "Section name is required" }, 400);
  if (name === section.name) return { section: { id: section.id, name }, assessments_retargeted: 0 };
  if (db.sections.some((s) => s.id !== section.id && s.name.toLowerCase() === name.toLowerCase())) {
    return json({ error: "A section with that name already exists" }, 409);
  }
  let retargeted = 0;
  for (const q of db.quizzes) {
    if (q.target_sections.includes(section.name)) {
      q.target_sections = q.target_sections.map((n) => (n === section.name ? name : n));
      retargeted += 1;
    }
  }
  audit(db, ctx.viewer, "section.rename", "sections", { message: `Renamed ${section.name} to ${name}` }, section.id);
  section.name = name;
  return { section: { id: section.id, name }, assessments_retargeted: retargeted };
});

route("DELETE", "/api/admin/sections/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db } = ctx;
  const section = db.sections.find((s) => s.id === ctx.params.id);
  if (!section) return notFound("Section not found");
  const members = db.users.filter((u) => u.section_id === section.id);
  for (const u of members) {
    u.section_id = null;
    u.team_id = null;
  }
  db.teams = db.teams.filter((t) => t.section_id !== section.id);
  db.sections = db.sections.filter((s) => s.id !== section.id);
  audit(db, ctx.viewer, "section.delete", "sections", { message: `Deleted section ${section.name}` }, section.id);
  return { success: true, unassigned_students: members.length };
});

// ---------------------------------------------------------------------------
// Students and accounts
// ---------------------------------------------------------------------------

route("GET", "/api/admin/students", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db } = ctx;
  return {
    students: students(ctx)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => {
        const scores = submittedAttempts(db, s.id).map((a) => a.score ?? 0);
        const scored = Boolean(s.risk_level) && hasWork(db, s.id);
        return {
          id: s.id,
          name: s.name,
          email: s.email,
          picture_url: s.picture_url,
          sex: s.sex,
          created_at: s.created_at,
          last_login_at: s.last_sign_in_at,
          quizzes_completed: scores.length,
          average_score: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
          scored,
          at_risk: scored && s.risk_level === "at_risk",
          section_id: s.section_id,
          section: sectionName(db, s.section_id),
        };
      }),
  };
});

route("DELETE", "/api/admin/students", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  const targets = ids.filter((id) => db.users.some((u) => u.id === id && u.role === "student"));
  if (targets.length === 0) return notFound("No matching students found");
  db.users = db.users.filter((u) => !targets.includes(u.id));
  db.assignments = db.assignments.filter((a) => !targets.includes(a.student_id));
  db.quizAssignments = db.quizAssignments.filter((a) => !targets.includes(a.student_id));
  db.attempts = db.attempts.filter((a) => !targets.includes(a.student_id));
  db.shiftEntries = db.shiftEntries.filter((e) => !targets.includes(e.student_id));
  audit(db, ctx.viewer, "user.delete", "users", { message: `Deleted ${plural(targets.length, "student")}` });
  return { deleted: targets.length, skipped: ids.length - targets.length };
});

route("GET", "/api/admin/students/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db } = ctx;
  const s = userById(db, ctx.params.id);
  if (!s || s.role !== "student") return notFound("Student not found");
  const attempts = submittedAttempts(db, s.id);
  const scores = attempts.map((a) => a.score ?? 0);
  return {
    student: {
      id: s.id,
      email: s.email,
      name: s.name,
      picture_url: s.picture_url,
      sex: s.sex,
      created_at: s.created_at,
      last_login_at: s.last_sign_in_at,
      quizzes_completed: attempts.length,
      average_score: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
    },
    attempts: attempts.map((a) => ({
      id: a.id,
      score: a.score,
      submitted_at: a.submitted_at,
      time_taken_seconds: a.time_taken_seconds,
      assessments: { title: db.quizzes.find((q) => q.id === a.assessment_id)?.title ?? "Quiz" },
    })),
  };
});

function userRow(ctx: Ctx, u: DemoUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    picture_url: u.picture_url,
    sex: u.sex,
    created_at: u.created_at,
    last_login_at: u.last_sign_in_at,
    section_id: u.section_id,
    sections: u.section_id ? { name: sectionName(ctx.db, u.section_id) } : null,
  };
}

route("GET", "/api/admin/users", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const role = ctx.query.get("role");
  return {
    users: ctx.db.users
      .filter((u) => u.role === "student" || (u.role === "faculty" && u.admin_id === ctx.viewer.id) || u.id === ctx.viewer.id)
      .filter((u) => !role || role === "all" || u.role === role)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((u) => userRow(ctx, u)),
  };
});

route("POST", "/api/admin/users", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name) return json({ error: "Name is required" }, 400);
  if (!email) return json({ error: "Email is required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email format" }, 400);
  if (body?.role !== "student" && body?.role !== "faculty") return json({ error: "Role must be student or instructor" }, 400);
  if (db.users.some((u) => u.email === email)) return json({ error: "A user with this email already exists" }, 409);
  const user: DemoUser = {
    id: newId(),
    email,
    name,
    role: body.role,
    sex: body?.sex === "male" || body?.sex === "female" ? body.sex : null,
    picture_url: null,
    section_id: body.role === "student" && typeof body?.section_id === "string" ? body.section_id : null,
    team_id: null,
    admin_id: body.role === "faculty" ? ctx.viewer.id : null,
    student_number: null,
    created_at: new Date().toISOString(),
    last_sign_in_at: null,
    last_activity: null,
    status: "active",
    google_linked: false,
    risk_level: null,
    risk_probability: null,
  };
  db.users.push(user);
  audit(db, ctx.viewer, "user.create", "users", { message: `Created ${body.role === "faculty" ? "instructor" : "student"} account for ${name}` }, user.id);
  return json(
    {
      user: userRow(ctx, user),
      password: "Demo-Pass-2026",
      warning: "This is a demo: no invitation email was sent. In the real app the new account gets this temporary password by email.",
    },
    201,
  );
});

route("PATCH", "/api/admin/users/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body, params, viewer } = ctx;
  const user = userById(db, params.id);
  if (!user) return notFound("User not found");
  if (body?.role !== undefined && user.id === viewer.id) return json({ error: "You cannot change your own role" }, 400);
  if (typeof body?.name === "string") {
    if (!body.name.trim()) return json({ error: "Name is required" }, 400);
    user.name = body.name.trim();
  }
  if (body?.role === "student" || body?.role === "faculty") user.role = body.role;
  if (body?.sex === "male" || body?.sex === "female") user.sex = body.sex;
  audit(db, viewer, "user.update", "users", { message: `Edited ${user.name}'s account` }, user.id);
  return { user: userRow(ctx, user) };
});

route("DELETE", "/api/admin/users/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, params, viewer } = ctx;
  const user = userById(db, params.id);
  if (!user) return notFound("User not found");
  if (user.id === viewer.id) return json({ error: "You cannot delete your own account" }, 400);
  db.users = db.users.filter((u) => u.id !== user.id);
  for (const t of db.teams) if (t.faculty_id === user.id) t.faculty_id = null;
  audit(db, viewer, "user.delete", "users", { message: `Deleted ${user.name}'s account` }, user.id);
  return { success: true };
});

// ---------------------------------------------------------------------------
// Grade change requests, ML and the warehouse
// ---------------------------------------------------------------------------

route("PATCH", "/api/admin/grade-edit-requests/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const { db, body, params, viewer } = ctx;
  const status = body?.status;
  if (status !== "accepted" && status !== "declined") return json({ error: "status must be accepted or declined" }, 400);
  const copies = db.notifications.filter((n) => n.data?.kind === "grade_edit_request" && n.data.request_id === params.id);
  if (copies.length === 0) return notFound("Request not found");
  const current = copies[0].data as Record<string, string>;
  if (current.status !== "pending") return json({ error: `This request was already ${current.status}.` }, 409);
  const resolved = { ...current, status, resolved_by: viewer.id, resolved_by_name: viewer.name, resolved_at: new Date().toISOString() };
  for (const n of copies) {
    n.data = resolved;
    n.read_at ??= new Date().toISOString();
  }
  const accepted = status === "accepted";
  db.notifications.push({
    id: newId(),
    user_id: current.faculty_id,
    type: "system",
    title: accepted ? "Grade change approved" : "Grade change declined",
    body: accepted
      ? `${viewer.name} approved changing ${current.student_name}'s grade on "${current.scenario_title}". Open it in Review Submissions and click Edit.`
      : `${viewer.name} declined changing ${current.student_name}'s grade on "${current.scenario_title}".`,
    data: { ...resolved, kind: "grade_edit_decision" },
    read_at: null,
    created_at: new Date().toISOString(),
  });
  audit(db, viewer, `grade_edit.${status}`, "scenario_assignments", { message: `${accepted ? "Approved" : "Declined"} ${current.faculty_name} changing a saved grade` }, current.assignment_id);
  return { success: true, status };
});

route("POST", "/api/admin/ml", (ctx) => (deanOnly(ctx) ? mlRun(ctx, students(ctx)) : forbidden()));

route("POST", "/api/admin/etl", async (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  await sleep(1200);
  audit(ctx.db, ctx.viewer, "etl.run", "warehouse", { message: "Refreshed the analytics warehouse" });
  return { rows_loaded: { dim_students: students(ctx).length, fact_attempts: ctx.db.attempts.length, fact_scenarios: ctx.db.assignments.length } };
});

// ---------------------------------------------------------------------------
// Activity log (readAuditTrail, over the dean's own and their instructors' actions)
// ---------------------------------------------------------------------------

export function auditTrail(ctx: Ctx, actors: Set<string> | null) {
  const { db, query } = ctx;
  const q = query.get("q")?.trim().toLowerCase() ?? "";
  const role = query.get("role") ?? "";
  const entity = query.get("entity") ?? "";
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  const limit = Math.min(Math.max(Number(query.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(query.get("offset")) || 0, 0);
  const scoped = db.audit.filter((r) => !actors || (r.actor_id && actors.has(r.actor_id)));
  const rows = scoped
    .filter((r) => !q || r.action.toLowerCase().includes(q))
    .filter((r) => !role || r.actor_role === role)
    .filter((r) => !entity || r.entity_type === entity)
    .filter((r) => !from || r.created_at >= from)
    .filter((r) => !to || r.created_at <= `${to}T23:59:59.999Z`)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    logs: rows.slice(offset, offset + limit).map((r) => {
      const actor = userById(db, r.actor_id);
      return {
        ...r,
        actor: actor ? { id: actor.id, name: actor.name, email: actor.email, picture_url: actor.picture_url, sex: actor.sex } : null,
      };
    }),
    total: rows.length,
    entity_types: [...new Set(scoped.map((r) => r.entity_type).filter((e): e is string => Boolean(e)))].sort(),
  };
}

route("GET", "/api/admin/audit", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  return auditTrail(ctx, new Set([ctx.viewer.id, ...instructors(ctx).map((f) => f.id)]));
});
