"use client";

import { json, ndjson, notFound, notInDemo, route, sleep, type DemoContext } from "../router";
import { newId } from "../store";
import type { DemoCaseGroup, DemoCasePresentation, DemoMaterial } from "../fixtures/teaching";
import {
  CASE_CRITERIA,
  allCriteriaRated,
  caseScore,
  isCaseCriterion,
  isCaseLevel,
  isLateSubmission,
  type CaseLevel,
} from "@/app/lib/case-rubric";
import { audit } from "./shared";
import { parseDeadline } from "@/app/lib/deadline-input";
import { DAY_MS, hasWork, lastActivity, mean, skillMastery } from "./derive";
import { summariseCohort } from "@/app/lib/bkt";
import { listSkillSummaries } from "../fixtures/skills";
import { byName, canSeeStudent, manageableSections, sectionName, teamLabel, userById, visibleSections, visibleStudents } from "./scope";
import { courseActivityIds, courseDb, linkActivityCourses, offeringRoster } from "./courses";
import { CASES } from "../fixtures/cases-data";
import type { WorkKind } from "@/app/lib/work-kinds";
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
    groups: caseGroupsFor(ctx, p).map((g) => ({ id: g.id, name: g.team_name, section_name: g.section_name })),
  };
}

/** Stores saved before groups (093) have no table yet. */
function allCaseGroups(ctx: Ctx): DemoCaseGroup[] {
  const db = ctx.db as typeof ctx.db & { caseGroups?: DemoCaseGroup[] };
  if (!db.caseGroups) db.caseGroups = [];
  return db.caseGroups;
}

/** The groups of a presentation this viewer sees: all for its maker or an admin, else those with their students. */
function caseGroupsFor(ctx: Ctx, p: DemoCasePresentation) {
  const mine = new Set(visibleStudents(ctx.db, ctx.role, ctx.viewer.id).map((s) => s.id));
  const own = ctx.role === "admin" || p.created_by === ctx.viewer.id;
  return allCaseGroups(ctx)
    .filter((g) => g.presentation_id === p.id)
    .filter((g) => own || ctx.db.caseSubmissions.some((s) => s.group_id === g.id && mine.has(s.student_id)))
    .sort((a, b) => a.section_name.localeCompare(b.section_name) || a.team_name.localeCompare(b.team_name));
}

function groupOut(ctx: Ctx, g: DemoCaseGroup) {
  const p = ctx.db.casePresentations.find((x) => x.id === g.presentation_id);
  const name = (id: string | null) => (id ? userById(ctx.db, id)?.name ?? null : null);
  return {
    id: g.id,
    presentation_id: g.presentation_id,
    team_id: g.team_id,
    name: g.team_name,
    section_name: g.section_name,
    leader_id: g.leader_id,
    leader_name: name(g.leader_id),
    status: g.status,
    file: g.file ? { name: g.file.name, size: g.file.size, type: g.file.type, uploaded_by_name: name(g.file.uploaded_by) } : null,
    submitted_at: g.submitted_at,
    late: isLateSubmission(g.submitted_at, p?.deadline ?? null),
    score: g.score,
    remarks: g.remarks,
    graded_at: g.graded_at,
    members: ctx.db.caseSubmissions
      .filter((s) => s.group_id === g.id)
      .map((s) => {
        const u = userById(ctx.db, s.student_id);
        return {
          student_id: s.student_id,
          submission_id: s.id,
          name: u?.name ?? "Unknown student",
          picture_url: u?.picture_url ?? null,
          is_leader: s.student_id === g.leader_id,
        };
      })
      .sort((a, b) => Number(b.is_leader) - Number(a.is_leader) || a.name.localeCompare(b.name)),
  };
}

function visiblePresentations(ctx: Ctx) {
  const sections = new Set(manageableSections(ctx.db, ctx.role, ctx.viewer.id).map((s) => s.id));
  return ctx.db.casePresentations.filter((p) => ctx.role === "admin" || p.section_ids.some((id) => sections.has(id)));
}

route("GET", "/api/faculty/cases", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return {
    presentations: visiblePresentations(ctx)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => {
        const groups = caseGroupsFor(ctx, p);
        const count = (status: string) => groups.filter((g) => g.status === status).length;
        return {
          ...presentationOut(ctx, p),
          student_count: ctx.db.caseSubmissions.filter((s) => groups.some((g) => g.id === s.group_id)).length,
          counts: {
            total: groups.length,
            not_started: count("not_started") + count("draft"),
            draft: 0,
            submitted: count("submitted"),
            graded: count("graded"),
            late: groups.filter((g) => isLateSubmission(g.submitted_at, p.deadline)).length,
          },
        };
      }),
  };
});

