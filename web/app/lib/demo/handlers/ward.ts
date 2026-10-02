"use client";

import { json, notFound, route, sleep, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoPatient, DemoRoom, DemoShift } from "../fixtures/school";
import { audit } from "./shared";
import { ownTeams, teamLabel, userById, visibleStudents } from "./scope";

/** Shifts and attendance, the ward census, rooms and the floor plan, vitals and charts. */

type Ctx = DemoContext;

const staffOnly = (ctx: Ctx) => ctx.role === "faculty" || ctx.role === "admin";
const forbidden = () => json({ error: "Forbidden" }, 403);

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

function shiftOut(ctx: Ctx, s: DemoShift) {
  const { db } = ctx;
  const mine = new Set(visibleStudents(db, ctx.role, ctx.viewer.id).map((u) => u.id));
  const section = db.sections.find((x) => x.id === s.section_id);
  const team = db.teams.find((t) => t.id === s.team_id);
  const room = db.rooms.find((r) => r.id === s.room_id);
  return {
    ...s,
    section: section ? { id: section.id, name: section.name } : null,
    team: team ? { id: team.id, name: team.name } : null,
    room: room ? { id: room.id, name: room.name, room_number: room.room_number } : null,
    statuses: db.shiftEntries.filter((e) => e.shift_id === s.id && mine.has(e.student_id)).map((e) => e.attendance_status),
  };
}

function shiftsInScope(ctx: Ctx) {
  const teams = new Set(ownTeams(ctx.db, ctx.role, ctx.viewer.id).map((t) => t.id));
  return ctx.db.shifts.filter((s) => ctx.role === "admin" || (s.team_id !== null && teams.has(s.team_id)));
}

/** Detection, as closeEndedShifts does it: a rostered student never seen during an ended shift is absent. */
function closeEndedShifts(ctx: Ctx) {
  const now = Date.now();
  for (const s of ctx.db.shifts) {
    if (s.status !== "scheduled" || Date.parse(s.ends_at) + 15 * 60_000 > now) continue;
    for (const e of ctx.db.shiftEntries) {
      if (e.shift_id === s.id && e.attendance_status === "scheduled") e.attendance_status = "absent";
    }
  }
}

route("GET", "/api/faculty/shifts", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  closeEndedShifts(ctx);
  return {
    shifts: shiftsInScope(ctx)
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .map((s) => shiftOut(ctx, s)),
  };
});

route("POST", "/api/faculty/shifts", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const team = ownTeams(db, ctx.role, viewer.id).find((t) => t.id === body?.team_id);
  if (!body?.team_id) return json({ error: "A group is required" }, 400);
  if (!team) return json({ error: "That group is not one of yours" }, 403);
  const startsAt = typeof body.starts_at === "string" ? body.starts_at : "";
  const endsAt = typeof body.ends_at === "string" ? body.ends_at : "";
  if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
    return json({ error: "A valid start and end time are required" }, 400);
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return json({ error: "The shift must end after it starts" }, 400);
  const shift: DemoShift = {
    id: newId(),
    section_id: team.section_id,
    team_id: team.id,
    room_id: typeof body.room_id === "string" && body.room_id ? body.room_id : null,
    label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : null,
    shift_type: ["am", "pm", "night", "custom"].includes(body.shift_type) ? body.shift_type : "custom",
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    status: "scheduled",
    created_by: viewer.id,
    created_at: new Date().toISOString(),
  };
  db.shifts.push(shift);
  const members = db.users.filter((u) => u.role === "student" && u.team_id === team.id);
  for (const m of members) {
    db.shiftEntries.push({
      id: newId(),
      shift_id: shift.id,
      student_id: m.id,
      attendance_status: "scheduled",
      checked_in_at: null,
      checked_out_at: null,
      notes: null,
    });
  }
  audit(db, viewer, "shift.create", "shifts", { message: `Scheduled ${shift.label ?? "a shift"} for ${teamLabel(db, team.id)}` }, shift.id);
  return json({ shift: shiftOut(ctx, shift), assigned: members.length }, 201);
});

function loadShift(ctx: Ctx) {
  const shift = shiftsInScope(ctx).find((s) => s.id === ctx.params.id);
  return shift ?? null;
}

