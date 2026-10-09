"use client";

import { json, ndjson, notFound, notInDemo, route, sleep, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoCasePresentation, DemoMaterial } from "../fixtures/teaching";
import { CASE_CRITERIA, isLateSubmission } from "@/app/lib/case-rubric";
import { isTaskRating, type TaskRating } from "@/app/lib/task-ratings";
import { audit } from "./shared";
import { parseDeadline } from "@/app/lib/deadline-input";
import { DAY_MS, hasWork, lastActivity, mean } from "./derive";
import { listSkillSummaries } from "../fixtures/skills";
import { byName, sectionName, userById, visibleSections, visibleStudents } from "./scope";
import { CASES } from "../fixtures/cases-data";
import caseTasks from "../fixtures/case-tasks.json";

/** Case presentations, the Library, analytics, and the AI case generators. */

type Ctx = DemoContext;

const staffOnly = (ctx: Ctx) => ctx.role === "faculty" || ctx.role === "admin";
const forbidden = () => json({ error: "Forbidden" }, 403);

// ---------------------------------------------------------------------------
// Case presentations
// ---------------------------------------------------------------------------

function presentationOut(ctx: Ctx, p: DemoCasePresentation) {
  return {
    ...p,
    sections: p.section_ids.map((id) => ({ id, name: sectionName(ctx.db, id) ?? "—" })),
  };
}

function scopedSubmissions(ctx: Ctx, presentationId: string) {
  const mine = new Set(visibleStudents(ctx.db, ctx.role, ctx.viewer.id).map((s) => s.id));
  return ctx.db.caseSubmissions.filter((s) => s.presentation_id === presentationId && mine.has(s.student_id));
}

function visiblePresentations(ctx: Ctx) {
  const sections = new Set(visibleSections(ctx.db, ctx.role, ctx.viewer.id).map((s) => s.id));
  return ctx.db.casePresentations.filter((p) => ctx.role === "admin" || p.section_ids.some((id) => sections.has(id)));
}

route("GET", "/api/faculty/cases", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return {
    presentations: visiblePresentations(ctx)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => {
        const subs = scopedSubmissions(ctx, p.id);
        return {
          ...presentationOut(ctx, p),
          counts: {
            total: subs.length,
            not_started: subs.filter((s) => s.status === "not_started").length,
            draft: subs.filter((s) => s.status === "draft").length,
            submitted: subs.filter((s) => s.status === "submitted").length,
            graded: subs.filter((s) => s.status === "graded").length,
            late: subs.filter((s) => isLateSubmission(s.submitted_at, p.deadline)).length,
          },
        };
      }),
  };
});

function blankSubmission(presentationId: string, studentId: string) {
  return {
    id: newId(),
    presentation_id: presentationId,
    student_id: studentId,
    status: "not_started" as const,
    patient_initials: null,
    age: null,
    sex: null,
    hospital: "",
    ward: "",
    admitting_diagnosis: "",
    chief_complaint: "",
    history: "",
    medications: "",
    nursing_diagnoses: "",
    interventions: "",
    observations: { vitals: [], tpr: [], ivf: [] },
    submitted_at: null,
    graded_at: null,
    graded_by: null,
    score: null,
    remarks: "",
    ratings: [],
    updated_at: new Date().toISOString(),
  };
}

function rosterFor(ctx: Ctx, sectionIds: string[]) {
  const mine = visibleStudents(ctx.db, ctx.role, ctx.viewer.id);
  return mine.filter((s) => s.section_id && sectionIds.includes(s.section_id));
}

