import { NextResponse, type NextRequest } from 'next/server';
import type { getSupabaseAdmin } from './supabase/server';
import { readSession } from './auth/session';
import type { SessionPayload } from './auth/jwt';
import { isSkillId, listSkills } from './taylor-skills';
import { courseSkillSuggestions, keywordSuggestions } from './skill-suggest';
import { aiErrorResponse } from './ai/generate';
import { isMissingTeamTables, manageableSectionIds } from './teams';
import { getAdminScope, ownsFaculty } from './admin-scope';
import type { Parsed } from './course-progress';

export { parseCourse, parseTerm, type CourseInput, type TermInput } from './course-progress';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Server side of courses, terms and course assignments (migration 065).
 * A Dean owns their terms and courses (admin_id) and assigns a course to one
 * of their instructors for some sections in a term: a course offering. The
 * offering's students are the instructor's own group members in those
 * sections, the same rule as everywhere else an instructor sees students
 * (roster.ts).
 */

export const COURSES_NEED_MIGRATION = 'Courses need database migration 065 (courses) applied first.';

/** Before migration 065 the tables don't exist (42P01 from Postgres, PGRST205 from PostgREST). */
export function isMissingCourseSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205' || code === '42703' || code === 'PGRST204';
}

/** For route handlers: the session, or the 401/403 response to return instead. */
export async function requireRole(
  role: 'admin' | 'faculty',
): Promise<{ session: SessionPayload; response?: never } | { session?: never; response: NextResponse }> {
  const session = await readSession();
  if (!session) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== role) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

/** The 503 before migration 065, otherwise a logged 500. */
export function courseFailure(err: unknown, message: string): NextResponse {
  if (isMissingCourseSchema(err)) {
    return NextResponse.json({ error: COURSES_NEED_MIGRATION }, { status: 503 });
  }
  console.error(message, err);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** A Supabase result's data, or its error thrown (code intact) for courseFailure. */
export function must<D>(res: { data: D; error: unknown }): D {
  if (res.error) throw res.error;
  return res.data;
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
export const notFound = (what: string) => NextResponse.json({ error: `${what} not found` }, { status: 404 });

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** A list of distinct uuids-or-ids from the body, or null when it isn't a string array. */
export function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) return null;
  return [...new Set(value as string[])];
}

// ---------------------------------------------------------------------------
// Rosters
// ---------------------------------------------------------------------------

export interface RosterStudent {
  id: string;
  name: string;
  picture_url: string | null;
  sex: 'male' | 'female' | null;
  section_id: string;
  team_id: string;
  /** "BSN 1101 · Group A" */
  group_label: string;
}

export interface OfferingRoster {
  students: RosterStudent[];
  /** Offering sections where the instructor supervises no group, so no students come from them. */
  sectionsWithoutGroup: string[];
}

export interface OfferingRef {
  id: string;
  faculty_id: string | null;
  section_ids: string[];
}

/**
 * Each offering's students: the members of the groups its instructor
 * supervises within its sections. Computed on every read, so a group the
 * Dean assigns later fills the roster straight away.
 */
