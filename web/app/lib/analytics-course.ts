import type { SessionPayload } from './auth/session';
import type { getSupabaseAdmin } from './supabase/server';
import { getAdminScope } from './admin-scope';
import { deanFor } from './dean-scope';
import { bucketStart, deriveBucket, type AnalyticsBucket, type SummaryArgs } from './analytics';
import {
  loadActivityItems,
  loadDeanTaughtOffering,
  loadOfferingRosters,
  loadOwnOffering,
  loadSectionNames,
  type OwnOffering,
  type RosterStudent,
} from './courses';
import type { RequirementRow } from './course-progress';
import { isMissingTeamTables, loadTeams, manageableSectionIds } from './teams';
import { isGraded, loadGradedWork, loadItemWork, readAll, type GradedWork, type HandedInWork } from './graded-work';
import { WORK_KINDS, type WorkKind } from './work-kinds';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * One course's figures for the Analytics page. Work belongs to a course
 * through its activity (offering_id, migration 070): the course's Patient
 * Cases, Return Demonstrations, Quizzes and Case Presentations, handed in by
 * its roster during its term, the same window its grade counts.
 *
 * The warehouse has no course dimension, so the graded-work figures are worked
 * out here from the rows dw.fact_student_work is loaded from, in the same way
 * dw_analytics_summary works them out. What belongs to no course (low-performing
 * labels, clinical activity) still comes from the warehouse, for the roster.
 */

export interface CourseScope {
  offering: OwnOffering;
  /** On its roster, in the sections asked for. */
  students: RosterStudent[];
  /** Its activities: id -> kind of work. Only the kinds asked for when the criteria are narrowed. */
  items: Map<string, WorkKind>;
  /** The kinds of work the course has at all, whatever is asked for, so the criteria filter can list them. */
  kinds: WorkKind[];
  sectionNames: Map<string, string>;
}

const KIND_OF_ITEM: Partial<Record<NonNullable<RequirementRow['activity_type']>, WorkKind>> = {
  scenario: 'patient_case',
  return_demo: 'return_demo',
  assessment: 'quiz',
  case_presentation: 'case_presentation',
};

/**
 * `?offering_id=` as a scope. Null when the request isn't for one course;
 * 'not_found' when it isn't one the viewer may read, the way a course route
 * answers 404: an instructor's own assignment, or an assignment of a Dean's
 * own course, whoever teaches it. A Program Chair reads theirs as a Dean does.
 *
 * A Dean still sees only the students they own, as on the rest of their page,
 * should a roster reach past them. An instructor's roster can rightly reach
 * past their groups, so it isn't limited.
 */
