"use client";

import { json, notFound, route, sleep, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoQuiz } from "../fixtures/school";
import { SKILL_QUESTIONS } from "@/scripts/data/skill-questions";
import { audit } from "./shared";
import { byName, sectionName, teamLabel, visibleSections, visibleStudents } from "./scope";

/** Quizzes (skill assessments): the builder, publishing, assigning and results. */

type Ctx = DemoContext;

const staffOnly = (ctx: Ctx) => ctx.role === "faculty" || ctx.role === "admin";
const forbidden = () => json({ error: "Forbidden" }, 403);

function scopedIds(ctx: Ctx) {
  return new Set(visibleStudents(ctx.db, ctx.role, ctx.viewer.id).map((s) => s.id));
}

function canEdit(ctx: Ctx, quiz: DemoQuiz) {
  if (quiz.created_by === ctx.viewer.id) return true;
  if (ctx.role === "admin") {
    const owner = ctx.db.users.find((u) => u.id === quiz.created_by);
    return !owner || owner.admin_id === ctx.viewer.id;
  }
  return false;
}

const NOT_YOURS = () => json({ error: "Only the instructor who created this assessment can change it." }, 403);

function questionsOf(ctx: Ctx, quizId: string) {
  return ctx.db.questions.filter((q) => q.assessment_id === quizId).sort((a, b) => a.position - b.position);
}

/** lib/assessment-validation.ts assessmentPublishBlockers, over the demo tables. */
function publishBlockers(ctx: Ctx, quiz: DemoQuiz, totalOverride?: number | null) {
  const criteria = ctx.db.criteria.filter((c) => c.assessment_id === quiz.id);
  const questions = questionsOf(ctx, quiz.id);
  const blockers: { code: string; message: string }[] = [];
  if (questions.length === 0) return [{ code: "no_questions", message: "Cannot publish an assessment with no questions" }];
  if (criteria.length === 0) {
    return [{ code: "no_criteria", message: "Add at least one criterion before publishing — questions are organised by criterion." }];
  }
  const weight = Math.round(criteria.reduce((sum, c) => sum + Number(c.weight), 0) * 100) / 100;
  if (weight !== 100) blockers.push({ code: "weights", message: `Criteria weights must total 100% (currently ${weight}%).` });
  const unassigned = questions.filter((q) => !q.criteria_id);
  if (unassigned.length > 0) {
    blockers.push({
      code: "unassigned_questions",
      message: `${unassigned.length} question${unassigned.length === 1 ? " is" : "s are"} not assigned to a criterion. Unassigned questions are never served.`,
    });
  }
  const poolOf = (id: string) => questions.filter((q) => q.criteria_id === id).length;
  for (const c of criteria) {
    if (poolOf(c.id) < c.min_questions) {
      blockers.push({
        code: "criterion_below_min",
        message: `"${c.name}" needs at least ${c.min_questions} question${c.min_questions === 1 ? "" : "s"} but has ${poolOf(c.id)}.`,
      });
    }
  }
  const total = totalOverride !== undefined ? totalOverride : quiz.total_questions;
  if (total != null) {
    const servable = questions.length - unassigned.length;
    if (total > servable) {
      blockers.push({
        code: "total_exceeds_bank",
        message: `Each attempt is set to serve ${total} questions but only ${servable} ${servable === 1 ? "is" : "are"} assigned to a criterion.`,
      });
    }
    const minimum = criteria.reduce((sum, c) => sum + Math.min(c.min_questions, poolOf(c.id)), 0);
    if (minimum > total) {
      blockers.push({
        code: "minimums_exceed_total",
        message: `Criteria minimums add up to ${minimum} questions, more than the ${total} each attempt serves.`,
      });
    }
  }
  return blockers;
}

route("GET", "/api/faculty/assessments", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const ids = scopedIds(ctx);
  return {
    assessments: ctx.db.quizzes
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((q) => ({
        ...q,
        question_count: ctx.db.questions.filter((x) => x.assessment_id === q.id).length,
        student_count: ctx.db.quizAssignments.filter((a) => a.assessment_id === q.id && ids.has(a.student_id)).length,
      })),
  };
});