route("GET", "/api/faculty/shifts/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  closeEndedShifts(ctx);
  const shift = loadShift(ctx);
  if (!shift) return notFound("Shift not found");
  const mine = new Set(visibleStudents(ctx.db, ctx.role, ctx.viewer.id).map((u) => u.id));
  return {
    shift: shiftOut(ctx, shift),
    roster: ctx.db.shiftEntries
      .filter((e) => e.shift_id === shift.id && mine.has(e.student_id))
      .map((e) => {
        const u = userById(ctx.db, e.student_id);
        return { ...e, users: u ? { name: u.name, email: u.email } : null };
      })
      .sort((a, b) => (a.users?.name ?? "").localeCompare(b.users?.name ?? "")),
  };
});

route("PATCH", "/api/faculty/shifts/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const shift = loadShift(ctx);
  if (!shift) return notFound("Shift not found");
  if (body?.details && typeof body.details === "object") {
    const d = body.details;
    if (d.team_id) {
      const team = ownTeams(db, ctx.role, viewer.id).find((t) => t.id === d.team_id);
      if (!team) return json({ error: "That group is not one of yours" }, 403);
      shift.team_id = team.id;
      shift.section_id = team.section_id;
    }
    if (d.starts_at) shift.starts_at = new Date(d.starts_at).toISOString();
    if (d.ends_at) shift.ends_at = new Date(d.ends_at).toISOString();
    if (Date.parse(shift.ends_at) <= Date.parse(shift.starts_at)) return json({ error: "The shift must end after it starts" }, 400);
    if (d.shift_type) shift.shift_type = d.shift_type;
    if ("room_id" in d) shift.room_id = d.room_id || null;
    if ("label" in d) shift.label = d.label || null;
    if ("notes" in d) shift.notes = d.notes || null;
    audit(db, viewer, "shift.update", "shifts", { message: `Edited ${shift.label ?? "a shift"}` }, shift.id);
  }
  if (body?.status === "cancelled" || body?.status === "scheduled") {
    shift.status = body.status;
    audit(db, viewer, `shift.${body.status === "cancelled" ? "cancel" : "reinstate"}`, "shifts", { message: `${body.status === "cancelled" ? "Cancelled" : "Reinstated"} ${shift.label ?? "a shift"}` }, shift.id);
  }
  let updated = 0;
  for (const mark of Array.isArray(body?.marks) ? body.marks : []) {
    const entry = db.shiftEntries.find((e) => e.id === mark.assignment_id && e.shift_id === shift.id);
    if (!entry) continue;
    // Instructors only excuse a detected absence, or undo that.
    const from = mark.status === "excused" ? "absent" : mark.status === "absent" ? "excused" : null;
    if (!from || entry.attendance_status !== from) continue;
    entry.attendance_status = mark.status;
    entry.notes = typeof mark.notes === "string" && mark.notes.trim() ? mark.notes.trim() : entry.notes;
    updated += 1;
    audit(db, viewer, mark.status === "excused" ? "shift_attendance.excuse" : "shift_attendance.unexcuse", "shifts", {
      message: `${mark.status === "excused" ? "Excused" : "Un-excused"} ${userById(db, entry.student_id)?.name}'s absence`,
    });
  }
  return { updated };
});

route("DELETE", "/api/faculty/shifts/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const shift = loadShift(ctx);
  if (!shift) return notFound("Shift not found");
  ctx.db.shifts = ctx.db.shifts.filter((s) => s.id !== shift.id);
  ctx.db.shiftEntries = ctx.db.shiftEntries.filter((e) => e.shift_id !== shift.id);
  audit(ctx.db, ctx.viewer, "shift.delete", "shifts", { message: `Deleted ${shift.label ?? "a shift"}` }, shift.id);
  return { success: true };
});

// ---------------------------------------------------------------------------
// Rooms and the floor plan
// ---------------------------------------------------------------------------

function roomOut(ctx: Ctx, r: DemoRoom) {
  return {
    ...r,
    students_assigned: ctx.db.roomAssignments.filter((a) => a.room_id === r.id && !a.ends_at).length,
    patients_assigned: ctx.db.patients.filter((p) => p.room_id === r.id && p.status === "admitted").length,
  };
}

route("GET", "/api/admin/rooms", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return { rooms: ctx.db.rooms.slice().sort((a, b) => a.room_number.localeCompare(b.room_number)).map((r) => roomOut(ctx, r)) };
});

route("GET", "/api/admin/rooms/fixtures", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return { fixtures: ctx.db.fixtures, enabled: true };
});