route("POST", "/api/faculty/cases", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return json({ error: "Give the case presentation a title" }, 400);
  const sectionIds: string[] = Array.isArray(body?.section_ids) ? body.section_ids : [];
  if (sectionIds.length === 0) return json({ error: "Choose at least one section" }, 400);
  const deadlineCheck = parseDeadline(body?.deadline);
  if (!deadlineCheck.ok) return json({ error: deadlineCheck.error }, 400);
  const now = new Date().toISOString();
  const p: DemoCasePresentation = {
    id: newId(),
    title,
    instructions: typeof body?.instructions === "string" ? body.instructions : "",
    deadline: deadlineCheck.value,
    section_ids: sectionIds,
    created_by: viewer.id,
    created_at: now,
    updated_at: now,
  };
  db.casePresentations.push(p);
  const roster = rosterFor(ctx, sectionIds);
  for (const s of roster) db.caseSubmissions.push(blankSubmission(p.id, s.id));
  audit(db, viewer, "case_presentation.create", "case_presentations", { message: `Assigned case presentation “${title}”` }, p.id);
  return json({ presentation: presentationOut(ctx, p), student_count: roster.length }, 201);
});

route("GET", "/api/faculty/cases/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const p = visiblePresentations(ctx).find((x) => x.id === ctx.params.id);
  if (!p) return notFound("Case presentation not found");
  return {
    presentation: { ...presentationOut(ctx, p), can_manage: ctx.role === "admin" || p.created_by === ctx.viewer.id },
    roster: scopedSubmissions(ctx, p.id)
      .map((s) => {
        const student = userById(db, s.student_id);
        return {
          submission_id: s.id,
          student_id: s.student_id,
          student_name: student?.name ?? "Unknown student",
          section_name: sectionName(db, student?.section_id),
          status: s.status,
          patient_initials: s.patient_initials,
          submitted_at: s.submitted_at,
          graded_at: s.graded_at,
          score: s.score,
          late: isLateSubmission(s.submitted_at, p.deadline),
        };
      })
      .sort((a, b) => a.student_name.localeCompare(b.student_name)),
  };
});

route("PATCH", "/api/faculty/cases/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body } = ctx;
  const p = db.casePresentations.find((x) => x.id === ctx.params.id);
  if (!p) return notFound("Case presentation not found");
  if (ctx.role !== "admin" && p.created_by !== ctx.viewer.id) return json({ error: "Only the instructor who assigned it can change it" }, 403);
  if (typeof body?.title === "string" && body.title.trim()) p.title = body.title.trim();
  if (typeof body?.instructions === "string") p.instructions = body.instructions;
  if (body && "deadline" in body) {
    // It can move, but not go: attendance is measured against it.
    const deadlineCheck = parseDeadline(body.deadline);
    if (!deadlineCheck.ok) return json({ error: deadlineCheck.error }, 400);
    p.deadline = deadlineCheck.value;
  }
  let added = 0;
  if (Array.isArray(body?.section_ids)) {
    p.section_ids = body.section_ids;
    for (const s of rosterFor(ctx, p.section_ids)) {
      if (!db.caseSubmissions.some((x) => x.presentation_id === p.id && x.student_id === s.id)) {
        db.caseSubmissions.push(blankSubmission(p.id, s.id));
        added += 1;
      }
    }
  }
  p.updated_at = new Date().toISOString();
  return { ok: true, students_added: added };
});

route("DELETE", "/api/faculty/cases/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const p = db.casePresentations.find((x) => x.id === ctx.params.id);
  if (!p) return notFound("Case presentation not found");
  if (ctx.role !== "admin" && p.created_by !== ctx.viewer.id) return json({ error: "Only the instructor who assigned it can delete it" }, 403);
  db.casePresentations = db.casePresentations.filter((x) => x.id !== p.id);
  db.caseSubmissions = db.caseSubmissions.filter((s) => s.presentation_id !== p.id);
  return { ok: true };
});

function loadSubmission(ctx: Ctx) {
  const mine = new Set(visibleStudents(ctx.db, ctx.role, ctx.viewer.id).map((s) => s.id));
  const s = ctx.db.caseSubmissions.find((x) => x.id === ctx.params.id);
  return s && mine.has(s.student_id) ? s : null;
}

