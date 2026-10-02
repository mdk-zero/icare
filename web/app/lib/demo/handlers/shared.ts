"use client";

import { json, notInDemo, route } from "../router";
import { newId, type DemoDb } from "../store";
import type { DemoUser } from "../fixtures/people";
import { listSkillSummaries, skillDetails } from "../fixtures/skills";
import { visibleSections } from "./scope";

/** The account as `/api/auth/session` and `/api/users/profile` return it. */
export function publicUser(user: DemoUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    picture_url: user.picture_url,
    sex: user.sex,
    has_password: true,
    google_linked: user.google_linked,
    force_password_change: false,
  };
}

// --- Session and account ---------------------------------------------------

route("GET", "/api/auth/session", ({ viewer }) => ({ user: { ...publicUser(viewer), section: null } }));
route("POST", "/api/auth/logout", () => ({ ok: true }));
route("GET", "/api/users/profile", ({ viewer }) => ({ user: publicUser(viewer) }));
route("PATCH", "/api/users/profile", ({ viewer, body }) => {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return json({ error: "Name is required" }, 400);
  if (name.length > 100) return json({ error: "Name is too long" }, 400);
  viewer.name = name;
  return { user: publicUser(viewer) };
});
// Demo accounts have no stored photos; a demo password can't be changed.
route("GET", "/api/users/avatar-url", () => json({ error: "Not found" }, 404));
route("POST", "/api/users/change-password", notInDemo);

// --- Plumbing ----------------------------------------------------------------

route("GET", "/api/health", () => ({ ok: true }));
route("HEAD", "/api/health", () => new Response(null, { status: 200 }));
route("POST", "/api/metrics", ({ body }) => ({ accepted: Array.isArray(body?.events) ? body.events.length : 0 }));

// --- Notifications -----------------------------------------------------------

function notificationsFor(db: DemoDb, userId: string) {
  return db.notifications.filter((n) => n.user_id === userId);
}

route("GET", "/api/notifications", ({ db, viewer }) => {
  const mine = notificationsFor(db, viewer.id)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, data: n.data, read_at: n.read_at, created_at: n.created_at }));
  return { notifications: mine, unread: mine.filter((n) => !n.read_at).length };
});

route("PATCH", "/api/notifications", ({ db, viewer, body }) => {
  const now = new Date().toISOString();
  for (const n of notificationsFor(db, viewer.id)) {
    if ((body?.all || n.id === body?.id) && !n.read_at) n.read_at = now;
  }
  return { success: true };
});

// --- Shared reference data ---------------------------------------------------

route("GET", "/api/sections", ({ db, role, viewer }) => ({
  sections: visibleSections(db, role, viewer.id).map((s) => ({ id: s.id, name: s.name })),
}));

route("GET", "/api/skills", async ({ query }) => {
  const ids = query.get("ids");
  if (ids) return { skills: await skillDetails(ids.split(",").map((s) => s.trim()).filter(Boolean)) };
  return { skills: await listSkillSummaries() };
});

route("GET", "/api/competencies", async () => {
  const { TAYLORS_CHAPTERS, ACTIVE_SKILL_AREA_IDS } = await import("@/scripts/taylors-chapters");
  return {
    competencies: TAYLORS_CHAPTERS.filter((c) => ACTIVE_SKILL_AREA_IDS.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, description: c.description ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
});

// --- Audit trail (every portal writes to it) ---------------------------------

/** Appends an audit_logs row as the viewer, the way lib/audit.ts logAudit does. */
export function audit(
  db: DemoDb,
  viewer: DemoUser,
  action: string,
  entityType: string | null,
  details: Record<string, unknown>,
  entityId: string | null = null,
) {
  db.audit.unshift({
    id: newId(),
    actor_id: viewer.id,
    actor_role: viewer.role,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    ip_address: "203.177.42.18",
    created_at: new Date().toISOString(),
  });
}

route("POST", "/api/faculty/audit", ({ db, viewer, body }) => {
  if (typeof body?.tab !== "string" || typeof body?.action !== "string" || typeof body?.details !== "string") {
    return json({ error: "tab, action, and details are required" }, 400);
  }
  audit(
    db,
    viewer,
    body.action,
    body.tab,
    {
      message: body.details,
      ...(typeof body.target_type === "string" ? { target_type: body.target_type } : {}),
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    },
    typeof body.target_id === "string" ? body.target_id : null,
  );
  return json({ success: true }, 201);
});