route("PUT", "/api/admin/rooms/layout", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const { db, body } = ctx;
  let saved = 0;
  for (const p of Array.isArray(body?.positions) ? body.positions : []) {
    const room = db.rooms.find((r) => r.id === p.id);
    if (!room) continue;
    room.plan_x = p.x;
    room.plan_y = p.y;
    room.plan_w = p.w;
    room.plan_h = p.h;
    if (p.door) room.plan_door = p.door;
    saved += 1;
  }
  if (Array.isArray(body?.fixtures)) db.fixtures = body.fixtures;
  audit(db, ctx.viewer, "room.layout", "rooms", { message: "Rearranged the ward floor plan" });
  return { saved };
});

route("POST", "/api/admin/rooms", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const { db, body } = ctx;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const number = typeof body?.room_number === "string" ? body.room_number.trim() : "";
  if (!name || !number) return json({ error: "Name and room number are required" }, 400);
  if (db.rooms.some((r) => r.room_number === number)) return json({ error: "A room with that number already exists" }, 409);
  const now = new Date().toISOString();
  const room: DemoRoom = {
    id: newId(),
    campus_id: null,
    name,
    room_number: number,
    capacity: Math.max(1, Number(body?.capacity) || 1),
    status: body?.status ?? "active",
    description: body?.description ?? null,
    created_at: now,
    updated_at: now,
    plan_x: null,
    plan_y: null,
    plan_w: null,
    plan_h: null,
    plan_door: null,
  };
  db.rooms.push(room);
  audit(db, ctx.viewer, "room.create", "rooms", { message: `Added room ${number} · ${name}` }, room.id);
  return json({ room: roomOut(ctx, room) }, 201);
});

route("GET", "/api/admin/rooms/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const room = ctx.db.rooms.find((r) => r.id === ctx.params.id);
  if (!room) return notFound("Room not found");
  return {
    room: roomOut(ctx, room),
    assignments: ctx.db.roomAssignments
      .filter((a) => a.room_id === room.id && !a.ends_at)
      .map((a) => {
        const u = userById(ctx.db, a.student_id);
        return { ...a, users: u ? { name: u.name, email: u.email } : null };
      }),
  };
});

route("PATCH", "/api/admin/rooms/:id", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const room = ctx.db.rooms.find((r) => r.id === ctx.params.id);
  if (!room) return notFound("Room not found");
  for (const key of ["name", "room_number", "capacity", "status", "description"] as const) {
    if (ctx.body && key in ctx.body) (room as unknown as Record<string, unknown>)[key] = ctx.body[key];
  }
  room.updated_at = new Date().toISOString();
  audit(ctx.db, ctx.viewer, "room.update", "rooms", { message: `Edited room ${room.room_number} · ${room.name}` }, room.id);
  return { room: roomOut(ctx, room) };
});

route("DELETE", "/api/admin/rooms/:id", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const room = ctx.db.rooms.find((r) => r.id === ctx.params.id);
  if (!room) return notFound("Room not found");
  if (ctx.db.patients.some((p) => p.room_id === room.id && p.status === "admitted")) {
    return json({ error: "Move or discharge the patients in this room first" }, 409);
  }
  ctx.db.rooms = ctx.db.rooms.filter((r) => r.id !== room.id);
  audit(ctx.db, ctx.viewer, "room.delete", "rooms", { message: `Deleted room ${room.room_number} · ${room.name}` }, room.id);
  return { success: true };
});

route("POST", "/api/admin/rooms/:id/assignments", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const { db, body, params } = ctx;
  const ids: string[] = Array.isArray(body?.student_ids) ? body.student_ids : [];
  const created = ids.map((id) => ({
    id: newId(),
    room_id: params.id,
    student_id: id,
    shift: body?.shift ?? null,
    starts_at: new Date().toISOString(),
    ends_at: null,
  }));
  db.roomAssignments.push(...created);
  return { assignments: created };
});

route("DELETE", "/api/admin/rooms/:id/assignments", (ctx) => {
  if (ctx.role !== "admin") return forbidden();
  const a = ctx.db.roomAssignments.find((x) => x.id === ctx.body?.assignment_id);
  if (!a) return notFound("Assignment not found");
  a.ends_at = new Date().toISOString();
  return { success: true };
});

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

function patientOut(ctx: Ctx, p: DemoPatient) {
  const room = ctx.db.rooms.find((r) => r.id === p.room_id);
  return { ...p, room: room ? { id: room.id, name: room.name, room_number: room.room_number } : null };
}