route("GET", "/api/faculty/cases/submissions/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const s = loadSubmission(ctx);
  if (!s) return notFound("Submission not found");
  const p = ctx.db.casePresentations.find((x) => x.id === s.presentation_id)!;
  const student = userById(ctx.db, s.student_id);
  const { ratings, ...submission } = s;
  return {
    submission: { ...submission, late: isLateSubmission(s.submitted_at, p.deadline) },
    presentation: presentationOut(ctx, p),
    student: student ? { id: student.id, name: student.name, section_id: student.section_id } : null,
    ratings,
    criteria: CASE_CRITERIA.map((c) => ({ key: c.key, label: c.label, description: c.description })),
  };
});

route("PUT", "/api/faculty/cases/submissions/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const s = loadSubmission(ctx);
  if (!s) return notFound("Submission not found");
  if (s.status === "graded") return json({ error: "This case has already been graded" }, 409);
  if (s.status !== "submitted") return json({ error: "The student has not handed this case in yet" }, 409);
  const known = new Set(CASE_CRITERIA.map((c) => c.key));
  for (const [key, rating] of Object.entries((body?.ratings ?? {}) as Record<string, TaskRating | null>)) {
    if (!known.has(key)) return json({ error: `Unknown criterion: ${key}` }, 400);
    if (rating !== null && !isTaskRating(rating)) return json({ error: `Invalid rating for ${key}` }, 400);
    s.ratings = s.ratings.filter((r) => r.criterion !== key);
    if (rating) s.ratings.push({ criterion: key, rating, remarks: "" });
  }
  for (const [key, text] of Object.entries((body?.rating_remarks ?? {}) as Record<string, string>)) {
    const r = s.ratings.find((x) => x.criterion === key);
    if (r) r.remarks = String(text ?? "");
  }
  if (typeof body?.remarks === "string") s.remarks = body.remarks;
  const credit = { excellent: 1, satisfactory: 2 / 3, needs_practice: 1 / 3 };
  const score = Math.round((s.ratings.reduce((sum, r) => sum + credit[r.rating], 0) / CASE_CRITERIA.length) * 100);
  if (body?.finalize === true) {
    if (s.ratings.length < CASE_CRITERIA.length) return json({ error: "Rate every criterion before finalizing" }, 400);
    s.status = "graded";
    s.score = score;
    s.graded_by = viewer.id;
    s.graded_at = new Date().toISOString();
    audit(db, viewer, "case_submission.grade", "case_submissions", { message: `Graded ${userById(db, s.student_id)?.name}'s case presentation`, score }, s.id);
  }
  return { ok: true, ratings: s.ratings, score, status: s.status };
});

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

function materialOut(ctx: Ctx, m: DemoMaterial) {
  const { views, ...rest } = m;
  return { ...rest, author_name: userById(ctx.db, m.created_by)?.name ?? "", mine: m.created_by === ctx.viewer.id, views };
}

function youtubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1, 12) || null;
    const v = url.searchParams.get("v");
    if (v) return v.slice(0, 11);
    const m = /\/(?:embed|shorts|live)\/([\w-]{11})/.exec(url.pathname);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

