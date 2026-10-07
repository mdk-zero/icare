"use client";

import { json, notFound, route, sleep, type DemoContext } from "../router";
import { newId, type DemoDb } from "../store";
import {
  MAX_SCORE_NOTE,
  evaluate,
  isRemovedActivity,
  offeringSummary,
  parseCourse,
  parseRequirement,
  parseScore,
  parseTerm,
  requirementLabel,
  scoreBlock,
  summarize,
  termBounds,
  termStatus,
  type ProgressFacts,
  type RequirementInput,
  type RequirementNames,
  type RequirementRow,
} from "../../course-progress";
import { listSkillSummaries } from "../fixtures/skills";
import {
  GRADING_CHANGED,
  GRADING_ENDED_LOCK,
  baseMatches,
  fileItem,
  gradeLeafProblem,
  gradingSummary,
  parseGradeLeaf,
  parseGrading,
  refile,
  type GradingSplit,
} from "../../course-grading";
import { seedCourses, type DemoCourseTables, type DemoOffering } from "../fixtures/courses";
import { audit } from "./shared";
import { byName, sectionName, teamLabel } from "./scope";
import { taskCredit } from "../../task-ratings";

/**
 * Courses, terms and course assignments (migration 065), answered from the
 * demo store in the shapes the real routes return.
 */

type Ctx = DemoContext;

const forbidden = () => json({ error: "Forbidden" }, 403);
const deanOnly = (ctx: Ctx) => ctx.role === "admin";

