"use client";

import { json, ndjson, notFound, route, type DemoContext } from "../router";
import { newId, type DemoDb } from "../store";
import {
  EMPTY_ANALYSIS,
  inCurriculumOrder,
  parseCurriculumCourse,
  parseCurriculumName,
  requisiteProblem,
  roundUnits,
  sumUnits,
  type CurriculumCourseInput,
  type CurriculumCourseRow,
} from "../../curriculum";
import { demoReading, seedCurriculum, type DemoCurriculum } from "../fixtures/curriculum";
import { audit } from "./shared";

/**
 * The curriculum (migration 089), answered from the demo store in the shapes
 * the real routes return. A demo Program Chair is the same account as the demo
 * Dean, so the two share a curriculum here as well.
 */

type Ctx = DemoContext;

const forbidden = () => json({ error: "Forbidden" }, 403);
const deanLevel = (ctx: Ctx) => ctx.role === "admin";

/** A demo saved before the curriculum existed has a store without it. */
function curricula(db: DemoDb): DemoCurriculum[] {
  db.curricula ??= seedCurriculum().curricula;
  return db.curricula;
}

const own = (ctx: Ctx) => curricula(ctx.db).find((c) => c.id === ctx.params.id && c.admin_id === ctx.viewer.id);

const summary = (c: DemoCurriculum) => ({
  id: c.id,
  name: c.name,
  is_active: c.is_active,
  source_name: c.source_name,
  // A demo keeps no file, so there's no PDF to open.
  has_source: false,
  created_at: c.created_at,
});

/** The stored pair goes both ways: writes this course's requisites and fixes the other side of its co-requisites. */
function setRequisites(courses: CurriculumCourseRow[], course: CurriculumCourseRow, input: CurriculumCourseInput) {
  for (const other of courses) {
    if (other.id === course.id) continue;
    other.corequisite_ids = other.corequisite_ids.filter((id) => id !== course.id);
    if (input.corequisite_ids.includes(other.id)) other.corequisite_ids.push(course.id);
  }
  course.prerequisite_ids = input.prerequisite_ids;
  course.corequisite_ids = input.corequisite_ids;
}

function fields(input: CurriculumCourseInput) {
  const { code, title, year_level, term, lecture_units, lab_units, requisite_note } = input;
  return { code, title, year_level, term, lecture_units, lab_units, requisite_note };
}

const sameCode = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

route("GET", "/api/admin/curricula", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const rows = curricula(ctx.db)
    .filter((c) => c.admin_id === ctx.viewer.id)
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.created_at.localeCompare(a.created_at));
  return {
    curricula: rows.map((c) => ({ ...summary(c), course_count: c.courses.length, total_units: sumUnits(c.courses) })),
  };
});

route("POST", "/api/admin/curricula", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const name = parseCurriculumName(ctx.body?.name);
  if (!name.ok) return json({ error: name.error }, 400);
  const curriculum: DemoCurriculum = {
    id: newId(),
    admin_id: ctx.viewer.id,
    name: name.value,
    is_active: false,
    source_name: null,
    analysis: EMPTY_ANALYSIS,
    created_at: new Date().toISOString(),
    courses: [],
  };
  curricula(ctx.db).push(curriculum);
  audit(ctx.db, ctx.viewer, "curriculum.create", "curricula", { name: name.value }, curriculum.id);
  return json({ curriculum: { id: curriculum.id, name: curriculum.name } }, 201);
});

route("POST", "/api/admin/curricula/import", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const fileName = typeof ctx.body?.file_name === "string" ? ctx.body.file_name : "curriculum.pdf";
  const curriculum = demoReading(ctx.viewer.id, newId, fileName, new Date().toISOString());
  curricula(ctx.db).push(curriculum);
  audit(
    ctx.db,
    ctx.viewer,
    "curriculum.import",
    "curricula",
    { name: curriculum.name, file: fileName, courses: curriculum.courses.length },
    curriculum.id,
  );
  return ndjson(
    [
      { type: "progress", stage: "reading" },
      { type: "progress", stage: "analyzing" },
      { type: "progress", stage: "analyzing" },
      { type: "progress", stage: "saving" },
      { type: "result", curriculum_id: curriculum.id, name: curriculum.name, course_count: curriculum.courses.length },
    ],
    500,
  );
});

route("GET", "/api/admin/curricula/:id", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const curriculum = own(ctx);
  if (!curriculum) return notFound("Curriculum not found");
  return {
    curriculum: { ...summary(curriculum), analysis: curriculum.analysis },
    courses: inCurriculumOrder(curriculum.courses),
  };
});