/** Gives a presentation to groups, each with its leader; groups that have it already are skipped. */
function assignGroups(ctx: Ctx, p: DemoCasePresentation, input: unknown): { error: string; status: number } | { added: number; students: number } {
  if (!Array.isArray(input)) return { error: "Choose a leader for each group", status: 400 };
  const picks = input as { team_id?: unknown; leader_id?: unknown }[];
  if (picks.some((x) => typeof x?.team_id !== "string" || typeof x?.leader_id !== "string" || !x.leader_id)) {
    return { error: "Choose a leader for each group", status: 400 };
  }
  const { db } = ctx;
  let added = 0;
  let students = 0;
  for (const pick of picks as { team_id: string; leader_id: string }[]) {
    const team = db.teams.find((t) => t.id === pick.team_id);
    if (!team) return { error: "Group not found", status: 400 };
    if (ctx.role === "faculty" && team.faculty_id !== ctx.viewer.id) return { error: "You can only give it to groups you supervise", status: 403 };
    if (allCaseGroups(ctx).some((g) => g.presentation_id === p.id && g.team_id === team.id)) continue;
    const members = db.users.filter((u) => u.role === "student" && u.team_id === team.id);
    if (members.length === 0) return { error: `${team.name} has no members yet`, status: 400 };
    if (!members.some((m) => m.id === pick.leader_id)) return { error: "Each group leader must be a member of that group", status: 400 };
    const group: DemoCaseGroup = {
      id: newId(),
      presentation_id: p.id,
      team_id: team.id,
      team_name: team.name,
      section_name: sectionName(db, team.section_id) ?? "",
      leader_id: pick.leader_id,
      status: "not_started",
      file: null,
      submitted_at: null,
      score: null,
      remarks: "",
      graded_by: null,
      graded_at: null,
      ratings: [],
    };
    allCaseGroups(ctx).push(group);
    for (const m of members) {
      db.caseSubmissions = db.caseSubmissions.filter((s) => !(s.presentation_id === p.id && s.student_id === m.id));
      db.caseSubmissions.push({
        id: newId(),
        presentation_id: p.id,
        student_id: m.id,
        group_id: group.id,
        status: "not_started",
        submitted_at: null,
        graded_at: null,
        graded_by: null,
        score: null,
        remarks: "",
        updated_at: new Date().toISOString(),
      });
    }
    p.team_ids = [...new Set([...(p.team_ids ?? []), team.id])];
    p.section_ids = [...new Set([...p.section_ids, team.section_id])];
    added += 1;
    students += members.length;
  }
  return { added, students };
}

route("POST", "/api/faculty/cases", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return json({ error: "Give the case presentation a title" }, 400);
  const deadlineCheck = parseDeadline(body?.deadline);
  if (!deadlineCheck.ok) return json({ error: deadlineCheck.error }, 400);
  if (!Array.isArray(body?.groups) || body.groups.length === 0) return json({ error: "Choose the groups that report this case" }, 400);
  const now = new Date().toISOString();
  const p: DemoCasePresentation = {
    id: newId(),
    title,
    instructions: typeof body?.instructions === "string" ? body.instructions : "",
    deadline: deadlineCheck.value,
    section_ids: [],
    team_ids: [],
    created_by: viewer.id,
    created_at: now,
    updated_at: now,
    offering_id: typeof body?.offering_id === "string" && body.offering_id ? body.offering_id : null,
  };
  db.casePresentations.push(p);
  const assigned = assignGroups(ctx, p, body.groups);
  if ("error" in assigned) {
    db.casePresentations = db.casePresentations.filter((x) => x.id !== p.id);
    return json({ error: assigned.error }, assigned.status);
  }
  audit(db, viewer, "case_presentation.create", "case_presentations", { message: `Assigned case presentation “${title}”` }, p.id);
  return json({ presentation: presentationOut(ctx, p), student_count: assigned.students }, 201);
});