route("POST", "/api/faculty/assessments", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return json({ error: "Title is required" }, 400);
  const limit = body?.time_limit_seconds == null ? null : Number(body.time_limit_seconds);
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) return json({ error: "Invalid time limit" }, 400);
  const attempts = body?.max_attempts == null || body.max_attempts === "" ? 2 : Number(body.max_attempts);
  if (!Number.isInteger(attempts) || attempts < 1) return json({ error: "Attempts allowed must be a whole number, at least 1" }, 400);
  const now = new Date().toISOString();
  const quiz: DemoQuiz = {
    id: newId(),
    created_by: viewer.id,
    title,
    description: typeof body?.description === "string" ? body.description.trim() : "",
    category: typeof body?.category === "string" && body.category ? body.category : "General",
    time_limit_seconds: limit,
    is_published: false,
    is_ai_generated: false,
    target_sections: Array.isArray(body?.target_sections) ? body.target_sections : [],
    total_questions: null,
    max_attempts: attempts,
    created_at: now,
    updated_at: now,
    scenario_id: null,
  };
  db.quizzes.push(quiz);
  audit(db, viewer, "assessment.create", "assessments", { message: `Created quiz “${title}”` }, quiz.id);
  return json({ assessment: quiz }, 201);
});

route("GET", "/api/faculty/assessments/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const quiz = ctx.db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  return {
    assessment: { ...quiz, questions: questionsOf(ctx, quiz.id) },
    blockers: publishBlockers(ctx, quiz),
  };
});

route("PATCH", "/api/faculty/assessments/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const quiz = db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  if (!canEdit(ctx, quiz)) return NOT_YOURS();
  const updates: Partial<DemoQuiz> = {};
  if (body?.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) return json({ error: "Invalid title" }, 400);
    updates.title = body.title.trim();
  }
  if (body?.description !== undefined) updates.description = typeof body.description === "string" ? body.description.trim() : "";
  if (body?.category !== undefined) updates.category = body.category;
  if (body?.time_limit_seconds !== undefined) {
    const t = body.time_limit_seconds === null ? null : Number(body.time_limit_seconds);
    if (t !== null && (!Number.isInteger(t) || t <= 0)) return json({ error: "Invalid time limit" }, 400);
    updates.time_limit_seconds = t;
  }
  if (body?.is_published !== undefined) {
    if (typeof body.is_published !== "boolean") return json({ error: "Invalid is_published" }, 400);
    updates.is_published = body.is_published;
  }
  if (body?.target_sections !== undefined) {
    if (!Array.isArray(body.target_sections)) return json({ error: "Invalid target_sections" }, 400);
    updates.target_sections = [...new Set((body.target_sections as string[]).map((s) => s.trim()).filter(Boolean))];
  }
  if (body?.total_questions !== undefined) {
    const n = body.total_questions === null ? null : Number(body.total_questions);
    if (n !== null && (!Number.isInteger(n) || n <= 0)) return json({ error: "Questions per attempt must be a positive whole number" }, 400);
    updates.total_questions = n;
  }
  if (body?.max_attempts !== undefined) {
    const n = Number(body.max_attempts);
    if (!Number.isInteger(n) || n < 1) return json({ error: "Attempts allowed must be a whole number, at least 1" }, 400);
    updates.max_attempts = n;
  }
  if (Object.keys(updates).length === 0) return json({ error: "No valid fields to update" }, 400);
  if (updates.is_published === true) {
    const blockers = publishBlockers(ctx, quiz, "total_questions" in updates ? updates.total_questions : undefined);
    if (blockers.length > 0) return json({ error: blockers[0].message, blockers }, 400);
  }
  Object.assign(quiz, updates, { updated_at: new Date().toISOString() });
  audit(
    db,
    viewer,
    updates.is_published === true ? "assessment.publish" : updates.is_published === false ? "assessment.unpublish" : "assessment.update",
    "assessments",
    { message: `${updates.is_published === true ? "Published" : updates.is_published === false ? "Unpublished" : "Edited"} quiz “${quiz.title}”` },
    quiz.id,
  );
  return { assessment: quiz };
});