/** A demo started before courses existed has a saved store without these tables. */
export function courseDb(db: DemoDb): DemoDb {
  if ((db as Partial<DemoCourseTables>).terms === undefined) {
    Object.assign(db, seedCourses({ users: db.users, casePresentations: db.casePresentations }));
  }
  // A demo saved before entered scores existed.
  db.requirementScores ??= [];
  // A demo saved before Written Exams (067): every manual item was a Lab Activity.
  for (const r of db.requirements) r.manual_type ??= "lab";
  return db;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The offering's students: the instructor's own group members in its sections. */
export function offeringRoster(db: DemoDb, o: DemoOffering) {
  const teams = db.teams.filter((t) => t.faculty_id && t.faculty_id === o.faculty_id && o.section_ids.includes(t.section_id));
  const teamIds = new Set(teams.map((t) => t.id));
  const covered = new Set(teams.map((t) => t.section_id));
  return {
    students: db.users.filter((u) => u.role === "student" && u.team_id && teamIds.has(u.team_id)).sort(byName),
    sectionsWithoutGroup: o.section_ids.filter((id) => !covered.has(id)),
  };
}

function offeringRow(db: DemoDb, o: DemoOffering) {
  const roster = offeringRoster(db, o);
  const without = new Set(roster.sectionsWithoutGroup);
  return {
    id: o.id,
    course_id: o.course_id,
    term_id: o.term_id,
    faculty_id: o.faculty_id,
    faculty_name: db.users.find((u) => u.id === o.faculty_id)?.name ?? null,
    sections: o.section_ids
      .map((id) => ({ id, name: sectionName(db, id) ?? "Section", has_group: !without.has(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    student_count: roster.students.length,
    requirement_count: db.requirements.filter((r) => r.offering_id === o.id).length,
  };
}

function warningsFor(db: DemoDb, o: DemoOffering) {
  const name = db.users.find((u) => u.id === o.faculty_id)?.name ?? "The instructor";
  return offeringRoster(db, o).sectionsWithoutGroup.map(
    (id) => `${name} supervises no group in ${sectionName(db, id) ?? "that section"}, so no students come from it yet.`,
  );
}

const ownCourses = (ctx: Ctx) => courseDb(ctx.db).courses.filter((c) => c.admin_id === ctx.viewer.id);
const ownTerms = (ctx: Ctx) => courseDb(ctx.db).terms.filter((t) => t.admin_id === ctx.viewer.id);
const ownOffering = (ctx: Ctx, id: string) => {
  const ids = new Set(ownCourses(ctx).map((c) => c.id));
  return ctx.db.offerings.find((o) => o.id === id && ids.has(o.course_id));
};

function requirementsOf(db: DemoDb, offeringIds: string[]) {
  const ids = new Set(offeringIds);
  const requirements = db.requirements.filter((r) => ids.has(r.offering_id));
  const reqIds = new Set(requirements.map((r) => r.id));
  // Ticks and entered scores alike, as the server's countInstructorEntries counts them.
  const checks = [...db.requirementChecks, ...(db.requirementScores ?? [])].filter((c) => reqIds.has(c.requirement_id));
  return { requirements, checks };
}

/** Removes offerings and everything hanging off them, as the database cascade would. */
function dropOfferings(db: DemoDb, offeringIds: string[]) {
  const { requirements } = requirementsOf(db, offeringIds);
  const reqIds = new Set(requirements.map((r) => r.id));
  const ids = new Set(offeringIds);
  db.requirementChecks = db.requirementChecks.filter((c) => !reqIds.has(c.requirement_id));
  db.requirementScores = db.requirementScores.filter((c) => !reqIds.has(c.requirement_id));
  db.requirements = db.requirements.filter((r) => !reqIds.has(r.id));
  db.offerings = db.offerings.filter((o) => !ids.has(o.id));
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

route("GET", "/api/admin/courses", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const courses = ownCourses(ctx).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const courseIds = new Set(courses.map((c) => c.id));
  const offerings = db.offerings.filter((o) => courseIds.has(o.course_id));
  return {
    terms: ownTerms(ctx)
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
      .map((t) => ({
        id: t.id,
        name: t.name,
        starts_on: t.starts_on,
        ends_on: t.ends_on,
        offering_count: offerings.filter((o) => o.term_id === t.id).length,
      })),
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      description: c.description,
      skill_ids: db.courseSkills.filter((s) => s.course_id === c.id).map((s) => s.skill_id),
      offering_count: offerings.filter((o) => o.course_id === c.id).length,
    })),
    offerings: offerings.map((o) => offeringRow(db, o)),
  };
});

route("POST", "/api/admin/courses", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const parsed = parseCourse(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { code, title, description } = parsed.value;
  if (ownCourses(ctx).some((c) => c.code.toLowerCase() === code.toLowerCase())) {
    return json({ error: `You already have a course with code ${code}` }, 409);
  }
  const course = { id: newId(), admin_id: ctx.viewer.id, code, title, description, created_at: new Date().toISOString() };
  db.courses.push(course);
  audit(db, ctx.viewer, "course.create", "courses", { code, title }, course.id);
  return json({ course: { id: course.id, code, title, description, skill_ids: [], offering_count: 0 } }, 201);
});

route("GET", "/api/admin/courses/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const course = ownCourses(ctx).find((c) => c.id === ctx.params.id);
  if (!course) return notFound("Course not found");
  const offeringIds = db.offerings.filter((o) => o.course_id === course.id).map((o) => o.id);
  const { requirements, checks } = requirementsOf(db, offeringIds);
  return {
    course: { id: course.id, code: course.code, title: course.title, description: course.description },
    offering_count: offeringIds.length,
    requirement_count: requirements.length,
    check_count: checks.length,
  };
});

route("PATCH", "/api/admin/courses/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const course = ownCourses(ctx).find((c) => c.id === ctx.params.id);
  if (!course) return notFound("Course not found");
  const parsed = parseCourse(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { code, title, description } = parsed.value;
  if (ownCourses(ctx).some((c) => c.id !== course.id && c.code.toLowerCase() === code.toLowerCase())) {
    return json({ error: `You already have a course with code ${code}` }, 409);
  }
  audit(db, ctx.viewer, "course.update", "courses", { from: { code: course.code, title: course.title }, to: { code, title } }, course.id);
  Object.assign(course, { code, title, description });
  return { course: { id: course.id, code, title, description } };
});

route("DELETE", "/api/admin/courses/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const course = ownCourses(ctx).find((c) => c.id === ctx.params.id);
  if (!course) return notFound("Course not found");
  const offeringIds = db.offerings.filter((o) => o.course_id === course.id).map((o) => o.id);
  const { requirements, checks } = requirementsOf(db, offeringIds);
  dropOfferings(db, offeringIds);
  db.courseSkills = db.courseSkills.filter((s) => s.course_id !== course.id);
  db.courses = db.courses.filter((c) => c.id !== course.id);
  const impact = { offering_count: offeringIds.length, requirement_count: requirements.length, check_count: checks.length };
  audit(db, ctx.viewer, "course.delete", "courses", { code: course.code, title: course.title, ...impact }, course.id);
  return { success: true, ...impact };
});

route("PUT", "/api/admin/courses/:id/skills", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const course = ownCourses(ctx).find((c) => c.id === ctx.params.id);
  if (!course) return notFound("Course not found");
  const ids: unknown = ctx.body?.skill_ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return json({ error: "skill_ids must be a list of skill ids" }, 400);
  }
  const ai = new Set<string>(Array.isArray(ctx.body?.ai_skill_ids) ? ctx.body.ai_skill_ids : []);
  const wanted = [...new Set(ids as string[])];
  const before = db.courseSkills.filter((s) => s.course_id === course.id);
  const kept = before.filter((s) => wanted.includes(s.skill_id));
  const added = wanted
    .filter((id) => !before.some((s) => s.skill_id === id))
    .map((skill_id) => ({ course_id: course.id, skill_id, source: ai.has(skill_id) ? ("ai" as const) : ("manual" as const) }));
  db.courseSkills = [...db.courseSkills.filter((s) => s.course_id !== course.id), ...kept, ...added];
  audit(db, ctx.viewer, "course.skills.update", "courses", { code: course.code, added: added.map((s) => s.skill_id) }, course.id);
  return { skill_ids: wanted };
});

