import type { SessionPayload } from './auth/session';
import type { getSupabaseAdmin } from './supabase/server';
import { bucketStart, deriveBucket, type AnalyticsBucket, type SummaryArgs } from './analytics';
import {
  loadActivityItems,
  loadOfferingRosters,
  loadOwnOffering,
  loadSectionNames,
  type OwnOffering,
  type RosterStudent,
} from './courses';
import type { RequirementRow } from './course-progress';
import { isGraded, loadItemWork, readAll, type GradedWork, type HandedInWork } from './graded-work';
import type { WorkKind } from './work-kinds';

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
  /** Its activities: id -> kind of work. */
  items: Map<string, WorkKind>;
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
 * 'not_found' when it isn't one of the instructor's own, the way a course
 * route answers 404. Only instructors have this filter.
 */
export async function loadCourseScope(
  supabase: Supabase,
  session: SessionPayload,
  params: URLSearchParams,
): Promise<CourseScope | 'not_found' | null> {
  const id = params.get('offering_id');
  if (!id) return null;
  if (session.role !== 'faculty') return 'not_found';
  const offering = await loadOwnOffering(supabase, session.uid, id);
  if (!offering) return 'not_found';

  const [rosters, activities] = await Promise.all([
    loadOfferingRosters(supabase, [{ id, faculty_id: offering.faculty_id, section_ids: offering.section_ids }]),
    loadActivityItems(supabase, [id]),
  ]);
  const wanted = new Set((params.get('section_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const students = (rosters.get(id)?.students ?? []).filter((s) => wanted.size === 0 || wanted.has(s.section_id));

  const items = new Map<string, WorkKind>();
  for (const item of activities ?? []) {
    const kind = item.activity_type ? KIND_OF_ITEM[item.activity_type] : undefined;
    if (kind) items.set(item.id, kind);
  }
  const sections = await loadSectionNames(supabase, [...new Set(students.map((s) => s.section_id).filter(Boolean))]);
  return { offering, students, items, sectionNames: new Map(sections.map((s) => [s.id, s.name])) };
}

/**
 * The warehouse call for the course's roster, inside its term. The roster
 * alone sets who counts: it can reach past the sections of the instructor's
 * groups. A range wholly outside the term ends up with from after to, which
 * matches nothing.
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

/** Ranked the way dw_student_leaderboard ranks: average, then how much is graded, then id. */
export function rankCourseStudents(scope: CourseScope, graded: GradedWork[]) {
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

function cohortFigures(scope: CourseScope, work: HandedInWork[], graded: GradedWork[]) {
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
      cohort: cohortFigures(scope, work, graded),
      weekly_trend: trendFigures(graded, args.p_bucket),
      top_students: rankCourseStudents(scope, graded).slice(0, 10),
      ...(await competencyFigures(supabase, work)),
    },
  };
}