route("GET", "/api/faculty/library", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const mine = new Set([ctx.viewer.id, ...ctx.db.users.filter((u) => u.admin_id === ctx.viewer.id).map((u) => u.id)]);
  return {
    // Every chapter, as the real route lists them: the Skill checklists view reads the whole book.
    skills: await listSkillSummaries(),
    sections: visibleSections(ctx.db, ctx.role, ctx.viewer.id).map((s) => ({ id: s.id, name: s.name })),
    materials: ctx.db.materials
      .filter((m) => m.status === "published" || m.created_by === ctx.viewer.id || (ctx.role === "admin" && mine.has(m.created_by)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((m) => materialOut(ctx, m)),
    enabled: true,
  };
});

function applyMaterialInput(m: DemoMaterial, body: Record<string, unknown>): string | null {
  if (typeof body.title === "string") m.title = body.title.trim();
  if (!m.title) return "Give the material a title";
  if (typeof body.description === "string") m.description = body.description;
  if (typeof body.skill_id === "string") m.skill_id = body.skill_id;
  if (Array.isArray(body.target_sections)) m.target_sections = (body.target_sections as string[]).length ? (body.target_sections as string[]) : null;
  if (m.kind === "video" && typeof body.youtube_url === "string") {
    const id = youtubeId(body.youtube_url);
    if (!id) return "That doesn't look like a YouTube link";
    m.youtube_id = id;
  }
  if (m.kind === "note" && typeof body.body_md === "string") m.body_md = body.body_md;
  if (m.kind === "link" && typeof body.url === "string") {
    try {
      m.url = new URL(body.url).toString();
    } catch {
      return "Enter a full web address, starting with https://";
    }
  }
  return null;
}

route("POST", "/api/faculty/library", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const kind = body?.kind;
  if (kind === "pdf" || kind === "slides") return notInDemo();
  if (!["video", "note", "link"].includes(kind)) return json({ error: "Choose what kind of material this is" }, 400);
  const now = new Date().toISOString();
  const m: DemoMaterial = {
    id: newId(),
    skill_id: "",
    kind,
    title: "",
    description: "",
    youtube_id: null,
    body_md: null,
    url: null,
    file_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    target_sections: null,
    status: body?.publish ? "published" : "draft",
    published_at: body?.publish ? now : null,
    created_by: viewer.id,
    created_at: now,
    updated_at: now,
    views: 0,
  };
  const error = applyMaterialInput(m, body ?? {});
  if (error) return json({ error }, 400);
  if (!m.skill_id) return json({ error: "Choose the skill it teaches" }, 400);
  db.materials.push(m);
  audit(db, viewer, "library.create", "library", { message: `Added “${m.title}” to the Library` }, m.id);
  return json({ material: materialOut(ctx, m) }, 201);
});

route("GET", "/api/faculty/library/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const m = ctx.db.materials.find((x) => x.id === ctx.params.id);
  if (!m) return notFound("Material not found");
  return { material: materialOut(ctx, m), file: null };
});

route("PATCH", "/api/faculty/library/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const m = db.materials.find((x) => x.id === ctx.params.id);
  if (!m) return notFound("Material not found");
  if (m.created_by !== viewer.id && ctx.role !== "admin") return json({ error: "Only its author can change this material" }, 403);
  if (body?.action === "publish" || body?.action === "unpublish") {
    m.status = body.action === "publish" ? "published" : "draft";
    m.published_at = body.action === "publish" ? new Date().toISOString() : null;
  } else {
    const error = applyMaterialInput(m, body ?? {});
    if (error) return json({ error }, 400);
  }
  m.updated_at = new Date().toISOString();
  return { material: materialOut(ctx, m) };
});

route("DELETE", "/api/faculty/library/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const m = ctx.db.materials.find((x) => x.id === ctx.params.id);
  if (!m) return notFound("Material not found");
  if (m.created_by !== ctx.viewer.id && ctx.role !== "admin") return json({ error: "Only its author can delete this material" }, 403);
  ctx.db.materials = ctx.db.materials.filter((x) => x.id !== m.id);
  return { ok: true };
});

route("POST", "/api/faculty/library/upload-url", notInDemo);

route("GET", "/api/faculty/library/suggestions", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const all = (await import("@/scripts/data/library-suggestions.json")).default as { skill_id: string; youtube_id: string; title: string; channel: string }[];
  const added = new Set(ctx.db.materials.filter((m) => m.created_by === ctx.viewer.id && m.youtube_id).map((m) => `${m.skill_id}|${m.youtube_id}`));
  return {
    suggestions: all
      .map((s, i) => ({ id: `sugg-${i}`, ...s }))
      .filter((s) => !added.has(`${s.skill_id}|${s.youtube_id}`)),
  };
});