/** The real route asks the AI; the demo picks from the course's subject. */
export async function demoCourseSuggestions(course: { code: string; title: string; description: string }) {
  await sleep(900);
  const text = `${course.code} ${course.title} ${course.description}`.toLowerCase();
  const picks: [string, string][] = /oxygen|respirat|airway|breath/.test(text)
    ? [
        ["14-1", "Pulse oximetry is the course's first respiratory assessment."],
        ["14-3", "Oxygen by nasal cannula is the most common delivery method taught."],
        ["14-4", "Oxygen masks follow nasal cannulas in the course's sequence."],
        ["14-6", "Oropharyngeal and nasopharyngeal suctioning keep the airway clear."],
      ]
    : [
        ["1-1", "Temperature is the first vital sign in a health assessment."],
        ["1-4", "Peripheral pulses are assessed in every head-to-toe exam."],
        ["1-6", "Respirations are part of every set of vital signs."],
        ["1-7", "Blood pressure is the course's core measurement skill."],
      ];
  return { suggestions: picks.map(([id, reason]) => ({ id, reason })), source: "ai" as const };
}

route("POST", "/api/admin/courses/:id/skills/suggest", async (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const course = ownCourses(ctx).find((c) => c.id === ctx.params.id);
  if (!course) return notFound("Course not found");
  return demoCourseSuggestions(course);
});

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

route("POST", "/api/admin/terms", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const parsed = parseTerm(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { name } = parsed.value;
  if (ownTerms(ctx).some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    return json({ error: `You already have a term named "${name}"` }, 409);
  }
  const term = { id: newId(), admin_id: ctx.viewer.id, ...parsed.value, created_at: new Date().toISOString() };
  db.terms.push(term);
  audit(db, ctx.viewer, "term.create", "academic_terms", { ...parsed.value }, term.id);
  return json({ term: { id: term.id, ...parsed.value, offering_count: 0 } }, 201);
});

function termImpact(db: DemoDb, termId: string) {
  const offeringIds = db.offerings.filter((o) => o.term_id === termId).map((o) => o.id);
  return { offering_count: offeringIds.length, requirement_count: requirementsOf(db, offeringIds).requirements.length };
}

route("GET", "/api/admin/terms/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const term = ownTerms(ctx).find((t) => t.id === ctx.params.id);
  if (!term) return notFound("Term not found");
  return {
    term: { id: term.id, name: term.name, starts_on: term.starts_on, ends_on: term.ends_on },
    ...termImpact(ctx.db, term.id),
  };
});

route("PATCH", "/api/admin/terms/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const term = ownTerms(ctx).find((t) => t.id === ctx.params.id);
  if (!term) return notFound("Term not found");
  const parsed = parseTerm(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if (ownTerms(ctx).some((t) => t.id !== term.id && t.name.toLowerCase() === parsed.value.name.toLowerCase())) {
    return json({ error: `You already have a term named "${parsed.value.name}"` }, 409);
  }
  audit(db, ctx.viewer, "term.update", "academic_terms", { from: { name: term.name }, to: parsed.value }, term.id);
  Object.assign(term, parsed.value);
  return { term: { id: term.id, ...parsed.value } };
});

route("DELETE", "/api/admin/terms/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const term = ownTerms(ctx).find((t) => t.id === ctx.params.id);
  if (!term) return notFound("Term not found");
  const impact = termImpact(db, term.id);
  dropOfferings(db, db.offerings.filter((o) => o.term_id === term.id).map((o) => o.id));
  db.terms = db.terms.filter((t) => t.id !== term.id);
  audit(db, ctx.viewer, "term.delete", "academic_terms", { name: term.name, ...impact }, term.id);
  return { success: true, ...impact };
});

// ---------------------------------------------------------------------------
// Course assignments
// ---------------------------------------------------------------------------

function checkTarget(ctx: Ctx, facultyId: unknown, sectionIds: unknown): string | null {
  if (typeof facultyId !== "string" || !facultyId) return "Choose an instructor";
  if (!Array.isArray(sectionIds) || sectionIds.length === 0) return "Choose at least one section";
  const own = ctx.db.users.some((u) => u.id === facultyId && u.role === "faculty" && u.admin_id === ctx.viewer.id);
  if (!own) return "That instructor is not one of yours";
  if (sectionIds.some((id) => !ctx.db.sections.some((s) => s.id === id))) return "One of those sections no longer exists";
  return null;
}