export async function loadOfferingRosters(
  supabase: Supabase,
  offerings: OfferingRef[],
): Promise<Map<string, OfferingRoster>> {
  const empty = (o: OfferingRef): OfferingRoster => ({ students: [], sectionsWithoutGroup: [...o.section_ids] });
  const result = new Map(offerings.map((o) => [o.id, empty(o)]));

  const facultyIds = [...new Set(offerings.map((o) => o.faculty_id).filter((id): id is string => !!id))];
  const sectionIds = [...new Set(offerings.flatMap((o) => o.section_ids))];
  if (facultyIds.length === 0 || sectionIds.length === 0) return result;

  const [teamsRes, sectionsRes] = await Promise.all([
    supabase.from('teams').select('id, name, section_id, faculty_id').in('faculty_id', facultyIds).in('section_id', sectionIds),
    supabase.from('sections').select('id, name').in('id', sectionIds),
  ]);
  if (teamsRes.error) {
    // Before 048/051 nobody supervises a group, so every roster is empty.
    if (isMissingTeamTables(teamsRes.error)) return result;
    throw teamsRes.error;
  }
  const teams = (teamsRes.data ?? []) as { id: string; name: string; section_id: string; faculty_id: string }[];
  if (teams.length === 0) return result;
  const sectionName = new Map((sectionsRes.data ?? []).map((s) => [s.id as string, s.name as string]));

  const membersRes = await supabase
    .from('team_members')
    .select('team_id, student_id, users!inner(id, name, picture_url, sex, role)')
    .in('team_id', teams.map((t) => t.id))
    .eq('users.role', 'student');
  if (membersRes.error) throw membersRes.error;

  const membersByTeam = new Map<string, RosterStudent[]>();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  for (const row of membersRes.data ?? []) {
    const team = teamById.get(row.team_id as string);
    const user = row.users as unknown as { id: string; name: string | null; picture_url: string | null; sex: string | null };
    if (!team || !user) continue;
    const list = membersByTeam.get(team.id) ?? [];
    list.push({
      id: user.id,
      name: user.name ?? 'Student',
      picture_url: user.picture_url,
      sex: user.sex === 'male' || user.sex === 'female' ? user.sex : null,
      section_id: team.section_id,
      team_id: team.id,
      group_label: `${sectionName.get(team.section_id) ?? 'Section'} · ${team.name}`,
    });
    membersByTeam.set(team.id, list);
  }

  for (const o of offerings) {
    const own = teams.filter((t) => t.faculty_id === o.faculty_id && o.section_ids.includes(t.section_id));
    const covered = new Set(own.map((t) => t.section_id));
    const students = own
      .flatMap((t) => membersByTeam.get(t.id) ?? [])
      .sort((a, b) => a.group_label.localeCompare(b.group_label, undefined, { numeric: true }) || a.name.localeCompare(b.name));
    result.set(o.id, {
      students,
      sectionsWithoutGroup: o.section_ids.filter((id) => !covered.has(id)),
    });
  }
  return result;
}

/** Offering ids → their section ids. */
export async function loadOfferingSections(supabase: Supabase, offeringIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map(offeringIds.map((id) => [id, [] as string[]]));
  if (offeringIds.length === 0) return map;
  const rows = must(
    await supabase.from('course_offering_sections').select('offering_id, section_id').in('offering_id', offeringIds),
  ) as { offering_id: string; section_id: string }[];
  for (const r of rows) map.get(r.offering_id)?.push(r.section_id);
  return map;
}

// ---------------------------------------------------------------------------
// Course skills
// ---------------------------------------------------------------------------

/** Every catalog skill could belong to one course, but a sane cap keeps the picker honest. */
export const MAX_COURSE_SKILLS = 120;

export async function loadCourseSkillIds(supabase: Supabase, courseIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map(courseIds.map((id) => [id, [] as string[]]));
  if (courseIds.length === 0) return map;
  const rows = must(
    await supabase.from('course_skills').select('course_id, skill_id').in('course_id', courseIds),
  ) as { course_id: string; skill_id: string }[];
  for (const r of rows) map.get(r.course_id)?.push(r.skill_id);
  return map;
}

/**
 * Replace a course's shared skill list. `aiIds` are the ids the user took
 * from an AI suggestion; skills already on the list keep their source.
 */