route("POST", "/api/faculty/library/suggestions", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const all = (await import("@/scripts/data/library-suggestions.json")).default as { skill_id: string; youtube_id: string; title: string; channel: string }[];
  const index = Number(String(ctx.body?.suggestionId ?? "").replace("sugg-", ""));
  const s = all[index];
  if (!s) return notFound("Suggestion not found");
  const now = new Date().toISOString();
  const m: DemoMaterial = {
    id: newId(),
    skill_id: s.skill_id,
    kind: "video",
    title: s.title,
    description: `From ${s.channel}.`,
    youtube_id: s.youtube_id,
    body_md: null,
    url: null,
    file_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    target_sections: Array.isArray(ctx.body?.target_sections) && ctx.body.target_sections.length ? ctx.body.target_sections : null,
    status: "published",
    published_at: now,
    created_by: ctx.viewer.id,
    created_at: now,
    updated_at: now,
    views: 0,
  };
  ctx.db.materials.push(m);
  return json({ material: materialOut(ctx, m) }, 201);
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

type Bucket = "day" | "week" | "month" | "year";

function deriveBucket(from: string | null, to: string | null): Bucket {
  if (!from || !to) return "week";
  const days = Math.abs(Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  if (days <= 365 * 3) return "month";
  return "year";
}

function bucketStart(date: string, bucket: Bucket): string {
  if (bucket === "year") return `${date.slice(0, 4)}-01-01`;
  if (bucket === "month") return `${date.slice(0, 7)}-01`;
  if (bucket === "day") return date;
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

const AREA_NAMES: Record<string, string> = {
  "47a5fabc-e6a0-48bd-9b1b-c8e1cbf8d0d8": "Vital Signs",
  "6a1a5251-8871-4e94-ab2b-57bc58f4ea5b": "Oxygenation",
  "086113d0-4f87-47d2-b6b1-9ed69e3c741e": "Fluid, Electrolyte, and Acid–Base Balance",
};

/** The students and attempts the filters cover. */
function analyticsScope(ctx: Ctx) {
  const { db, query } = ctx;
  const allowed = visibleSections(db, ctx.role, ctx.viewer.id).map((s) => s.id);
  const asked = (query.get("section_ids") ?? "").split(",").filter(Boolean);
  const sectionIds = asked.length ? asked.filter((id) => allowed.includes(id)) : allowed;
  const students = visibleStudents(db, ctx.role, ctx.viewer.id).filter((s) => s.section_id && sectionIds.includes(s.section_id));
  const ids = new Set(students.map((s) => s.id));
  const from = query.get("from");
  const to = query.get("to");
  const windowFrom = from ? Date.parse(from) : Date.now() - 8 * 7 * DAY_MS;
  const windowTo = to ? Date.parse(`${to}T23:59:59Z`) : Date.now();
  const attempts = db.attempts.filter((a) => {
    if (!ids.has(a.student_id) || a.status !== "submitted" || a.score == null || !a.submitted_at) return false;
    const at = Date.parse(a.submitted_at);
    return at >= windowFrom && at <= windowTo;
  });
  return { sectionIds, students, attempts, bucket: deriveBucket(from, to) };
}

function topStudents(ctx: Ctx, scope: ReturnType<typeof analyticsScope>) {
  return scope.students
    .map((s) => {
      const scores = scope.attempts.filter((a) => a.student_id === s.id).map((a) => a.score!);
      return {
        student_key: s.id,
        name: s.name,
        picture_url: s.picture_url,
        sex: s.sex,
        section: sectionName(ctx.db, s.section_id),
        average_score: mean(scores) ?? 0,
        attempts: scores.length,
      };
    })
    .filter((s) => s.attempts > 0)
    .sort((a, b) => b.average_score - a.average_score || a.name.localeCompare(b.name));
}

route("GET", "/api/analytics/summary", (ctx) => {
  if (!staffOnly(ctx) && ctx.role !== "super_admin") return forbidden();
  const { db } = ctx;
  const scope = analyticsScope(ctx);
  const { students, attempts, bucket } = scope;

  const trend = new Map<string, number[]>();
  for (const a of attempts) {
    const key = bucketStart(a.submitted_at!.slice(0, 10), bucket);
    trend.set(key, [...(trend.get(key) ?? []), a.score!]);
  }
  const weekly_trend = [...trend.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, scores]) => ({ week_start, average_score: mean(scores) ?? 0, attempts: scores.length }));

  // Per skill area: each attempt counts toward every area its quiz tests.
  const byArea = new Map<string, { scores: number[]; students: Set<string> }>();
  for (const a of attempts) {
    const areas = new Set(db.criteria.filter((c) => c.assessment_id === a.assessment_id && c.competency_id).map((c) => c.competency_id!));
    for (const area of areas) {
      const entry = byArea.get(area) ?? { scores: [], students: new Set<string>() };
      entry.scores.push(a.score!);
      entry.students.add(a.student_id);
      byArea.set(area, entry);
    }
  }
  const competency_detail = [...byArea.entries()].map(([id, e]) => ({
    name: AREA_NAMES[id] ?? "Skill area",
    ratings: e.scores.length,
    students: e.students.size,
    average_score: mean(e.scores) ?? 0,
    pass_rate_pct: Math.round((e.scores.filter((s) => s >= 75).length / e.scores.length) * 100),
  }));

  const studentIds = new Set(students.map((s) => s.id));
  const vitals = db.vitals.filter((v) => studentIds.has(v.recorded_by));
  const risk: Record<string, number> = { safe: 0, at_risk: 0 };
  for (const s of students) if (s.risk_level && hasWork(db, s.id)) risk[s.risk_level] += 1;

  const groups = db.teams.filter((t) => scope.sectionIds.includes(t.section_id) && (ctx.role !== "faculty" || t.faculty_id === ctx.viewer.id));
  const groupPoints: { group_id: string; week_start: string; average_score: number; attempts: number }[] = [];
  for (const g of groups) {
    const members = new Set(students.filter((s) => s.team_id === g.id).map((s) => s.id));
    const buckets = new Map<string, number[]>();
    for (const a of attempts.filter((x) => members.has(x.student_id))) {
      const key = bucketStart(a.submitted_at!.slice(0, 10), bucket);
      buckets.set(key, [...(buckets.get(key) ?? []), a.score!]);
    }
    for (const [week_start, scores] of buckets) groupPoints.push({ group_id: g.id, week_start, average_score: mean(scores) ?? 0, attempts: scores.length });
  }

  const thirty = Date.now() - 30 * DAY_MS;
  return {
    bucket,
    summary: {
      etl: { last_run_at: new Date(new Date().setHours(3, 5, 0, 0)).toISOString(), rows_loaded: { fact_attempts: db.attempts.length, dim_students: students.length } },
      sections: scope.sectionIds.map((id) => {
        const members = students.filter((s) => s.section_id === id);
        return {
          id,
          name: sectionName(db, id) ?? "—",
          students: members.length,
          active_students: members.filter((s) => Date.parse(lastActivity(db, s.id) ?? "1970") > thirty).length,
        };
      }),
      cohort: {
        total_students: students.length,
        submitted_attempts: attempts.length,
        average_score: mean(attempts.map((a) => a.score!)),
        active_students_30d: students.filter((s) => Date.parse(lastActivity(db, s.id) ?? "1970") > thirty).length,
      },
      weekly_trend,
      group_trend:
        ctx.query.get("group_trend") === "1"
          ? { groups: groups.map((g) => ({ id: g.id, name: g.name, section_id: g.section_id })), points: groupPoints }
          : undefined,
      competency_breakdown: Object.fromEntries(competency_detail.map((c) => [c.name, c.average_score])),
      competency_detail,
      room_utilization: db.rooms.map((r) => {
        const assigned = db.patients.filter((p) => p.room_id === r.id && p.status === "admitted").length;
        return {
          name: r.name,
          room_number: r.room_number,
          status: r.status,
          capacity: r.capacity,
          assigned,
          utilization_pct: r.capacity ? Math.round((assigned / r.capacity) * 100) : 0,
        };
      }),
      clinical_activity: {
        vital_readings: vitals.length,
        anomalies: vitals.filter((v) => v.is_anomaly).length,
        tpr_entries: 0,
        ivf_records: 0,
        progress_notes: 0,
        notes_reviewed: 0,
      },
      risk_distribution: risk,
      top_students: topStudents(ctx, scope).slice(0, 5),
      active_model: { kind: "random_forest", version: "2026.09.1" },
    },
  };
});

route("GET", "/api/analytics/leaderboard", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return { students: topStudents(ctx, analyticsScope(ctx)) };
});