function notifyAssigned(ctx: Ctx, o: DemoOffering) {
  const course = ctx.db.courses.find((c) => c.id === o.course_id);
  const term = ctx.db.terms.find((t) => t.id === o.term_id);
  if (!o.faculty_id || !course) return;
  const sections = o.section_ids.map((id) => sectionName(ctx.db, id)).filter(Boolean).join(", ");
  ctx.db.notifications.unshift({
    id: newId(),
    user_id: o.faculty_id,
    type: "assignment_created",
    title: "New course assignment",
    body: `You were assigned ${course.code} ${course.title}${sections ? ` for ${sections}` : ""} (${term?.name ?? "this term"}). Set up its requirements checklist.`,
    data: { kind: "course", offeringId: o.id },
    read_at: null,
    created_at: new Date().toISOString(),
  });
}

route("POST", "/api/admin/course-offerings", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const { body } = ctx;
  const course = ownCourses(ctx).find((c) => c.id === body?.course_id);
  const term = ownTerms(ctx).find((t) => t.id === body?.term_id);
  if (!course) return json({ error: "That course is not one of yours" }, 400);
  if (!term) return json({ error: "That term is not one of yours" }, 400);
  const problem = checkTarget(ctx, body?.faculty_id, body?.section_ids);
  if (problem) return json({ error: problem }, 400);
  if (db.offerings.some((o) => o.course_id === course.id && o.term_id === term.id && o.faculty_id === body.faculty_id)) {
    const name = db.users.find((u) => u.id === body.faculty_id)?.name ?? "That instructor";
    return json({ error: `${name} already teaches ${course.code} in ${term.name}. Edit that assignment's sections instead.` }, 409);
  }
  const offering: DemoOffering = {
    id: newId(),
    course_id: course.id,
    term_id: term.id,
    faculty_id: body.faculty_id,
    section_ids: [...new Set<string>(body.section_ids)],
    created_at: new Date().toISOString(),
  };
  db.offerings.push(offering);
  notifyAssigned(ctx, offering);
  audit(db, ctx.viewer, "course.assign", "course_offerings", { course: course.code, term: term.name }, offering.id);
  return json({ offering: offeringRow(db, offering), warnings: warningsFor(db, offering) }, 201);
});

route("GET", "/api/admin/course-offerings/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const offering = ownOffering(ctx, ctx.params.id);
  if (!offering) return notFound("Course assignment not found");
  const { requirements, checks } = requirementsOf(ctx.db, [offering.id]);
  return { offering: offeringRow(ctx.db, offering), requirement_count: requirements.length, check_count: checks.length };
});

route("PATCH", "/api/admin/course-offerings/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const offering = ownOffering(ctx, ctx.params.id);
  if (!offering) return notFound("Course assignment not found");
  const problem = checkTarget(ctx, ctx.body?.faculty_id, ctx.body?.section_ids);
  if (problem) return json({ error: problem }, 400);
  const reassigned = ctx.body.faculty_id !== offering.faculty_id;
  if (
    reassigned &&
    db.offerings.some((o) => o.id !== offering.id && o.course_id === offering.course_id && o.term_id === offering.term_id && o.faculty_id === ctx.body.faculty_id)
  ) {
    return json({ error: "That instructor already teaches this course in this term." }, 409);
  }
  offering.faculty_id = ctx.body.faculty_id;
  offering.section_ids = [...new Set<string>(ctx.body.section_ids)];
  if (reassigned) notifyAssigned(ctx, offering);
  audit(db, ctx.viewer, "course.assignment.update", "course_offerings", { reassigned }, offering.id);
  return { offering: offeringRow(db, offering), warnings: warningsFor(db, offering) };
});