route("DELETE", "/api/faculty/assessments/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, viewer } = ctx;
  const quiz = db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  if (!canEdit(ctx, quiz)) return NOT_YOURS();
  db.quizzes = db.quizzes.filter((q) => q.id !== quiz.id);
  db.questions = db.questions.filter((q) => q.assessment_id !== quiz.id);
  db.criteria = db.criteria.filter((c) => c.assessment_id !== quiz.id);
  db.quizAssignments = db.quizAssignments.filter((a) => a.assessment_id !== quiz.id);
  db.attempts = db.attempts.filter((a) => a.assessment_id !== quiz.id);
  audit(db, viewer, "assessment.delete", "assessments", { message: `Deleted quiz “${quiz.title}”` }, quiz.id);
  return { ok: true };
});

// --- Criteria ------------------------------------------------------------------

route("GET", "/api/faculty/assessments/:id/criteria", (ctx) => ({
  criteria: ctx.db.criteria.filter((c) => c.assessment_id === ctx.params.id).sort((a, b) => a.sort_order - b.sort_order),
}));

route("POST", "/api/faculty/assessments/:id/criteria", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const quiz = db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  if (!canEdit(ctx, quiz)) return NOT_YOURS();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "Criteria name is required" }, 400);
  if (typeof body?.weight !== "number" || body.weight <= 0 || body.weight > 100) {
    return json({ error: "Weight must be between 0 and 100" }, 400);
  }
  if (typeof body?.competency_id !== "string" || !body.competency_id.trim()) {
    return json({ error: "A skill area is required" }, 400);
  }
  const min = body?.min_questions === undefined ? 1 : Number(body.min_questions);
  const criterion = {
    id: newId(),
    assessment_id: quiz.id,
    name,
    weight: body.weight,
    competency_id: body.competency_id,
    sort_order: typeof body?.sort_order === "number" ? body.sort_order : 0,
    min_questions: Number.isInteger(min) && min >= 0 ? min : 1,
    created_at: new Date().toISOString(),
  };
  db.criteria.push(criterion);
  return json({ criteria: criterion }, 201);
});

route("PATCH", "/api/faculty/assessment-criteria/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const c = db.criteria.find((x) => x.id === ctx.params.id);
  if (!c) return notFound("Criteria not found");
  const quiz = db.quizzes.find((q) => q.id === c.assessment_id);
  if (quiz && !canEdit(ctx, quiz)) return NOT_YOURS();
  if (typeof body?.name === "string" && body.name.trim()) c.name = body.name.trim();
  if (typeof body?.weight === "number") c.weight = body.weight;
  if (typeof body?.competency_id === "string") c.competency_id = body.competency_id;
  if (typeof body?.sort_order === "number") c.sort_order = body.sort_order;
  if (body?.min_questions !== undefined) c.min_questions = Number(body.min_questions) || 0;
  return { criteria: c };
});

route("DELETE", "/api/faculty/assessment-criteria/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const c = db.criteria.find((x) => x.id === ctx.params.id);
  if (!c) return notFound("Criteria not found");
  const quiz = db.quizzes.find((q) => q.id === c.assessment_id);
  if (quiz && !canEdit(ctx, quiz)) return NOT_YOURS();
  db.criteria = db.criteria.filter((x) => x.id !== c.id);
  for (const q of db.questions) if (q.criteria_id === c.id) q.criteria_id = null;
  return { success: true };
});

// --- Questions -------------------------------------------------------------------

function parseQuestion(body: Record<string, unknown> | undefined) {
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return { error: "Question content is required" };
  const options = Array.isArray(body?.options)
    ? (body.options as unknown[]).filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    : [];
  const type = typeof body?.question_type === "string" ? body.question_type : "multiple_choice";
  if (type === "multiple_choice" && options.length < 2) return { error: "At least two options are required" };
  const correct = Number(body?.correct_index ?? 0);
  if (!Number.isInteger(correct) || correct < 0 || (options.length > 0 && correct >= options.length)) {
    return { error: "Invalid correct answer index" };
  }
  return {
    question: {
      content,
      options,
      correct_index: correct,
      question_type: type,
      points: Number(body?.points) || 10,
      explanation: typeof body?.explanation === "string" ? body.explanation.trim() : "",
      criteria_id: typeof body?.criteria_id === "string" && body.criteria_id ? body.criteria_id : null,
      competency_ids: Array.isArray(body?.competency_ids) ? (body.competency_ids as string[]) : [],
    },
  };
}