route("GET", "/api/faculty/cases/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const p = visiblePresentations(ctx).find((x) => x.id === ctx.params.id);
  if (!p) return notFound("Case presentation not found");
  return {
    presentation: { ...presentationOut(ctx, p), can_manage: ctx.role === "admin" || p.created_by === ctx.viewer.id },
    groups: caseGroupsFor(ctx, p).map((g) => groupOut(ctx, g)),
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
    // It can move, but not go: late and overdue work is measured against it.
    const deadlineCheck = parseDeadline(body.deadline);
    if (!deadlineCheck.ok) return json({ error: deadlineCheck.error }, 400);
    p.deadline = deadlineCheck.value;
  }
  const leaders = body?.leaders && typeof body.leaders === "object" ? (body.leaders as Record<string, string>) : {};
  for (const [groupId, leaderId] of Object.entries(leaders)) {
    const g = allCaseGroups(ctx).find((x) => x.id === groupId && x.presentation_id === p.id);
    if (!g) return notFound("Group not found");
    if (g.status === "graded") return json({ error: `${g.team_name} is already graded, so its leader can't change` }, 409);
    if (!db.caseSubmissions.some((s) => s.group_id === g.id && s.student_id === leaderId)) {
      return json({ error: `The leader must be a member of ${g.team_name}` }, 400);
    }
    g.leader_id = leaderId;
  }
  let added = { added: 0, students: 0 };
  if (Array.isArray(body?.groups) && body.groups.length > 0) {
    const assigned = assignGroups(ctx, p, body.groups);
    if ("error" in assigned) return json({ error: assigned.error }, assigned.status);
    added = assigned;
  }
  p.updated_at = new Date().toISOString();
  return { ok: true, groups_added: added.added, students_added: added.students };
});

route("DELETE", "/api/faculty/cases/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const p = db.casePresentations.find((x) => x.id === ctx.params.id);
  if (!p) return notFound("Case presentation not found");
  if (ctx.role !== "admin" && p.created_by !== ctx.viewer.id) return json({ error: "Only the instructor who assigned it can delete it" }, 403);
  if (allCaseGroups(ctx).some((g) => g.presentation_id === p.id && (g.status === "submitted" || g.status === "graded"))) {
    return json({ error: "Groups have already handed in this case presentation; it can no longer be deleted" }, 409);
  }
  db.casePresentations = db.casePresentations.filter((x) => x.id !== p.id);
  db.caseSubmissions = db.caseSubmissions.filter((s) => s.presentation_id !== p.id);
  const db2 = db as typeof db & { caseGroups?: DemoCaseGroup[] };
  db2.caseGroups = allCaseGroups(ctx).filter((g) => g.presentation_id !== p.id);
  return { ok: true };
});

function loadCaseGroup(ctx: Ctx) {
  const g = allCaseGroups(ctx).find((x) => x.id === ctx.params.groupId);
  const p = g && visiblePresentations(ctx).find((x) => x.id === g.presentation_id);
  if (!g || !p || !caseGroupsFor(ctx, p).some((x) => x.id === g.id)) return null;
  return { g, p };
}

route("GET", "/api/faculty/cases/groups/:groupId", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const found = loadCaseGroup(ctx);
  if (!found) return notFound("Group not found");
  const { g, p } = found;
  return {
    group: groupOut(ctx, g),
    presentation: { id: p.id, title: p.title, instructions: p.instructions, deadline: p.deadline },
    // The demo keeps no files, so there is nothing to show in the page.
    file_url: null,
    ratings: g.ratings,
    criteria: CASE_CRITERIA,
  };
});