route("DELETE", "/api/admin/course-offerings/:id", (ctx) => {
  if (!deanOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const offering = ownOffering(ctx, ctx.params.id);
  if (!offering) return notFound("Course assignment not found");
  const { requirements, checks } = requirementsOf(db, [offering.id]);
  dropOfferings(db, [offering.id]);
  audit(db, ctx.viewer, "course.unassign", "course_offerings", { message: `Removed ${plural(requirements.length, "checklist item")}` }, offering.id);
  return { success: true, requirement_count: requirements.length, check_count: checks.length };
});

// ---------------------------------------------------------------------------
// Instructor: their course assignments and checklists
// ---------------------------------------------------------------------------

const instructorOnly = (ctx: Ctx) => ctx.role === "faculty";

function ownFacultyOffering(ctx: Ctx, id: string) {
  return courseDb(ctx.db).offerings.find((o) => o.id === id && o.faculty_id === ctx.viewer.id);
}

const termOf = (db: DemoDb, o: DemoOffering) => db.terms.find((t) => t.id === o.term_id)!;
const courseOf = (db: DemoDb, o: DemoOffering) => db.courses.find((c) => c.id === o.course_id)!;
const termRef = (db: DemoDb, o: DemoOffering) => {
  const t = termOf(db, o);
  return { id: t.id, name: t.name, starts_on: t.starts_on, ends_on: t.ends_on };
};

async function labelled(db: DemoDb, requirements: RequirementRow[]) {
  const skills = requirements.some((r) => r.skill_id) ? await listSkillSummaries() : [];
  const names: RequirementNames = {
    scenarios: Object.fromEntries(db.scenarios.map((s) => [s.id, s.title])),
    quizzes: Object.fromEntries(db.quizzes.map((q) => [q.id, q.title])),
    presentations: Object.fromEntries(db.casePresentations.map((p) => [p.id, p.title])),
    skills: Object.fromEntries(skills.map((s) => [s.id, s.title])),
  };
  return requirements.map((r) => ({ ...strip(r), label: requirementLabel(r, names), removed: isRemovedActivity(r) }));
}

/** A stored item without its demo-only bookkeeping. */
function strip(r: RequirementRow & { created_at?: string }): RequirementRow {
  const { created_at: _created, ...row } = r;
  void _created;
  return row;
}

const checklist = (db: DemoDb, offeringId: string) =>
  db.requirements.filter((r) => r.offering_id === offeringId).sort((a, b) => a.position - b.position);

const locked = (db: DemoDb, o: DemoOffering) => termStatus(termOf(db, o)) === "ended";

route("GET", "/api/faculty/courses", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const offerings = db.offerings
    .filter((o) => o.faculty_id === ctx.viewer.id)
    .map((o) => {
      const row = offeringRow(db, o);
      const course = courseOf(db, o);
      return {
        id: o.id,
        course: { id: course.id, code: course.code, title: course.title },
        term: termRef(db, o),
        sections: row.sections,
        student_count: row.student_count,
        requirement_count: row.requirement_count,
        offering: o,
      };
    })
    .sort((a, b) => b.term.starts_on.localeCompare(a.term.starts_on) || a.course.code.localeCompare(b.course.code));
  return {
    offerings: await Promise.all(
      offerings.map(async ({ offering, ...rest }) => {
        if (rest.requirement_count === 0 || rest.student_count === 0 || termStatus(rest.term) !== "current") {
          return { ...rest, progress: null };
        }
        const result = await demoProgress(db, offering);
        return { ...rest, progress: offeringSummary(result.requirements, result.students, result.progress) };
      }),
    ),
  };
});

route("GET", "/api/faculty/courses/:id", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  const course = courseOf(db, o);
  const row = offeringRow(db, o);
  const status = termStatus(termOf(db, o));
  return {
    offering: {
      id: o.id,
      course: { id: course.id, code: course.code, title: course.title, description: course.description },
      term: termRef(db, o),
      status,
      locked: status === "ended",
      sections: row.sections,
      student_count: row.student_count,
    },
    requirements: await labelled(db, checklist(db, o.id)),
    skill_ids: db.courseSkills.filter((s) => s.course_id === course.id).map((s) => s.skill_id),
    grading: o.grading ?? null,
    grading_ready: true,
  };
});

/** File a just-saved item in the offering's split, the way the real routes do. */
function refileDemo(o: DemoOffering, next: (split: GradingSplit) => GradingSplit) {
  if (o.grading) o.grading = next(o.grading);
}

route("PUT", "/api/faculty/courses/:id/grading", (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  if (locked(db, o)) return json({ error: GRADING_ENDED_LOCK }, 409);
  const items = checklist(db, o.id);
  if (!baseMatches(ctx.body?.base, o.grading ?? null, items)) return json({ error: GRADING_CHANGED }, 409);
  const parsed = parseGrading(ctx.body ?? {}, items);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  o.grading = parsed.value;
  audit(db, ctx.viewer, "course.grading.update", "course_offerings", { split: gradingSummary(parsed.value) }, o.id);
  return { grading: parsed.value };
});

route("GET", "/api/faculty/courses/:id/activities", (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  const roster = new Set(offeringRoster(db, o).students.map((s) => s.id));
  const from = new Date(termBounds(termOf(db, o)).from).getTime();
  return {
    scenarios: db.scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      completed_before_term: db.assignments.filter(
        (a) =>
          a.scenario_id === s.id &&
          roster.has(a.student_id) &&
          a.status === "completed" &&
          a.completed_at !== null &&
          new Date(a.completed_at).getTime() < from,
      ).length,
    })),
    quizzes: db.quizzes.filter((q) => q.is_published).map((q) => ({ id: q.id, title: q.title })),
    presentations: db.casePresentations
      .filter((p) => p.created_by === ctx.viewer.id || p.section_ids.some((s) => o.section_ids.includes(s)))
      .map((p) => ({ id: p.id, title: p.title })),
  };
});