export async function replaceCourseSkills(
  supabase: Supabase,
  courseId: string,
  skillIds: string[],
  aiIds: string[],
  uid: string,
): Promise<{ added: string[]; removed: string[] }> {
  const wanted = [...new Set(skillIds)].filter(isSkillId);
  const current = must(
    await supabase.from('course_skills').select('skill_id').eq('course_id', courseId),
  ) as { skill_id: string }[];
  const have = new Set(current.map((r) => r.skill_id));
  const keep = new Set(wanted);
  const removed = [...have].filter((id) => !keep.has(id));
  const added = wanted.filter((id) => !have.has(id));

  if (removed.length) {
    must(await supabase.from('course_skills').delete().eq('course_id', courseId).in('skill_id', removed));
  }
  if (added.length) {
    const ai = new Set(aiIds);
    must(
      await supabase.from('course_skills').insert(
        added.map((skill_id) => ({
          course_id: courseId,
          skill_id,
          source: ai.has(skill_id) ? 'ai' : 'manual',
          added_by: uid,
        })),
      ),
    );
  }
  return { added, removed };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Tell an instructor a Dean gave them a course; a failure never fails the request. */
export async function notifyCourseAssigned(
  supabase: Supabase,
  facultyId: string,
  offeringId: string,
  course: { code: string; title: string },
  termName: string,
  sectionNames: string[],
): Promise<void> {
  const sections = sectionNames.length ? ` for ${sectionNames.join(', ')}` : '';
  const { error } = await supabase.from('notifications').insert({
    user_id: facultyId,
    type: 'assignment_created',
    title: 'New course assignment',
    body: `You were assigned ${course.code} ${course.title}${sections} (${termName}). Set up its requirements checklist.`,
    data: { kind: 'course', offeringId },
  });
  if (error) console.error('Failed to notify instructor of course assignment', error);
}

// ---------------------------------------------------------------------------
// AI skill detection
// ---------------------------------------------------------------------------

/**
 * Suggest a course's skills from its code, title and description: the AI
 * first, keyword matching when it is unavailable. Nothing is saved; the
 * caller shows the picks for the user to confirm.
 */
export async function suggestCourseSkillsResponse(
  supabase: Supabase,
  course: { code: string; title: string; description: string },
): Promise<NextResponse> {
  const courseText = [
    `Code: ${course.code}`,
    `Title: ${course.title}`,
    course.description && `Description: ${course.description}`,
  ]
    .filter(Boolean)
    .join('\n');
  const catalog = await listSkills(supabase);
  let aiError: unknown = null;
  try {
    const suggestions = await courseSkillSuggestions(courseText, catalog);
    if (suggestions.length > 0) return NextResponse.json({ suggestions, source: 'ai' });
  } catch (err) {
    aiError = err;
    console.warn('AI course skill detection failed, matching keywords instead', err instanceof Error ? err.message : err);
  }
  const suggestions = keywordSuggestions(courseText, catalog);
  if (suggestions.length === 0 && aiError) {
    const { error, status } = aiErrorResponse(aiError, 'skill suggestions');
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ suggestions, source: 'keywords' });
}

// ---------------------------------------------------------------------------
// Course assignments (Dean)
// ---------------------------------------------------------------------------

export interface AssignmentTarget {
  faculty: { id: string; name: string };
  sections: { id: string; name: string }[];
}

/**
 * Check who a Dean is assigning a course to: one of their own instructors,
 * for sections they manage. Returns the error to show, or the resolved names.
 */
export async function checkAssignmentTarget(
  supabase: Supabase,
  adminId: string,
  facultyId: unknown,
  sectionIds: string[] | null,
): Promise<Parsed<AssignmentTarget>> {
  if (typeof facultyId !== 'string' || !facultyId) return { ok: false, error: 'Choose an instructor' };
  if (!sectionIds || sectionIds.length === 0) return { ok: false, error: 'Choose at least one section' };

  const scope = await getAdminScope(supabase, adminId);
  if (!ownsFaculty(scope, facultyId)) return { ok: false, error: 'That instructor is not one of yours' };
  const faculty = must(
    await supabase.from('users').select('id, name').eq('id', facultyId).eq('role', 'faculty').maybeSingle(),
  );
  if (!faculty) return { ok: false, error: 'That instructor is not one of yours' };

  const allowed = new Set(await manageableSectionIds(supabase, 'admin', adminId));
  if (sectionIds.some((id) => !allowed.has(id))) return { ok: false, error: 'One of those sections is not yours to assign' };
  const sections = (must(await supabase.from('sections').select('id, name').in('id', sectionIds)) ?? []) as {
    id: string;
    name: string;
  }[];
  if (sections.length !== sectionIds.length) return { ok: false, error: 'One of those sections no longer exists' };

  return {
    ok: true,
    value: {
      faculty: { id: faculty.id as string, name: (faculty.name as string) ?? 'Instructor' },
      sections: sections.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    },
  };
}

/** The Dean's own offering (through its course), with the course and term it belongs to. */
export async function loadDeanOffering(supabase: Supabase, adminId: string, id: string) {
  const row = must(
    await supabase
      .from('course_offerings')
      .select('id, course_id, term_id, faculty_id, courses!inner(admin_id, code, title), academic_terms(name, starts_on, ends_on)')
      .eq('id', id)
      .eq('courses.admin_id', adminId)
      .maybeSingle(),
  );
  if (!row) return null;
  const course = row.courses as unknown as { code: string; title: string };
  const term = row.academic_terms as unknown as { name: string; starts_on: string; ends_on: string } | null;
  return {
    id: row.id as string,
    course_id: row.course_id as string,
    term_id: row.term_id as string,
    faculty_id: (row.faculty_id as string | null) ?? null,
    course: { code: course.code, title: course.title },
    term: term ?? { name: 'Term', starts_on: '', ends_on: '' },
  };
}