export async function loadCourseScope(
  supabase: Supabase,
  session: SessionPayload,
  params: URLSearchParams,
): Promise<CourseScope | 'not_found' | null> {
  const id = params.get('offering_id');
  if (!id) return null;
  if (session.role !== 'faculty' && session.role !== 'admin') return 'not_found';
  const offering =
    session.role === 'faculty'
      ? await loadOwnOffering(supabase, session.uid, id)
      : await loadDeanTaughtOffering(supabase, await deanFor(supabase, session.uid), id);
  if (!offering) return 'not_found';

  const [rosters, activities, deanScope] = await Promise.all([
    loadOfferingRosters(supabase, [{ id, faculty_id: offering.faculty_id, section_ids: offering.section_ids }]),
    loadActivityItems(supabase, [id]),
    session.role === 'admin' ? getAdminScope(supabase, session.uid) : null,
  ]);
  const wanted = new Set((params.get('section_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const own = deanScope ? new Set(deanScope.studentIds) : null;
  const students = (rosters.get(id)?.students ?? []).filter(
    (s) => (wanted.size === 0 || wanted.has(s.section_id)) && (!own || own.has(s.id)),
  );

  // Criteria: only these kinds of work (an unknown one narrows to nothing, not to everything).
  const askedKinds = splitParam(params.get('kinds'));
  const kinds = new Set<WorkKind>();
  const items = new Map<string, WorkKind>();
  for (const item of activities ?? []) {
    const kind = item.activity_type ? KIND_OF_ITEM[item.activity_type] : undefined;
    if (!kind) continue;
    kinds.add(kind);
    if (askedKinds.length === 0 || askedKinds.includes(kind)) items.set(item.id, kind);
  }

  // One group (or a few) of the roster. A student's group is as the performance chart
  // draws them: their own group, else their section.
  const askedGroups = splitParam(params.get('group_ids'));
  let inGroups = students;
  if (askedGroups.length > 0) {
    const groupOf = await courseGroupOf(supabase, session, offering.section_ids, students);
    inGroups = students.filter((s) => askedGroups.includes(groupOf.get(s.id) ?? ''));
  }

  const sections = await loadSectionNames(supabase, [...new Set(inGroups.map((s) => s.section_id).filter(Boolean))]);
  return {
    offering,
    students: inGroups,
    items,
    kinds: WORK_KINDS.map((k) => k.kind).filter((k) => kinds.has(k)),
    sectionNames: new Map(sections.map((s) => [s.id, s.name])),
  };
}

const splitParam = (value: string | null) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

/**
 * Each rostered student's group id: the group an instructor supervises (every
 * group, for a Dean), else `section:<id>`, the stand-in the performance chart
 * gives a student in no group of the viewer's.
 */
async function courseGroupOf(
  supabase: Supabase,
  session: SessionPayload,
  sectionIds: string[],
  students: RosterStudent[],
): Promise<Map<string, string>> {
  const groupOf = new Map<string, string>();
  const { teams, error } = await loadTeams(supabase, sectionIds);
  if (error && !isMissingTeamTables(error)) throw error;
  for (const t of session.role === 'faculty' ? teams.filter((t) => t.faculty_id === session.uid) : teams) {
    for (const m of t.members) groupOf.set(m.id, t.id);
  }
  for (const s of students) if (!groupOf.has(s.id)) groupOf.set(s.id, `section:${s.section_id}`);
  return groupOf;
}

/**
 * The warehouse call for the course's roster, inside its term. The roster
 * alone sets who counts: it can reach past the sections of the instructor's
 * groups (loadCourseScope has already held a Dean to their own students). A
 * range wholly outside the term ends up with from after to, which matches
 * nothing.
 */
export function courseArgs(args: SummaryArgs, scope: CourseScope): SummaryArgs {
  const { starts_on, ends_on } = scope.offering.term;
  const from = args.p_from && args.p_from > starts_on ? args.p_from : starts_on;
  const to = args.p_to && args.p_to < ends_on ? args.p_to : ends_on;
  return {
    p_section_ids: null,
    p_from: from,
    p_to: to,
    p_bucket: deriveBucket(from, to),
    p_student_ids: scope.students.map((s) => s.id),
  };
}

/** What the course's roster handed in on its activities, in the call's window. */
export function loadCourseWork(supabase: Supabase, scope: CourseScope, args: SummaryArgs): Promise<HandedInWork[]> {
  return loadItemWork(
    supabase,
    scope.students.map((s) => s.id),
    scope.items,
    { from: args.p_from!, to: args.p_to! },
  );
}

const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/** Who the figures are about: a course's roster, or the viewer's students narrowed by a filter. */
type Roster = {
  students: Pick<RosterStudent, 'id' | 'name' | 'picture_url' | 'sex' | 'section_id'>[];
  sectionNames: Map<string, string>;
};

/** Ranked the way dw_student_leaderboard ranks: average, then how much is graded, then id. */
export function rankCourseStudents(scope: Roster, graded: GradedWork[]) {
  // The exact average: rounded ones can tie where the warehouse's don't.
  const average = new Map<string, number>();
  const ranked = scope.students.flatMap((s) => {
    const mine = graded.filter((w) => w.student_id === s.id);
    if (mine.length === 0) return [];
    const byKind: Partial<Record<WorkKind, number>> = {};
    for (const kind of new Set(mine.map((w) => w.kind))) {
      byKind[kind] = oneDecimal(mean(mine.filter((w) => w.kind === kind).map((w) => w.score)));
    }
    average.set(s.id, mean(mine.map((w) => w.score)));
    return [
      {
        student_key: s.id,
        name: s.name,
        picture_url: s.picture_url,
        sex: s.sex,
        section: scope.sectionNames.get(s.section_id) ?? null,
        average_score: oneDecimal(average.get(s.id)!),
        attempts: mine.length,
        by_kind: byKind,
      },
    ];
  });
  return ranked.sort(
    (a, b) =>
      average.get(b.student_key)! - average.get(a.student_key)! ||
      b.attempts - a.attempts ||
      a.student_key.localeCompare(b.student_key),
  );
}

function cohortFigures(scope: Roster, work: { student_id: string }[], graded: GradedWork[]) {
  const byKind: Partial<Record<WorkKind, { average_score: number; graded: number; students: number }>> = {};
  for (const kind of new Set(graded.map((w) => w.kind))) {
    const ofKind = graded.filter((w) => w.kind === kind);
    byKind[kind] = {
      average_score: oneDecimal(mean(ofKind.map((w) => w.score))),
      graded: ofKind.length,
      students: new Set(ofKind.map((w) => w.student_id)).size,
    };
  }
  return {
    total_students: scope.students.length,
    submitted_attempts: graded.filter((w) => w.kind === 'quiz').length,
    graded: graded.length,
    average_score: graded.length > 0 ? oneDecimal(mean(graded.map((w) => w.score))) : null,
    active_students_30d: new Set(work.map((w) => w.student_id)).size,
    by_kind: byKind,
  };
}

/** Per section, in the warehouse's order: who is on the roster, and who handed in the course's work. */
function sectionFigures(scope: Roster, work: { student_id: string }[]) {
  const active = new Set(work.map((w) => w.student_id));
  const sectionIds = [...new Set(scope.students.map((s) => s.section_id).filter(Boolean))];
  return sectionIds
    .map((id) => {
      const members = scope.students.filter((s) => s.section_id === id);
      return {
        id,
        name: scope.sectionNames.get(id) ?? 'Section',
        students: members.length,
        active_students: members.filter((s) => active.has(s.id)).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function trendFigures(graded: GradedWork[], bucket: AnalyticsBucket) {
  const buckets = new Map<string, number[]>();
  for (const w of graded) {
    const start = bucketStart(w.date, bucket);
    buckets.set(start, [...(buckets.get(start) ?? []), w.score]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, scores]) => ({
      week_start,
      average_score: oneDecimal(mean(scores)),
      attempts: scores.length,
    }));
}

/**
 * Skill area scores from the course's quizzes: submitting a quiz rolls its
 * criteria into competency_scores against that attempt. A score an instructor
 * records by hand names no attempt, so it belongs to no course and isn't here.
 */
async function competencyFigures(supabase: Supabase, work: HandedInWork[]) {
  const attemptIds = work.filter((w) => w.kind === 'quiz').map((w) => w.id);
  const rows = await readAll<{ student_id: string; score: number; competency_areas: { name: string } | null }>(
    attemptIds,
    (part) => supabase.from('competency_scores').select('student_id, score, competency_areas(name)').in('attempt_id', part),
  );
  const byArea = new Map<string, { student_id: string; score: number }[]>();
  for (const r of rows) {
    const name = r.competency_areas?.name;
    if (name) byArea.set(name, [...(byArea.get(name) ?? []), { student_id: r.student_id, score: Number(r.score) }]);
  }
  const competency_detail = [...byArea.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, scores]) => ({
      name,
      ratings: scores.length,
      students: new Set(scores.map((s) => s.student_id)).size,
      average_score: oneDecimal(mean(scores.map((s) => s.score))),
      pass_rate_pct: oneDecimal((100 * scores.filter((s) => s.score >= 75).length) / scores.length),
    }));
  return {
    competency_detail,
    competency_breakdown: Object.fromEntries(competency_detail.map((c) => [c.name, c.average_score])),
  };
}

/**
 * The course's own figures, to lay over the warehouse's summary, and its graded
 * work for whatever else is drawn from it.
 */
export async function courseFigures(supabase: Supabase, scope: CourseScope, args: SummaryArgs) {
  const work = await loadCourseWork(supabase, scope, args);
  const graded = work.filter(isGraded);
  return {
    graded,
    figures: {
      sections: sectionFigures(scope, work),
      cohort: cohortFigures(scope, work, graded),
      weekly_trend: trendFigures(graded, args.p_bucket),
      top_students: rankCourseStudents(scope, graded).slice(0, 10),
      course_kinds: scope.kinds,
      ...(await competencyFigures(supabase, work)),
    },
  };
}

const NOBODY = '00000000-0000-0000-0000-000000000000';

/**
 * `?group_ids=` without a course: only those groups' students count, which the
 * warehouse already honours through `p_student_ids`. Faculty may name only
 * groups they supervise. An unknown group narrows to nobody, not to everyone.
 */
export async function narrowToGroups(
  supabase: Supabase,
  session: SessionPayload,
  args: SummaryArgs,
  groupIds: string[],
): Promise<SummaryArgs> {
  const sectionIds = await manageableSectionIds(supabase, session.role, session.uid);
  const { teams, error } = await loadTeams(supabase, sectionIds);
  if (error && !isMissingTeamTables(error)) throw error;
  const members = new Set<string>();
  for (const t of session.role === 'faculty' ? teams.filter((t) => t.faculty_id === session.uid) : teams) {
    if (groupIds.includes(t.id)) for (const m of t.members) members.add(m.id);
  }
  const allowed = args.p_student_ids ? new Set(args.p_student_ids) : null;
  const ids = [...members].filter((id) => !allowed || allowed.has(id));
  return { ...args, p_student_ids: ids.length > 0 ? ids : [NOBODY] };
}

/**
 * The summary's graded-work figures for only some kinds of work, over the
 * students `args` names. The warehouse can't filter by kind, so they are worked
 * out from the graded rows, as for a course. Null when `args` names no students
 * to read (an unlimited call).
 */
export async function kindFigures(supabase: Supabase, args: SummaryArgs, kinds: WorkKind[]) {
  if (!args.p_student_ids) return null;
  const rows = await readAll<{
    id: string;
    name: string;
    picture_url: string | null;
    sex: 'male' | 'female' | null;
    section_id: string | null;
  }>(args.p_student_ids, (part) =>
    supabase.from('users').select('id, name, picture_url, sex, section_id').in('id', part),
  );
  const sectionIds = args.p_section_ids ? new Set(args.p_section_ids) : null;
  const students = rows
    .filter((r) => r.section_id && (!sectionIds || sectionIds.has(r.section_id)))
    .map((r) => ({ ...r, section_id: r.section_id! }));
  const sections = await loadSectionNames(supabase, [...new Set(students.map((s) => s.section_id))]);
  const scope: Roster = { students, sectionNames: new Map(sections.map((s) => [s.id, s.name])) };

  const graded = await loadGradedWork(
    supabase,
    students.map((s) => s.id),
    { from: args.p_from ?? '1970-01-01', to: args.p_to, kinds },
  );
  return {
    sections: sectionFigures(scope, graded),
    cohort: cohortFigures(scope, graded, graded),
    weekly_trend: trendFigures(graded, args.p_bucket),
    top_students: rankCourseStudents(scope, graded).slice(0, 10),
    // Skill areas come from quizzes alone.
    ...(kinds.includes('quiz') ? {} : { competency_detail: [], competency_breakdown: {} }),
  };
}