/** The demo's version of checkRequirementLinks. */
function linkProblem(db: DemoDb, o: DemoOffering, input: RequirementInput): string | null {
  if (input.scenario_id && !db.scenarios.some((s) => s.id === input.scenario_id)) return "That Patient Case was not found";
  if (input.assessment_id && !db.quizzes.some((q) => q.id === input.assessment_id)) return "That Quiz was not found";
  if (input.presentation_id && !db.casePresentations.some((p) => p.id === input.presentation_id)) {
    return "That Case Presentation was not found";
  }
  if (input.skill_id && !db.courseSkills.some((s) => s.course_id === o.course_id && s.skill_id === input.skill_id)) {
    return `Add skill ${input.skill_id} to the course's skill list first`;
  }
  return null;
}

const LOCKED = "This term has ended, so its checklist is locked. Scores and ticks can still be changed.";

route("POST", "/api/faculty/courses/:id/requirements", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  if (locked(db, o)) return json({ error: LOCKED }, 409);
  const parsed = parseRequirement(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const leaf = parseGradeLeaf(ctx.body?.grade_leaf_id);
  if (!leaf.ok) return json({ error: leaf.error }, 400);
  const problem =
    linkProblem(db, o, parsed.value) ?? (typeof leaf.value === "string" ? gradeLeafProblem(o.grading ?? null, leaf.value) : null);
  if (problem) return json({ error: problem }, 400);
  const items = checklist(db, o.id);
  const row = {
    ...parsed.value,
    id: newId(),
    offering_id: o.id,
    position: items.reduce((max, r) => Math.max(max, r.position + 1), 0),
    created_at: new Date().toISOString(),
  };
  db.requirements.push(row);
  refileDemo(o, (split) => refile(split, row, leaf.value));
  const [requirement] = await labelled(db, [row]);
  audit(db, ctx.viewer, "course.requirement.create", "course_requirements", { label: requirement.label }, row.id);
  return json({ requirement }, 201);
});

route("PUT", "/api/faculty/courses/:id/requirements/order", (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  if (locked(db, o)) return json({ error: LOCKED }, 409);
  const ids: unknown = ctx.body?.ids;
  const items = checklist(db, o.id);
  if (!Array.isArray(ids) || ids.length !== items.length || items.some((r) => !ids.includes(r.id))) {
    return json({ error: "The checklist changed; reload and try again" }, 400);
  }
  for (const r of items) r.position = ids.indexOf(r.id);
  return { ids };
});

route("PATCH", "/api/faculty/courses/:id/requirements/:requirementId", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  if (locked(db, o)) return json({ error: LOCKED }, 409);
  const current = checklist(db, o.id).find((r) => r.id === ctx.params.requirementId);
  if (!current) return notFound("Requirement not found");
  const parsed = parseRequirement(ctx.body ?? {});
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const leaf = parseGradeLeaf(ctx.body?.grade_leaf_id);
  if (!leaf.ok) return json({ error: leaf.error }, 400);
  const problem =
    linkProblem(db, o, parsed.value) ?? (typeof leaf.value === "string" ? gradeLeafProblem(o.grading ?? null, leaf.value) : null);
  if (problem) return json({ error: problem }, 400);
  Object.assign(current, parsed.value);
  refileDemo(o, (split) => refile(split, current, leaf.value));
  const [requirement] = await labelled(db, [current]);
  audit(db, ctx.viewer, "course.requirement.update", "course_requirements", { label: requirement.label }, current.id);
  return { requirement };
});

route("DELETE", "/api/faculty/courses/:id/requirements/:requirementId", (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  if (locked(db, o)) return json({ error: LOCKED }, 409);
  const id = ctx.params.requirementId;
  if (!checklist(db, o.id).some((r) => r.id === id)) return notFound("Requirement not found");
  db.requirements = db.requirements.filter((r) => r.id !== id);
  db.requirementChecks = db.requirementChecks.filter((c) => c.requirement_id !== id);
  db.requirementScores = db.requirementScores.filter((c) => c.requirement_id !== id);
  refileDemo(o, (split) => fileItem(split, id, null));
  audit(db, ctx.viewer, "course.requirement.delete", "course_requirements", {}, id);
  return { success: true };
});

route("PUT", "/api/faculty/courses/:id/skills", (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  const ids: unknown = ctx.body?.skill_ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return json({ error: "skill_ids must be a list of skill ids" }, 400);
  }
  const ai = new Set<string>(Array.isArray(ctx.body?.ai_skill_ids) ? ctx.body.ai_skill_ids : []);
  const wanted = [...new Set(ids as string[])];
  const before = db.courseSkills.filter((s) => s.course_id === o.course_id);
  const kept = before.filter((s) => wanted.includes(s.skill_id));
  const added = wanted
    .filter((id) => !before.some((s) => s.skill_id === id))
    .map((skill_id) => ({ course_id: o.course_id, skill_id, source: ai.has(skill_id) ? ("ai" as const) : ("manual" as const) }));
  db.courseSkills = [...db.courseSkills.filter((s) => s.course_id !== o.course_id), ...kept, ...added];
  audit(db, ctx.viewer, "course.skills.update", "courses", { added: added.map((s) => s.skill_id) }, o.course_id);
  return { skill_ids: wanted };
});