route("PUT", "/api/faculty/cases/groups/:groupId", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db, body, viewer } = ctx;
  const found = loadCaseGroup(ctx);
  if (!found) return notFound("Group not found");
  const { g } = found;
  if (g.status === "graded") return json({ error: "This group has already been graded" }, 409);
  if (g.status !== "submitted") return json({ error: "The group leader has not handed in the slides yet" }, 409);
  for (const [key, level] of Object.entries((body?.ratings ?? {}) as Record<string, unknown>)) {
    if (!isCaseCriterion(key)) return json({ error: `Unknown criterion: ${key}` }, 400);
    if (level !== null && !isCaseLevel(level)) return json({ error: `Invalid level for ${key}` }, 400);
    const keep = g.ratings.find((r) => r.criterion === key)?.remarks ?? "";
    g.ratings = g.ratings.filter((r) => r.criterion !== key);
    if (level !== null) g.ratings.push({ criterion: key, level: level as CaseLevel, remarks: keep });
  }
  for (const [key, text] of Object.entries((body?.rating_remarks ?? {}) as Record<string, string>)) {
    const r = g.ratings.find((x) => x.criterion === key);
    if (r) r.remarks = String(text ?? "");
  }
  if (typeof body?.remarks === "string") g.remarks = body.remarks;
  const levels = new Map(g.ratings.map((r) => [r.criterion, r.level]));
  const score = caseScore(levels);
  if (body?.finalize === true) {
    if (!allCriteriaRated(levels)) return json({ error: "Rate every criterion before finalizing" }, 400);
    const now = new Date().toISOString();
    Object.assign(g, { status: "graded", score, graded_by: viewer.id, graded_at: now });
    for (const s of db.caseSubmissions.filter((x) => x.group_id === g.id)) {
      Object.assign(s, { status: "graded", score, graded_by: viewer.id, graded_at: now, remarks: g.remarks });
    }
    audit(db, viewer, "case_group.grade", "case_presentation_groups", { message: `Graded ${g.team_name}'s case presentation`, score }, g.id);
  }
  return { ok: true, ratings: g.ratings, score, status: g.status };
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
  // Each material's course (075).
  linkActivityCourses(ctx.db);
  const mine = new Set([ctx.viewer.id, ...ctx.db.users.filter((u) => u.admin_id === ctx.viewer.id).map((u) => u.id)]);
  return {
    // Every chapter, as the real route lists them: the Skill checklists view reads the whole book.
    skills: await listSkillSummaries(),
    sections: manageableSections(ctx.db, ctx.role, ctx.viewer.id).map((s) => ({ id: s.id, name: s.name })),
    materials: ctx.db.materials
      .filter((m) => m.status === "published" || m.created_by === ctx.viewer.id || (ctx.role === "admin" && mine.has(m.created_by)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((m) => materialOut(ctx, m)),
    enabled: true,
    courses_ready: true,
  };
});

