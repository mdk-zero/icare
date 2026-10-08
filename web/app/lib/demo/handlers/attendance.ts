"use client";

import { json, notFound, route, type DemoContext } from "../router";
import { newId } from "../store";
import { parseExcuse, tallyAttendance, type ActivityKind } from "@/app/lib/attendance";
import { audit } from "./shared";
import { canSeeStudent, userById } from "./scope";
import { demoAttendanceRows } from "./derive";

/** A student's attendance from activity deadlines, and excusing absences: the routes under /api/faculty/students/:id/attendance. */

const KINDS: readonly ActivityKind[] = ["scenario", "assessment", "case_presentation"];
const NOT_ABSENT = "Only an absence can be excused";

function rowFor(ctx: DemoContext, kind: ActivityKind, activityId: string) {
  return demoAttendanceRows(ctx.db, [ctx.params.id]).find((r) => r.kind === kind && r.activity_id === activityId) ?? null;
}

/** Faculty excuse the members of their own groups; the Dean only reads. */
function excuseAccess(ctx: DemoContext): Response | null {
  if (ctx.role !== "faculty") return json({ error: "Forbidden" }, 403);
  if (!canSeeStudent(ctx.db, ctx.role, ctx.viewer.id, ctx.params.id)) return notFound("Student not found");
  return null;
}

route("GET", "/api/faculty/students/:id/attendance", (ctx) => {
  if (ctx.role !== "faculty" && ctx.role !== "admin") return json({ error: "Forbidden" }, 403);
  if (!canSeeStudent(ctx.db, ctx.role, ctx.viewer.id, ctx.params.id)) return notFound("Student not found");
  const rows = demoAttendanceRows(ctx.db, [ctx.params.id]);
  return { rows, tally: tallyAttendance(rows.map((r) => r.status)), can_excuse: ctx.role === "faculty", excuses_ready: true };
});

route("POST", "/api/faculty/students/:id/attendance/excuses", (ctx) => {
  const denied = excuseAccess(ctx);
  if (denied) return denied;
  const parsed = parseExcuse(ctx.body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { kind, activity_id, reason } = parsed.value;
  const row = rowFor(ctx, kind, activity_id);
  if (!row) return notFound("Activity not found");
  if (row.status !== "absent") return json({ error: NOT_ABSENT }, 409);

  const db = ctx.db;
  db.excuses = db.excuses ?? [];
  const id = newId();
  db.excuses.push({
    id,
    student_id: ctx.params.id,
    kind,
    activity_id,
    reason,
    excused_by_name: ctx.viewer.name,
    created_at: new Date().toISOString(),
  });
  audit(
    db,
    ctx.viewer,
    "attendance.excuse",
    "activity_excuses",
    { message: `Excused ${userById(db, ctx.params.id)?.name ?? "a student"}'s absence from “${row.title}”`, reason },
    id,
  );
  return { row: rowFor(ctx, kind, activity_id) };
});

route("DELETE", "/api/faculty/students/:id/attendance/excuses", (ctx) => {
  const denied = excuseAccess(ctx);
  if (denied) return denied;
  const kind = ctx.body?.kind as ActivityKind;
  const activityId = ctx.body?.activity_id;
  if (!KINDS.includes(kind) || typeof activityId !== "string" || !activityId) return json({ error: "Choose an activity" }, 400);

  const db = ctx.db;
  const excuses = db.excuses ?? [];
  const found = excuses.find((e) => e.student_id === ctx.params.id && e.kind === kind && e.activity_id === activityId);
  if (!found) return notFound("Excuse not found");
  db.excuses = excuses.filter((e) => e !== found);
  const row = rowFor(ctx, kind, activityId);
  audit(
    db,
    ctx.viewer,
    "attendance.unexcuse",
    "activity_excuses",
    { message: `Undid the excuse for ${userById(db, ctx.params.id)?.name ?? "a student"}'s absence from “${row?.title ?? "an activity"}”` },
    found.id,
  );
  return { row };
});