route("POST", "/api/analytics/narrative", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  await sleep(1100);
  const scope = analyticsScope(ctx);
  const avg = mean(scope.attempts.map((a) => a.score!));
  const top = topStudents(ctx, scope);
  const atRisk = scope.students.filter((s) => s.risk_level === "at_risk").sort(byName);
  return {
    generated_at: new Date().toISOString(),
    narrative: {
      headline: `Quiz scores are holding at ${avg ?? "—"}% across ${scope.students.length} students`,
      overview: `Over this period students handed in ${scope.attempts.length} quiz attempts. Vital Signs is the strongest skill area; Fluid, Electrolyte, and Acid–Base Balance trails it, mostly on IV site monitoring questions.`,
      highlights: [
        top[0] ? `${top[0].name} leads with an average of ${top[0].average_score}%.` : "Every group has submitted work this period.",
        "Most students who retook a quiz improved on their second attempt.",
      ],
      watchouts: atRisk.length
        ? [`${atRisk.map((s) => s.name).join(", ")} ${atRisk.length === 1 ? "is" : "are"} flagged as low performing.`, "Several patient cases from last week are still waiting to be graded."]
        : ["Several patient cases from last week are still waiting to be graded."],
      actions: [
        "Grade last week's patient cases so students get feedback before this week's case.",
        "Schedule a return demonstration on IV site monitoring (Skill 15-3).",
        "Check in with the low-performing students before their next ward duty.",
      ],
    },
  };
});