route("POST", "/api/faculty/assessments/:id/questions", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const quiz = db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  if (!canEdit(ctx, quiz)) return NOT_YOURS();
  const parsed = parseQuestion(body);
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  const question = {
    id: newId(),
    assessment_id: quiz.id,
    position: questionsOf(ctx, quiz.id).length + 1,
    ...parsed.question!,
  };
  db.questions.push(question);
  return json({ question }, 201);
});

route("PATCH", "/api/faculty/questions/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const q = db.questions.find((x) => x.id === ctx.params.id);
  if (!q) return notFound("Question not found");
  const quiz = db.quizzes.find((x) => x.id === q.assessment_id);
  if (quiz && !canEdit(ctx, quiz)) return NOT_YOURS();
  for (const key of ["content", "options", "correct_index", "question_type", "points", "explanation", "criteria_id", "competency_ids", "position"] as const) {
    if (body && key in body) (q as unknown as Record<string, unknown>)[key] = body[key];
  }
  return { ok: true };
});

route("DELETE", "/api/faculty/questions/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const q = db.questions.find((x) => x.id === ctx.params.id);
  if (!q) return notFound("Question not found");
  const quiz = db.quizzes.find((x) => x.id === q.assessment_id);
  if (quiz && !canEdit(ctx, quiz)) return NOT_YOURS();
  db.questions = db.questions.filter((x) => x.id !== q.id);
  return { ok: true };
});

/** "AI" questions: drafts drawn from the Taylor's question bank for the chosen skill. */
route("POST", "/api/faculty/assessments/:id/questions/generate", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { body } = ctx;
  await sleep(1400);
  const count = Math.max(1, Math.min(20, Number(body?.count) || 5));
  const skill = typeof body?.skill_id === "string" && SKILL_QUESTIONS[body.skill_id] ? body.skill_id : null;
  const pool = skill ? SKILL_QUESTIONS[skill] : Object.values(SKILL_QUESTIONS).flat();
  return {
    questions: pool.slice(0, count).map((q) => ({
      content: q.content,
      options: q.options,
      correct_index: q.correct_index,
      question_type: "multiple_choice",
      points: 10,
      explanation: q.explanation,
      competency_ids: [],
      criteria_id: null,
    })),
  };
});

route("POST", "/api/faculty/assessments/:id/questions/generate-from-lesson", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const quiz = db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  await sleep(1800);
  const count = Math.max(1, Math.min(20, Number(ctx.body?.count) || 5));
  const pool = Object.values(SKILL_QUESTIONS).flat();
  pool.slice(0, count).forEach((q, i) => {
    db.questions.push({
      id: newId(),
      assessment_id: quiz.id,
      position: questionsOf(ctx, quiz.id).length + i + 1,
      content: q.content,
      options: q.options,
      correct_index: q.correct_index,
      question_type: "multiple_choice",
      points: 10,
      explanation: q.explanation,
      criteria_id: null,
      competency_ids: [],
    });
  });
  return { saved: count };
});

// --- Assigning and results -----------------------------------------------------------

route("POST", "/api/faculty/assessments/:id/assign", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const quiz = db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  const sectionIds: string[] = Array.isArray(body?.section_ids) ? body.section_ids : [];
  const studentIds: string[] = Array.isArray(body?.student_ids) ? body.student_ids : [];
  if (sectionIds.length === 0 && studentIds.length === 0) return json({ error: "Select at least one section" }, 400);
  const own = new Set(visibleSections(db, ctx.role, viewer.id).map((s) => s.id));
  const outside = sectionIds.filter((id) => !own.has(id));
  if (outside.length > 0) return json({ error: "You can only assign to sections you handle", invalid: outside }, 403);
  const scope = scopedIds(ctx);
  const targets = new Set([
    ...studentIds.filter((id) => scope.has(id)),
    ...db.users.filter((u) => u.role === "student" && u.section_id && sectionIds.includes(u.section_id) && scope.has(u.id)).map((u) => u.id),
  ]);
  const deadline = typeof body?.deadline === "string" && body.deadline ? new Date(body.deadline).toISOString() : null;
  const already = new Set(db.quizAssignments.filter((a) => a.assessment_id === quiz.id).map((a) => a.student_id));
  for (const id of targets) {
    if (already.has(id)) continue;
    db.quizAssignments.push({
      id: newId(),
      assessment_id: quiz.id,
      student_id: id,
      assigned_by: viewer.id,
      assigned_at: new Date().toISOString(),
      deadline,
      status: "pending",
      required: body?.required !== false,
    });
  }
  const names = sectionIds.map((id) => sectionName(db, id)).filter((n): n is string => Boolean(n));
  const added = names.filter((n) => !quiz.target_sections.includes(n));
  quiz.target_sections = [...quiz.target_sections, ...added];
  if (body?.max_attempts) quiz.max_attempts = Number(body.max_attempts);
  audit(db, viewer, "assessment.assign", "assessments", { message: `Assigned “${quiz.title}” to ${names.join(", ") || `${targets.size} student(s)`}` }, quiz.id);
  return { success: true, student_count: targets.size, added_sections: added };
});