function applyMaterialInput(m: DemoMaterial, body: Record<string, unknown>): string | null {
  if (typeof body.title === "string") m.title = body.title.trim();
  if (!m.title) return "Give the material a title";
  if (typeof body.description === "string") m.description = body.description;
  if (typeof body.skill_id === "string") m.skill_id = body.skill_id;
  if ("offering_id" in body) m.offering_id = typeof body.offering_id === "string" && body.offering_id ? body.offering_id : null;
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
    offering_id: typeof ctx.body?.offering_id === "string" ? ctx.body.offering_id : null,
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

interface Work {
  student_id: string;
  kind: WorkKind;
  score: number;
  /** When it was handed in. */
  at: string;
  /** The quiz, scenario or case presentation it was for. */
  item: string;
}

/**
 * Every graded piece of work these students handed in, as the warehouse's
 * dw.fact_student_work (migration 085) files it: each kind, dated by when
 * the student did it.
 */
function gradedWork(db: Ctx["db"], ids: Set<string>): Work[] {
  const kindOf = new Map(db.scenarios.map((s) => [s.id, s.kind === "return_demo" ? "return_demo" : "patient_case"] as const));
  const work: Work[] = [];
  for (const a of db.attempts) {
    if (ids.has(a.student_id) && a.status === "submitted" && a.score != null && a.submitted_at) {
      work.push({ student_id: a.student_id, kind: "quiz", score: a.score, at: a.submitted_at, item: a.assessment_id });
    }
  }
  for (const a of db.assignments) {
    const at = a.submitted_at ?? a.completed_at;
    if (ids.has(a.student_id) && a.status === "completed" && a.score != null && at) {
      work.push({ student_id: a.student_id, kind: kindOf.get(a.scenario_id) ?? "patient_case", score: a.score, at, item: a.scenario_id });
    }
  }
  for (const c of db.caseSubmissions) {
    const at = c.submitted_at ?? c.graded_at;
    if (ids.has(c.student_id) && c.status === "graded" && c.score != null && at) {
      work.push({ student_id: c.student_id, kind: "case_presentation", score: c.score, at, item: c.presentation_id });
    }
  }
  return work;
}

/** The students and graded work the filters cover. */
function analyticsScope(ctx: Ctx) {
  const { db, query } = ctx;
  const allowed = visibleSections(db, ctx.role, ctx.viewer.id).map((s) => s.id);
  const asked = (query.get("section_ids") ?? "").split(",").filter(Boolean);
  // One course, the instructor's own or of the Dean's courses: its roster and its work, inside its term.
  const offeringId = query.get("offering_id");
  const offering = offeringId
    ? courseDb(db).offerings.find(
        (o) =>
          o.id === offeringId &&
          (ctx.role === "faculty"
            ? o.faculty_id === ctx.viewer.id
            : !!o.faculty_id && db.courses.some((c) => c.id === o.course_id && c.admin_id === ctx.viewer.id)),
      )
    : null;
  const term = offering ? db.terms.find((t) => t.id === offering.term_id) : null;
  const items = offering ? courseActivityIds(db, offering.id) : null;
  const choices = offering ? offering.section_ids : allowed;
  const sectionIds = asked.length ? asked.filter((id) => choices.includes(id)) : choices;
  const students = (offering ? offeringRoster(db, offering).students : visibleStudents(db, ctx.role, ctx.viewer.id)).filter(
    (s) => s.section_id && sectionIds.includes(s.section_id),
  );
  const ids = new Set(students.map((s) => s.id));
  const askedFrom = query.get("from");
  const askedTo = query.get("to");
  const from = term && (!askedFrom || askedFrom < term.starts_on) ? term.starts_on : askedFrom;
  const to = term && (!askedTo || askedTo > term.ends_on) ? term.ends_on : askedTo;
  const windowFrom = from ? Date.parse(from) : Date.now() - 8 * 7 * DAY_MS;
  const windowTo = to ? Date.parse(`${to}T23:59:59Z`) : Date.now();
  const inWindow = (iso: string) => {
    const at = Date.parse(iso);
    return at >= windowFrom && at <= windowTo;
  };
  // The quiz attempts themselves, for the skill areas their questions test.
  const attempts = db.attempts.filter(
    (a) =>
      ids.has(a.student_id) &&
      (!items || items.has(a.assessment_id)) &&
      a.status === "submitted" &&
      a.score != null &&
      !!a.submitted_at &&
      inWindow(a.submitted_at),
  );
  const work = gradedWork(db, ids).filter((w) => inWindow(w.at) && (!items || items.has(w.item)));
  return { sectionIds, students, attempts, work, bucket: deriveBucket(from, to), oneCourse: !!offering };
}

function topStudents(ctx: Ctx, scope: ReturnType<typeof analyticsScope>) {
  return scope.students
    .map((s) => {
      const mine = scope.work.filter((w) => w.student_id === s.id);
      const byKind: Partial<Record<WorkKind, number>> = {};
      for (const kind of new Set(mine.map((w) => w.kind))) {
        byKind[kind] = mean(mine.filter((w) => w.kind === kind).map((w) => w.score)) ?? 0;
      }
      return {
        student_key: s.id,
        name: s.name,
        picture_url: s.picture_url,
        sex: s.sex,
        section: sectionName(ctx.db, s.section_id),
        average_score: mean(mine.map((w) => w.score)) ?? 0,
        attempts: mine.length,
        by_kind: byKind,
      };
    })
    .filter((s) => s.attempts > 0)
    .sort((a, b) => b.average_score - a.average_score || a.name.localeCompare(b.name));
}

route("GET", "/api/analytics/summary", (ctx) => {
  if (!staffOnly(ctx) && ctx.role !== "super_admin") return forbidden();
  const { db } = ctx;
  const scope = analyticsScope(ctx);
  const { students, attempts, work, bucket } = scope;

  const trend = new Map<string, number[]>();
  for (const w of work) {
    const key = bucketStart(w.at.slice(0, 10), bucket);
    trend.set(key, [...(trend.get(key) ?? []), w.score]);
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
    for (const w of work.filter((x) => members.has(x.student_id))) {
      const key = bucketStart(w.at.slice(0, 10), bucket);
      buckets.set(key, [...(buckets.get(key) ?? []), w.score]);
    }
    for (const [week_start, scores] of buckets) groupPoints.push({ group_id: g.id, week_start, average_score: mean(scores) ?? 0, attempts: scores.length });
  }

  const thirty = Date.now() - 30 * DAY_MS;
  const handedIn = new Set(work.map((w) => w.student_id));
  const isActive = (s: { id: string }) => (scope.oneCourse ? handedIn.has(s.id) : Date.parse(lastActivity(db, s.id) ?? "1970") > thirty);
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
          active_students: members.filter(isActive).length,
        };
      }),
      cohort: {
        total_students: students.length,
        submitted_attempts: attempts.length,
        graded: work.length,
        average_score: mean(work.map((w) => w.score)),
        by_kind: Object.fromEntries(
          [...new Set(work.map((w) => w.kind))].map((kind) => {
            const of = work.filter((w) => w.kind === kind);
            return [kind, { average_score: mean(of.map((w) => w.score)) ?? 0, graded: of.length, students: new Set(of.map((w) => w.student_id)).size }];
          }),
        ),
        active_students_30d: students.filter(isActive).length,
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

route("GET", "/api/analytics/skill-mastery", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const id = ctx.query.get("student_id");
  if (id) {
    if (!userById(db, id) || !canSeeStudent(db, ctx.role, ctx.viewer.id, id)) return notFound("Student not found");
    return { skills: skillMastery(db, id) };
  }
  const { students } = analyticsScope(ctx);
  return { cohort: summariseCohort(new Map(students.map((s) => [s.id, skillMastery(db, s.id)])), students.length) };
});