// ---------------------------------------------------------------------------
// AI case generation (canned, from the demo's own case library)
// ---------------------------------------------------------------------------

function draftFrom(i: number, patientId: string | null = null) {
  const c = CASES[i % CASES.length];
  return {
    title: `${c.scenario.title} (variant)`,
    description: c.scenario.description,
    category: c.scenario.category,
    patient_case: {
      vitals: c.vitals,
      diagnosis: c.diagnosis,
      medical_history: c.medical_history,
      chief_complaint: c.scenario.chief_complaint,
      physical_exam: c.scenario.physical_exam,
      treatment_plan: c.scenario.treatment_plan,
    },
    learning_objectives: c.scenario.learning_objectives,
    patient_id: patientId,
    chapter: Number((caseTasks[i % caseTasks.length].tasks[0]?.skill_id ?? "1-1").split("-")[0]),
    topic: null,
    skills: caseTasks[i % caseTasks.length].tasks.map((t) => t.skill_id),
  };
}

let generated = 0;

route("POST", "/api/faculty/scenarios/generate", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  await sleep(2200);
  generated += 1;
  const draft = draftFrom(generated + 2, ctx.body?.patient_id ?? null);
  return { scenario: { ...draft, is_ai_generated: true } };
});

route("POST", "/api/faculty/scenarios/generate-batch", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const count = Math.max(1, Math.min(10, Number(ctx.body?.count) || 3));
  await sleep(1500 + count * 300);
  return { scenarios: Array.from({ length: count }, (_, i) => draftFrom(generated + i + 1)) };
});