route("GET", "/api/faculty/assessments/:id/results", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const quiz = db.quizzes.find((q) => q.id === ctx.params.id);
  if (!quiz) return notFound("Assessment not found");
  const scope = visibleStudents(db, ctx.role, ctx.viewer.id);
  const assigned = new Set(db.quizAssignments.filter((a) => a.assessment_id === quiz.id).map((a) => a.student_id));
  const attemptsOf = (id: string) => db.attempts.filter((a) => a.assessment_id === quiz.id && a.student_id === id);
  const hasAssignments = scope.some((s) => assigned.has(s.id));
  const inScope = scope
    .filter((s) => {
      if (assigned.has(s.id) || attemptsOf(s.id).length > 0) return true;
      if (hasAssignments) return false;
      if (quiz.target_sections.length === 0) return true;
      return quiz.target_sections.includes(sectionName(db, s.section_id) ?? "");
    })
    .sort(byName);
  const results = inScope.map((s) => {
    const attempts = attemptsOf(s.id);
    const submitted = attempts
      .filter((a) => a.status === "submitted")
      .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
    const latest = submitted[0] ?? null;
    const scores = submitted.map((a) => a.score).filter((x): x is number => x !== null);
    return {
      student_id: s.id,
      name: s.name,
      email: s.email,
      picture_url: s.picture_url,
      sex: s.sex,
      section: sectionName(db, s.section_id),
      team_id: s.team_id,
      team_label: teamLabel(db, s.team_id),
      status: submitted.length ? "submitted" : attempts.some((a) => a.status === "in_progress") ? "in_progress" : "not_started",
      attempt_count: attempts.length,
      submitted_count: submitted.length,
      best_score: scores.length ? Math.max(...scores) : null,
      latest_score: latest?.score ?? null,
      latest_submitted_at: latest?.submitted_at ?? null,
      latest_time_taken_seconds: latest?.time_taken_seconds ?? null,
      latest_late: Boolean(quiz.time_limit_seconds && latest?.time_taken_seconds && latest.time_taken_seconds > quiz.time_limit_seconds),
    };
  });
  const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const groups = new Map<string, typeof results>();
  for (const r of results) if (r.team_id) groups.set(r.team_id, [...(groups.get(r.team_id) ?? []), r]);
  const graded = results.map((r) => r.best_score).filter((x): x is number => x !== null);
  return {
    assessment: {
      id: quiz.id,
      title: quiz.title,
      total_questions: quiz.total_questions,
      max_attempts: quiz.max_attempts,
      target_sections: quiz.target_sections,
      is_published: quiz.is_published,
      time_limit_seconds: quiz.time_limit_seconds,
    },
    results,
    audience: hasAssignments ? "assigned" : "visibility",
    summary: {
      total: results.length,
      submitted: results.filter((r) => r.status === "submitted").length,
      in_progress: results.filter((r) => r.status === "in_progress").length,
      not_started: results.filter((r) => r.status === "not_started").length,
      average_score: average(graded),
    },
    groups: [...groups.entries()]
      .map(([teamId, rows]) => ({
        team_id: teamId,
        label: rows[0].team_label ?? "Group",
        members: rows.length,
        submitted: rows.filter((r) => r.status === "submitted").length,
        average_score: average(rows.map((r) => r.best_score).filter((x): x is number => x !== null)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  };
});

route("GET", "/api/faculty/sections", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const sections = visibleSections(ctx.db, ctx.role, ctx.viewer.id);
  return {
    sections: sections.map((s) => ({ id: s.id, name: s.name })),
  };
});