route("PATCH", "/api/admin/curricula/:id", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const curriculum = own(ctx);
  if (!curriculum) return notFound("Curriculum not found");
  if (ctx.body?.name !== undefined) {
    const name = parseCurriculumName(ctx.body.name);
    if (!name.ok) return json({ error: name.error }, 400);
    audit(ctx.db, ctx.viewer, "curriculum.rename", "curricula", { from: curriculum.name, to: name.value }, curriculum.id);
    curriculum.name = name.value;
  }
  if (ctx.body?.dismiss_notes === true) curriculum.analysis = { ...curriculum.analysis, notes: [] };
  if (typeof ctx.body?.is_active === "boolean" && ctx.body.is_active !== curriculum.is_active) {
    if (ctx.body.is_active) {
      if (curriculum.courses.length === 0) return json({ error: "Add a course before using this curriculum" }, 400);
      for (const c of curricula(ctx.db)) if (c.admin_id === ctx.viewer.id) c.is_active = false;
    }
    curriculum.is_active = ctx.body.is_active;
    audit(
      ctx.db,
      ctx.viewer,
      ctx.body.is_active ? "curriculum.activate" : "curriculum.deactivate",
      "curricula",
      { name: curriculum.name },
      curriculum.id,
    );
  }
  return { success: true };
});

route("DELETE", "/api/admin/curricula/:id", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const curriculum = own(ctx);
  if (!curriculum) return notFound("Curriculum not found");
  ctx.db.curricula = curricula(ctx.db).filter((c) => c.id !== curriculum.id);
  audit(ctx.db, ctx.viewer, "curriculum.delete", "curricula", { name: curriculum.name, was_in_use: curriculum.is_active }, curriculum.id);
  return { success: true };
});

route("POST", "/api/admin/curricula/:id/courses", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const curriculum = own(ctx);
  if (!curriculum) return notFound("Curriculum not found");
  const parsed = parseCurriculumCourse(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;
  const problem = requisiteProblem(curriculum.courses, null, input.prerequisite_ids, input.corequisite_ids);
  if (problem) return json({ error: problem }, 400);
  if (curriculum.courses.some((c) => sameCode(c.code, input.code))) {
    return json({ error: `This curriculum already has a course with code ${input.code}` }, 409);
  }
  const course: CurriculumCourseRow = {
    id: newId(),
    ...fields(input),
    lecture_units: roundUnits(input.lecture_units),
    lab_units: roundUnits(input.lab_units),
    position: curriculum.courses.reduce((max, c) => Math.max(max, c.position + 1), 0),
    prerequisite_ids: [],
    corequisite_ids: [],
  };
  curriculum.courses.push(course);
  setRequisites(curriculum.courses, course, input);
  audit(ctx.db, ctx.viewer, "curriculum.course_create", "curriculum_courses", { code: input.code, title: input.title }, course.id);
  return json({ course: { id: course.id } }, 201);
});

route("PATCH", "/api/admin/curricula/:id/courses/:courseId", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const curriculum = own(ctx);
  if (!curriculum) return notFound("Curriculum not found");
  const course = curriculum.courses.find((c) => c.id === ctx.params.courseId);
  if (!course) return notFound("Course not found");
  const parsed = parseCurriculumCourse(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;
  const problem = requisiteProblem(curriculum.courses, course.id, input.prerequisite_ids, input.corequisite_ids);
  if (problem) return json({ error: problem }, 400);
  if (curriculum.courses.some((c) => c.id !== course.id && sameCode(c.code, input.code))) {
    return json({ error: `This curriculum already has a course with code ${input.code}` }, 409);
  }
  const moved = course.year_level !== input.year_level || course.term !== input.term;
  audit(
    ctx.db,
    ctx.viewer,
    "curriculum.course_update",
    "curriculum_courses",
    { from: { code: course.code, title: course.title }, to: { code: input.code, title: input.title } },
    course.id,
  );
  Object.assign(course, fields(input));
  if (moved) course.position = curriculum.courses.reduce((max, c) => Math.max(max, c.position + 1), 0);
  setRequisites(curriculum.courses, course, input);
  return { success: true };
});

route("DELETE", "/api/admin/curricula/:id/courses/:courseId", (ctx) => {
  if (!deanLevel(ctx)) return forbidden();
  const curriculum = own(ctx);
  if (!curriculum) return notFound("Curriculum not found");
  const course = curriculum.courses.find((c) => c.id === ctx.params.courseId);
  if (!course) return notFound("Course not found");
  curriculum.courses = curriculum.courses.filter((c) => c.id !== course.id);
  for (const other of curriculum.courses) {
    other.prerequisite_ids = other.prerequisite_ids.filter((id) => id !== course.id);
    other.corequisite_ids = other.corequisite_ids.filter((id) => id !== course.id);
  }
  audit(ctx.db, ctx.viewer, "curriculum.course_delete", "curriculum_courses", { code: course.code, title: course.title }, course.id);
  return { success: true };
});