route("POST", "/api/faculty/courses/:id/skills/suggest", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  return demoCourseSuggestions(courseOf(db, o));
});

// ---------------------------------------------------------------------------
// Instructor: progress (the same evaluate() the server runs)
// ---------------------------------------------------------------------------

/** The demo store's graded work, shaped as the server's loadProgressFacts() shapes it. */
function demoFacts(db: DemoDb, studentIds: string[], requirementIds: string[]): ProgressFacts {
  const students = new Set(studentIds);
  const reqs = new Set(requirementIds);
  const skillTasks = db.tasks.filter((t) => t.skill_id);
  const cases = db.assignments
    .filter((a) => students.has(a.student_id) && a.status === "completed" && a.completed_at)
    .map((a) => ({
      student_id: a.student_id,
      scenario_id: a.scenario_id,
      score: a.score,
      completed_at: a.completed_at!,
      skills: skillTasks
        .filter((t) => t.scenario_id === a.scenario_id)
        .map((t) => {
          const steps = db.steps.filter((s) => s.task_id === t.id);
          const stepIds = new Set(steps.map((s) => s.id));
          const ratings = db.stepRatings.filter((r) => r.assignment_id === a.id && stepIds.has(r.step_id)).map((r) => r.rating);
          const completion = db.completions.find((c) => c.assignment_id === a.id && c.task_id === t.id);
          return { skill_id: t.skill_id!, credit: taskCredit(completion, { total: steps.length, ratings }) };
        }),
    }));
  const attempts = db.attempts
    .filter((a) => students.has(a.student_id) && a.status === "submitted" && a.submitted_at)
    .map((a) => ({ student_id: a.student_id, assessment_id: a.assessment_id, score: a.score, submitted_at: a.submitted_at!, skill_scores: {} }));
  const presentations = db.caseSubmissions
    .filter((c) => students.has(c.student_id) && c.status === "graded" && c.graded_at)
    .map((c) => ({ student_id: c.student_id, presentation_id: c.presentation_id, score: c.score, graded_at: c.graded_at! }));
  const scheduled = new Map(db.shifts.filter((s) => s.status === "scheduled").map((s) => [s.id, s.starts_at]));
  const shifts = db.shiftEntries
    .filter((e) => students.has(e.student_id) && (e.attendance_status === "present" || e.attendance_status === "late") && scheduled.has(e.shift_id))
    .map((e) => ({ student_id: e.student_id, starts_at: scheduled.get(e.shift_id)! }));
  const checks = db.requirementChecks.filter((c) => reqs.has(c.requirement_id) && students.has(c.student_id));
  const scores = db.requirementScores.filter((c) => reqs.has(c.requirement_id) && students.has(c.student_id));
  return { cases, attempts, quizSkills: {}, presentations, shifts, checks, scores };
}

async function demoProgress(db: DemoDb, o: DemoOffering, onlyStudentId?: string) {
  const items = checklist(db, o.id);
  const roster = offeringRoster(db, o).students.filter((s) => !onlyStudentId || s.id === onlyStudentId);
  const ids = roster.map((s) => s.id);
  const term = termOf(db, o);
  const skills = db.courseSkills.filter((s) => s.course_id === o.course_id).map((s) => s.skill_id);
  const progress = evaluate(items, skills, term, ids, demoFacts(db, ids, items.map((r) => r.id)));
  return {
    requirements: await labelled(db, items),
    students: roster.map((s) => ({
      id: s.id,
      name: s.name,
      picture_url: s.picture_url,
      sex: s.sex,
      section_id: s.section_id ?? "",
      team_id: s.team_id ?? "",
      group_label: teamLabel(db, s.team_id) ?? "",
      ...summarize(progress[s.id], items),
    })),
    progress,
    totals: Object.fromEntries(items.map((r) => [r.id, ids.filter((id) => progress[id]?.[r.id]?.done).length])),
  };
}

const offeringHeader = (db: DemoDb, o: DemoOffering) => {
  const course = courseOf(db, o);
  return {
    id: o.id,
    course: { id: course.id, code: course.code, title: course.title },
    term: termRef(db, o),
    status: termStatus(termOf(db, o)),
  };
};

route("GET", "/api/faculty/courses/:id/progress", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  return { offering: offeringHeader(db, o), ...(await demoProgress(db, o)), grading: o.grading ?? null, grading_ready: true };
});