route("GET", "/api/analytics/leaderboard", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  return { students: topStudents(ctx, analyticsScope(ctx)) };
});

route("POST", "/api/analytics/narrative", async (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  await sleep(1100);
  const scope = analyticsScope(ctx);
  const avg = mean(scope.work.map((w) => w.score));
  const top = topStudents(ctx, scope);
  const atRisk = scope.students.filter((s) => s.risk_level === "at_risk").sort(byName);
  // Written for the Dean, and naming nobody, as the real prompt gives it no names.
  if (ctx.role === "admin") {
    return {
      generated_at: new Date().toISOString(),
      narrative: {
        headline: `Grades are holding at ${avg ?? "—"}% across ${scope.students.length} students`,
        overview: `${scope.work.length} pieces of work were graded in this period, which is what Performance by Activity averages. Performance per Course shows each class's grade so far against the 75% target. Skill Mastery is an estimate of how likely students are to know each skill, from their whole record, and IV site care is where it is lowest.`,
        highlights: ["Most students who retook a quiz improved on their second attempt."],
        watchouts: [
          ...(atRisk.length ? [`${atRisk.length} ${atRisk.length === 1 ? "student is" : "students are"} flagged as Low Performing, a prediction from their overall record.`] : []),
          "Several patient cases from last week are still waiting to be graded.",
        ],
        actions: [
          "Ask instructors to grade last week's patient cases so students get feedback before this week's case.",
          "Ask the instructors of any course under the 75% target what support they have planned.",
          "Check with instructors that the low-performing students have a plan before their next ward duty.",
        ],
      },
    };
  }
  return {
    generated_at: new Date().toISOString(),
    narrative: {
      headline: `Grades are holding at ${avg ?? "—"}% across ${scope.students.length} students`,
      overview: `Over this period ${scope.work.length} pieces of work were graded across patient cases, quizzes and case presentations. Vital Signs is the strongest skill area; Fluid, Electrolyte, and Acid–Base Balance trails it, mostly on IV site monitoring questions.`,
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

// What is inside one report folder (a section, a patient case, a return demonstration, a quiz), as the real route reads it.
route("GET", "/api/faculty/reports/folder/:type/:id", (ctx) => {
  if (!staffOnly(ctx)) return forbidden();
  const { db } = ctx;
  const { type, id } = ctx.params;
  const mine = visibleStudents(db, ctx.role, ctx.viewer.id);
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const label = (teamId: string | null | undefined, section: string | null) => teamLabel(db, teamId) ?? section ?? "No group";
  type Member = { id: string; name: string; team_id: string | null; flag: string | null; detail: string };
  const group = (members: Member[], parent: string, itemType: string, status: (m: Member[]) => { text: string; flag: string | null }) => {
    const teams = [...new Set(members.flatMap((m) => (m.team_id ? [m.team_id] : [])))];
    return teams
      .map((teamId) => {
        const list = members.filter((m) => m.team_id === teamId);
        const st = status(list);
        return { id: `${parent}:group:${teamId}`, label: teamLabel(db, teamId) ?? "Group", sub: `${plural(list.length, "member")} · ${st.text} · ${list.map((m) => m.name).join(", ")}`, flag: st.flag };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  };
  const views = (parent: string, itemType: string, members: Member[], status: (m: Member[]) => { text: string; flag: string | null }) => [
    { id: "student", label: "Per student", type: itemType, items: members.map((m) => ({ id: `${parent}:student:${m.id}`, label: m.name, sub: `${label(m.team_id, null)} · ${m.detail}`, flag: m.flag })) },
    { id: "group", label: "Per group", type: itemType, items: group(members, parent, itemType, status) },
  ];

  if (type === "section") {
    const name = sectionName(db, id);
    if (!name) return notFound();
    const students = mine.filter((s) => s.section_id === id).sort((a, b) => a.name.localeCompare(b.name));
    const teams = [...new Set(students.flatMap((s) => (s.team_id ? [s.team_id] : [])))];
    return {
      title: name,
      whole: { type: "section", id, label: "Whole section", sub: `${plural(students.length, "student")} · ${plural(teams.length, "group")}` },
      views: [
        { id: "student", label: "Per student", type: "student", items: students.map((s) => ({ id: s.id, label: s.name, sub: db.teams.find((t) => t.id === s.team_id)?.name ?? "No group", flag: null })) },
        {
          id: "group", label: "Per group", type: "section_group",
          items: teams.map((teamId) => {
            const list = students.filter((s) => s.team_id === teamId);
            return { id: teamId, label: teamLabel(db, teamId) ?? "Group", sub: `${plural(list.length, "member")} · ${list.map((m) => m.name).join(", ")}`, flag: null };
          }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
        },
      ],
    };
  }

  if (type === "return_demo" || type === "patient_case") {
    const demo = db.scenarios.find((s) => s.id === id && (s.kind ?? "patient_case") === type);
    if (!demo) return notFound();
    const members: Member[] = db.assignments
      .filter((a) => a.scenario_id === id)
      .flatMap((a) => {
        const s = mine.find((x) => x.id === a.student_id);
        const graded = a.status === "completed";
        return s ? [{ id: s.id, name: s.name, team_id: s.team_id ?? null, flag: graded ? null : "Not performed", detail: graded && a.score != null ? `Performed · ${a.score}%` : "Not yet performed", graded } as Member & { graded: boolean }] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      title: demo.title,
      whole: type === "patient_case" ? { type: "scenario", id, label: "Whole class", sub: `Everyone given this patient case, ${plural(members.length, "student")}` } : null,
      views: views(id, type, members, (list) => {
        const pending = list.filter((m) => m.flag).length;
        return { text: `${list.length - pending} performed`, flag: pending ? `${pending} not performed` : null };
      }),
    };
  }

  if (type === "quiz") {
    const quiz = db.quizzes.find((q) => q.id === id);
    if (!quiz) return notFound();
    const members: Member[] = mine
      .filter((s) => db.quizAssignments.some((a) => a.assessment_id === id && a.student_id === s.id) || db.attempts.some((a) => a.assessment_id === id && a.student_id === s.id))
      .map((s) => {
        const scores = db.attempts.filter((a) => a.assessment_id === id && a.student_id === s.id && a.status === "submitted" && a.score != null).map((a) => a.score!);
        const grade = scores.length ? Math.round(mean(scores)!) : null;
        return { id: s.id, name: s.name, team_id: s.team_id ?? null, flag: grade === null ? "Not taken" : null, detail: grade === null ? "Not taken" : `Grade ${grade}%` };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      title: quiz.title,
      whole: { type: "assessment", id, label: "Whole class", sub: `Everyone given this quiz, ${plural(members.length, "student")}` },
      views: views(id, "quiz", members, (list) => {
        const waiting = list.filter((m) => m.flag).length;
        return { text: `${list.length - waiting} submitted`, flag: waiting ? `${waiting} not taken` : null };
      }),
    };
  }
  return notFound();
});

route("GET", "/api/faculty/reports/:type", (ctx) => (staffOnly(ctx) ? report(ctx) : forbidden()));
route("GET", "/api/admin/reports/:type", (ctx) => (ctx.role === "admin" ? report(ctx) : forbidden()));

// One entry per report, the newest pull of it, as /api/reports/recent answers.
route("GET", "/api/reports/recent", (ctx) => {
  const seen = new Set<string>();
  const reports = ctx.db.audit
    .filter((r) => r.actor_id === ctx.viewer.id && r.action === "report.generate")
    .map((r) => ({
      type: r.entity_type ?? "",
      target_id: (r.details.target_id as string | null) ?? null,
      subject: String(r.details.subject ?? r.entity_type ?? "Report"),
      created_at: r.created_at,
    }))
    .filter((r) => {
      const key = `${r.type}:${r.target_id ?? "all"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { reports: reports.slice(0, 10) };
});