route("POST", "/api/faculty/scenarios/suggest", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  await sleep(1200);
  const patientId = ctx.body?.patient_id || ctx.db.patients.find((p) => p.status === "admitted")?.id || "";
  const d = draftFrom(generated + 4, patientId);
  return { scenario: d, patient_id: patientId, prompt: `A ${d.category.toLowerCase()} case built around ${d.patient_case.diagnosis}.` };
});

route("POST", "/api/faculty/scenarios/suggest-skills", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  await sleep(700);
  const text = `${ctx.body?.title ?? ""} ${ctx.body?.description ?? ""}`.toLowerCase();
  const rules: [RegExp, string, string][] = [
    [/temp|fever|febrile/, "1-1", "Assessing Body Temperature"],
    [/pulse|heart rate|tachy/, "1-4", "Assessing a Peripheral Pulse by Palpation"],
    [/respir|breath/, "1-6", "Assessing Respiration"],
    [/pressure|hypertens|\bbp\b/, "1-7", "Assessing Brachial Artery Blood Pressure"],
    [/oximet|spo2|saturation|asthma/, "14-1", "Using a Pulse Oximeter"],
    [/oxygen|cannula/, "14-3", "Administering Oxygen by Nasal Cannula"],
    [/\biv\b|intravenous|dehydrat|fluid/, "15-1", "Initiating a Peripheral Venous Access IV Infusion"],
  ];
  const suggestions = rules
    .filter(([re]) => re.test(text))
    .map(([, id, title]) => ({ id, reason: `${title}: mentioned in the case` }));
  return { suggestions: suggestions.length ? suggestions : [{ id: "1-1", reason: "A starting point for any admission" }], source: "keywords" };
});

route("POST", "/api/faculty/scenarios/analyze-lesson", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const name = typeof ctx.body?.file === "object" && ctx.body.file && "name" in ctx.body.file ? String(ctx.body.file.name) : "lesson";
  return ndjson(
    [
      { type: "progress", stage: "reading", fraction: 0.3 },
      { type: "progress", stage: "reading", fraction: 0.7 },
      { type: "progress", stage: "reading", fraction: 1 },
      { type: "progress", stage: "topics", fraction: 0.5 },
      {
        type: "result",
        lesson_text: `Demo lesson (${name}): vital signs, pulse oximetry and peripheral IV therapy.`,
        topics: [
          { topic: "Vital Signs", chapter: 1, category: "Vital Signs" },
          { topic: "Oxygenation", chapter: 14, category: "Oxygenation" },
          { topic: "Fluid, Electrolyte, and Acid–Base Balance", chapter: 15, category: "Fluid, Electrolyte, and Acid–Base Balance" },
        ],
      },
    ],
    450,
  );
});

// ---------------------------------------------------------------------------
// Reports (PDFs rendered in the browser; see lib/demo/reports.tsx)
// ---------------------------------------------------------------------------

async function report(ctx: Ctx) {
  const id = ctx.query.get("id")?.trim() ?? "";
  const { buildDemoReport } = await import("../reports");
  const { response, subject } = await buildDemoReport(ctx, ctx.params.type, id);
  if (response.ok) {
    audit(ctx.db, ctx.viewer, "report.generate", ctx.params.type, {
      report: ctx.params.type,
      format: "pdf",
      subject,
      target_id: id || null,
    });
  }
  return response;
}

route("GET", "/api/faculty/reports/:type", (ctx) => (staffOnly(ctx) ? report(ctx) : forbidden()));
route("GET", "/api/admin/reports/:type", (ctx) => (ctx.role === "admin" ? report(ctx) : forbidden()));

route("GET", "/api/reports/recent", (ctx) => ({
  reports: ctx.db.audit
    .filter((r) => r.actor_id === ctx.viewer.id && r.action === "report.generate")
    .slice(0, 10)
    .map((r) => ({
      type: r.entity_type ?? "",
      target_id: (r.details.target_id as string | null) ?? null,
      subject: String(r.details.subject ?? r.entity_type ?? "Report"),
      created_at: r.created_at,
    })),
}));