route("POST", "/api/faculty/courses/:id/requirements/:requirementId/checks", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  const requirement = checklist(db, o.id).find((r) => r.id === ctx.params.requirementId);
  if (!requirement) return notFound("Requirement not found");
  const { student_id: studentId, checked } = ctx.body ?? {};
  const note = typeof ctx.body?.note === "string" ? ctx.body.note.trim() : "";
  if (typeof checked !== "boolean") return json({ error: "checked must be true or false" }, 400);
  if (!offeringRoster(db, o).students.some((s) => s.id === studentId)) return notFound("Student not found");
  if (checked && requirement.kind !== "manual" && !note) {
    return json({ error: "Say why it is done: a note is needed to mark an automatic item done" }, 400);
  }
  db.requirementChecks = db.requirementChecks.filter((c) => !(c.requirement_id === requirement.id && c.student_id === studentId));
  if (checked) {
    db.requirementChecks.push({ requirement_id: requirement.id, student_id: studentId, checked_by: ctx.viewer.id, checked_at: new Date().toISOString(), note });
  }
  audit(db, ctx.viewer, checked ? "course.requirement.check" : "course.requirement.uncheck", "course_requirements", { student: studentId }, requirement.id);
  const result = await demoProgress(db, o, studentId);
  return { progress: result.progress[studentId][requirement.id] };
});

route("POST", "/api/faculty/courses/:id/requirements/:requirementId/scores", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  const requirement = checklist(db, o.id).find((r) => r.id === ctx.params.requirementId);
  if (!requirement) return notFound("Requirement not found");
  const studentId = ctx.body?.student_id;
  const score = parseScore(ctx.body?.score);
  const note = typeof ctx.body?.note === "string" ? ctx.body.note.trim() : "";
  if (score === null) return json({ error: "The score must be a number from 0 to 100" }, 400);
  if (note.length > MAX_SCORE_NOTE) return json({ error: `The note is too long (max ${MAX_SCORE_NOTE} characters)` }, 400);
  if (typeof studentId !== "string" || !offeringRoster(db, o).students.some((s) => s.id === studentId)) return notFound("Student not found");
  const before = (await demoProgress(db, o, studentId)).progress[studentId][requirement.id];
  const blocked = scoreBlock(requirement, before);
  if (blocked) return json({ error: blocked }, 400);
  // One score per student, except on a count, where each is a piece of work.
  if (requirement.kind !== "count") {
    db.requirementScores = db.requirementScores.filter((x) => !(x.requirement_id === requirement.id && x.student_id === studentId));
  }
  db.requirementScores.push({
    id: newId(),
    requirement_id: requirement.id,
    student_id: studentId,
    score,
    note,
    entered_by: ctx.viewer.id,
    entered_at: new Date().toISOString(),
  });
  audit(db, ctx.viewer, "course.requirement.score", "course_requirements", { student: studentId, score }, requirement.id);
  const result = await demoProgress(db, o, studentId);
  return { progress: result.progress[studentId][requirement.id] };
});

route("DELETE", "/api/faculty/courses/:id/requirements/:requirementId/scores/:scoreId", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const o = ownFacultyOffering(ctx, ctx.params.id);
  if (!o) return notFound("Course not found");
  const requirement = checklist(db, o.id).find((r) => r.id === ctx.params.requirementId);
  if (!requirement) return notFound("Requirement not found");
  const row = db.requirementScores.find((x) => x.id === ctx.params.scoreId && x.requirement_id === requirement.id);
  if (!row) return notFound("Score not found");
  db.requirementScores = db.requirementScores.filter((x) => x.id !== row.id);
  audit(db, ctx.viewer, "course.requirement.score_remove", "course_requirements", { student: row.student_id, score: row.score }, requirement.id);
  const result = await demoProgress(db, o, row.student_id);
  return { progress: result.progress[row.student_id][requirement.id] };
});

route("GET", "/api/faculty/students/:id/requirements", async (ctx) => {
  if (!instructorOnly(ctx)) return forbidden();
  const db = courseDb(ctx.db);
  const studentId = ctx.params.id;
  const courses = [];
  for (const o of db.offerings.filter((x) => x.faculty_id === ctx.viewer.id)) {
    if (!offeringRoster(db, o).students.some((s) => s.id === studentId)) continue;
    const result = await demoProgress(db, o, studentId);
    const row = result.students[0];
    courses.push({
      offering: offeringHeader(db, o),
      requirements: result.requirements,
      progress: result.progress[studentId] ?? {},
      done: row?.done ?? 0,
      total: row?.total ?? 0,
    });
  }
  const order = { current: 0, upcoming: 1, ended: 2 } as const;
  courses.sort((a, b) => order[a.offering.status] - order[b.offering.status] || b.offering.term.starts_on.localeCompare(a.offering.term.starts_on));
  return { courses };
});