route("GET", "/api/faculty/patients", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const search = ctx.query.get("search")?.toLowerCase() ?? "";
  return {
    patients: ctx.db.patients
      .filter((p) => !search || p.name.toLowerCase().includes(search) || p.diagnosis.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => patientOut(ctx, p)),
  };
});

/** Students see the census too (mobile); kept for any shared component that asks. */
route("GET", "/api/patients", (ctx) => ({ patients: ctx.db.patients.filter((p) => p.status === "admitted").map((p) => patientOut(ctx, p)) }));

route("POST", "/api/faculty/patients", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "Patient name is required" }, 400);
  const room = db.rooms.find((r) => r.id === body?.room_id);
  const n = db.patients.length + 1;
  const patient: DemoPatient = {
    id: newId(),
    subject_id: 910000 + n,
    hadm_id: 810000 + n,
    mimic_id: `DEMO-${810000 + n}`,
    name,
    age: Number(body?.age) || 30,
    gender: body?.gender ?? "F",
    room_id: room?.id ?? null,
    room_number: room?.room_number ?? "",
    diagnosis: typeof body?.diagnosis === "string" ? body.diagnosis : "",
    admission_date: new Date().toISOString(),
    status: "admitted",
    discharged_at: null,
    vital_signs: body?.vital_signs ?? { heart_rate: null, blood_pressure: null, temperature: null, respiratory_rate: null, oxygen_saturation: null },
    labs: body?.labs ?? {},
    medical_history: body?.medical_history ?? null,
    created_by: viewer.id,
    created_at: new Date().toISOString(),
  };
  db.patients.push(patient);
  audit(db, viewer, "patient.create", "patients", { message: `Admitted ${name}` }, patient.id);
  return json({ patient: patientOut(ctx, patient) }, 201);
});

route("PUT", "/api/faculty/patients", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const patient = db.patients.find((p) => p.id === body?.id);
  if (!patient) return notFound("Patient not found");
  for (const key of ["name", "age", "gender", "diagnosis", "medical_history", "vital_signs", "labs"] as const) {
    if (body && key in body) (patient as unknown as Record<string, unknown>)[key] = body[key];
  }
  if (body && "room_id" in body) {
    const room = db.rooms.find((r) => r.id === body.room_id);
    patient.room_id = room?.id ?? null;
    patient.room_number = room?.room_number ?? "";
  }
  audit(db, viewer, "patient.update", "patients", { message: `Updated ${patient.name}'s record` }, patient.id);
  return { patient: patientOut(ctx, patient) };
});

route("DELETE", "/api/faculty/patients", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const patient = ctx.db.patients.find((p) => p.id === ctx.body?.id);
  if (!patient) return notFound("Patient not found");
  if (ctx.db.scenarios.some((s) => s.patient_id === patient.id)) {
    return json({ error: "This patient is linked to a patient case; unlink it first" }, 409);
  }
  ctx.db.patients = ctx.db.patients.filter((p) => p.id !== patient.id);
  return { success: true };
});

route("POST", "/api/faculty/patients/admission", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const patient = db.patients.find((p) => p.id === body?.id);
  if (!patient) return notFound("Patient not found");
  const now = new Date().toISOString();
  if (body?.action === "check_out") {
    if (patient.status === "discharged") return json({ error: "This patient is already checked out" }, 409);
    const room = db.rooms.find((r) => r.id === patient.room_id);
    patient.status = "discharged";
    patient.discharged_at = now;
    patient.room_id = null;
    patient.room_number = "";
    db.dischargeSummaries.push({
      id: newId(),
      patient_id: patient.id,
      admitted_at: patient.admission_date,
      discharged_at: now,
      diagnosis: patient.diagnosis,
      room_label: room ? `${room.name} · ${room.room_number}` : "—",
      vitals_digest: { readings: db.vitals.filter((v) => v.patient_id === patient.id).length, flagged: db.vitals.filter((v) => v.patient_id === patient.id && v.is_anomaly).length, critical: 0, stats: {}, findings: [] },
      ehr_digest: { tpr: 0, ivf: 0, ivf_ongoing: 0, notes: 0, notes_reviewed: 0 },
      follow_up: [],
      ai_model: null,
      ai_generated_at: null,
      created_at: now,
    });
    audit(db, viewer, "patient.check_out", "patients", { message: `Checked out ${patient.name}` }, patient.id);
  } else if (body?.action === "check_in") {
    const room = db.rooms.find((r) => r.id === body.room_id);
    if (room) {
      const occupied = db.patients.filter((p) => p.room_id === room.id && p.status === "admitted").length;
      if (occupied >= room.capacity) return json({ error: `${room.name} is full` }, 409);
    }
    patient.status = "admitted";
    patient.discharged_at = null;
    patient.admission_date = now;
    patient.room_id = room?.id ?? null;
    patient.room_number = room?.room_number ?? "";
    audit(db, viewer, "patient.check_in", "patients", { message: `Checked in ${patient.name}${room ? ` to ${room.name}` : ""}` }, patient.id);
  } else {
    return json({ error: "action must be check_in or check_out" }, 400);
  }
  return { patient: patientOut(ctx, patient) };
});

route("POST", "/api/faculty/patients/assign-rooms", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const ids: string[] = Array.isArray(body?.patient_ids) ? body.patient_ids : [];
  const rooms = db.rooms.filter((r) => r.status === "active");
  let assigned = 0;
  for (const id of ids) {
    const patient = db.patients.find((p) => p.id === id);
    if (!patient) continue;
    const free = rooms
      .map((r) => ({ r, used: db.patients.filter((p) => p.room_id === r.id && p.status === "admitted").length }))
      .filter((x) => x.used < x.r.capacity)
      .sort((a, b) => (body?.mode === "spread" ? a.used - b.used : b.used - a.used));
    if (!free[0]) break;
    patient.room_id = free[0].r.id;
    patient.room_number = free[0].r.room_number;
    assigned += 1;
  }
  return { assigned, unassigned: ids.length - assigned };
});

function vitalOut(ctx: Ctx, v: (typeof ctx.db.vitals)[number]) {
  const p = ctx.db.patients.find((x) => x.id === v.patient_id);
  const u = userById(ctx.db, v.recorded_by);
  return {
    ...v,
    patients: p ? { name: p.name, room_number: p.room_number || null } : null,
    users: u ? { name: u.name, email: u.email } : null,
  };
}

route("GET", "/api/faculty/patients/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const patient = db.patients.find((p) => p.id === ctx.params.id);
  if (!patient) return notFound("Patient not found");
  return {
    patient: patientOut(ctx, patient),
    vitals: db.vitals
      .filter((v) => v.patient_id === patient.id)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
      .map((v) => vitalOut(ctx, v)),
    tpr: [],
    ivf: [],
    notes: [],
    events: [
      ...db.audit
        .filter((r) => r.entity_id === patient.id)
        .map((r) => ({
          id: r.id,
          action: r.action,
          created_at: r.created_at,
          actor_name: userById(db, r.actor_id)?.name ?? "System",
          details: r.details,
        })),
      {
        id: `admit-${patient.id}`,
        action: "patient.check_in",
        created_at: patient.admission_date,
        actor_name: userById(db, patient.created_by)?.name ?? "System",
        details: {},
      },
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    discharge_summaries:
      patient.status === "discharged"
        ? db.dischargeSummaries.filter((d) => d.patient_id === patient.id).sort((a, b) => b.discharged_at.localeCompare(a.discharged_at))
        : [],
  };
});

route("POST", "/api/faculty/patients/discharge-summary", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const summary = ctx.db.dischargeSummaries.find((d) => d.id === ctx.body?.summary_id);
  if (!summary) return notFound("Summary not found");
  await sleep(1200);
  summary.follow_up = [
    { title: "Clinic review in one week", detail: "Recheck vital signs and confirm the presenting symptoms have resolved." },
    { title: "Medication teaching", detail: "Confirm the patient can name each discharge medicine, its dose and when to take it." },
    { title: "Return precautions", detail: "Fever above 38.5 °C, breathlessness or chest pain should prompt an immediate return." },
  ];
  summary.ai_model = "demo";
  summary.ai_generated_at = new Date().toISOString();
  return { summary };
});

route("GET", "/api/faculty/vitals", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, query } = ctx;
  return {
    readings: db.vitals
      .filter((v) => !query.get("patient_id") || v.patient_id === query.get("patient_id"))
      .filter((v) => !query.get("student_id") || v.recorded_by === query.get("student_id"))
      .filter((v) => query.get("flagged") !== "true" || v.is_anomaly)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
      .map((v) => vitalOut(ctx, v)),
  };
});

route("GET", "/api/faculty/ehr", () => ({ records: [] }));
