import { NextRequest, NextResponse, after } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import {
  bucketStart,
  callAnalytics,
  refreshWarehouse,
  resolveSummaryArgs,
  withStudentAvatars,
  type SummaryArgs,
} from '@/app/lib/analytics';
import { courseArgs, courseFigures, kindFigures, loadCourseScope, narrowToGroups, type CourseScope } from '@/app/lib/analytics-course';
import { isMissingTeamTables, loadTeams, manageableSectionIds } from '@/app/lib/teams';
import { viewerDeanId } from '@/app/lib/dean-scope';
import { loadGradedWork, type GradedWork } from '@/app/lib/graded-work';
import { WORK_KINDS, type WorkKind } from '@/app/lib/work-kinds';

/** `?kinds=` as the kinds it names; none valid means no limit. */
function askedKinds(params: URLSearchParams): WorkKind[] {
  const wanted = (params.get('kinds') ?? '').split(',');
  return WORK_KINDS.map((k) => k.kind).filter((k) => wanted.includes(k));
}

/**
 * Dashboard analytics read from the star-schema warehouse
 * (public.dw_analytics_summary → dw facts/dims). pg_cron refreshes the
 * warehouse every five minutes (migration 096). A warehouse older than
 * STALE_MS is still served as it is, and refreshed after the response (see
 * refreshInBackground); only one that has never been loaded is refreshed
 * before answering. A refresh inside every request used to stall the whole
 * system under load. POST /api/admin/etl still forces a run.
 *
 * Query params (all optional): section_ids (csv), from, to — see
 * resolveSummaryArgs, which also confines faculty to their own sections.
 * offering_id narrows the figures to one course: an instructor's own, or any
 * assignment of a Dean's own courses (see analytics-course.ts). group_trend=1
 * also attaches `group_trend` (see readGroupTrend).
 */
const STALE_MS = 5 * 60 * 1000; // refresh the warehouse at most every 5 minutes

type Summary = {
  etl?: { last_run_at?: string | null };
  /** `graded` arrives with migration 085, when the figures cover every kind of work. */
  cohort?: { graded?: number };
  room_utilization?: RoomUtilization[];
  weekly_trend?: { week_start: string; average_score: number; attempts: number }[];
  top_students?: { student_key: string }[];
} | null;

type RoomUtilization = {
  name: string;
  room_number: string;
  status: string;
  capacity: number;
  assigned: number;
  utilization_pct: number;
};

/**
 * The warehouse lists every room in the system; a Dean's viewers (077) get
 * their own ward's instead, worked out the same way: students rostered to
 * each room against its capacity.
 */
async function ownRoomUtilization(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  deanId: string,
): Promise<RoomUtilization[]> {
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('id, name, room_number, status, capacity')
    .eq('admin_id', deanId)
    .order('room_number');
  if (error) throw error;
  const ids = (rooms ?? []).map((r) => r.id as string);
  const { data: assignments } = ids.length
    ? await supabase.from('room_assignments').select('room_id').in('room_id', ids).is('ends_at', null)
    : { data: [] as { room_id: string }[] };
  const assigned = new Map<string, number>();
  for (const a of assignments ?? []) assigned.set(a.room_id as string, (assigned.get(a.room_id as string) ?? 0) + 1);
  return (rooms ?? []).map((r) => {
    const count = assigned.get(r.id as string) ?? 0;
    const capacity = Number(r.capacity ?? 0);
    return {
      name: r.name as string,
      room_number: r.room_number as string,
      status: String(r.status),
      capacity,
      assigned: count,
      utilization_pct: capacity > 0 ? Math.round((100 * count) / capacity) : 0,
    };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The summary's grade trend split by group, for the performance chart: the
 * same graded work, bucket truncation and window as the warehouse's
 * weekly_trend (from, or the last 8 weeks, through to), read from the live
 * tables and group membership so a group move shows at once. `kinds` is
 * every kind once the warehouse counts them all (085), quizzes until then,
 * so the chart never disagrees with the figures beside it.
 *
 * `groups` is every group the caller has in any of their sections, so the
 * chart can give each one a colour that survives the section filter; `points`
 * only covers the sections in scope. Faculty see only the groups they
 * supervise. Null when the groups or the work couldn't be read.
 *
 * For one course, the work is the course's own, already read. Its roster can
 * reach past the instructor's groups (a section it takes whole, a student added
 * by hand), so those students chart under their section rather than going
 * missing beside figures that count them.
 */
async function readGroupTrend(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { role: string; uid: string },
  args: SummaryArgs,
  kinds: readonly WorkKind[],
  course: { scope: CourseScope; graded: GradedWork[] } | null,
) {
  try {
    const sectionIds = await manageableSectionIds(supabase, session.role, session.uid);
    const { teams, error } = await loadTeams(supabase, sectionIds);
    if (error) {
      if (isMissingTeamTables(error)) return { groups: [], points: [] };
      throw error;
    }
    const own = session.role === 'faculty' ? teams.filter((t) => t.faculty_id === session.uid) : teams;

    // Two sections may each have a "Group 1"; those carry their section's name.
    const { data: sectionRows } = await supabase
      .from('sections')
      .select('id, name')
      .in('id', [...new Set(own.map((t) => t.section_id))]);
    const sectionName = new Map((sectionRows ?? []).map((r) => [r.id as string, r.name as string]));
    const nameCount = new Map<string, number>();
    for (const t of own) nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);
    const groups = own.map((t) => ({
      id: t.id,
      name: (nameCount.get(t.name) ?? 0) > 1 ? `${t.name} · ${sectionName.get(t.section_id) ?? 'Section'}` : t.name,
      section_id: t.section_id,
    }));

    const inScope = own.filter((t) => !args.p_section_ids || args.p_section_ids.includes(t.section_id));
    const allowed = args.p_student_ids ? new Set(args.p_student_ids) : null;
    const groupOf = new Map<string, string>();
    for (const t of inScope) {
      for (const m of t.members) if (!allowed || allowed.has(m.id)) groupOf.set(m.id, t.id);
    }
    for (const s of course?.scope.students ?? []) {
      if (groupOf.has(s.id)) continue;
      const id = `section:${s.section_id}`;
      groupOf.set(s.id, id);
      if (!groups.some((g) => g.id === id)) {
        groups.push({ id, name: course?.scope.sectionNames.get(s.section_id) ?? 'Other students', section_id: s.section_id });
      }
    }
    const students = [...groupOf.keys()];
    if (students.length === 0) return { groups, points: [] };

    const from = args.p_from ?? new Date(Date.now() - 56 * DAY_MS).toISOString().slice(0, 10);
    const work = course ? course.graded : await loadGradedWork(supabase, students, { from, to: args.p_to, kinds });

    const acc = new Map<string, { group_id: string; week_start: string; sum: number; attempts: number }>();
    for (const row of work) {
      const group_id = groupOf.get(row.student_id)!;
      const week_start = bucketStart(row.date, args.p_bucket);
      const key = `${group_id}|${week_start}`;
      const cell = acc.get(key) ?? { group_id, week_start, sum: 0, attempts: 0 };
      cell.sum += row.score;
      cell.attempts += 1;
      acc.set(key, cell);
    }
    const points = [...acc.values()].map(({ group_id, week_start, sum, attempts }) => ({
      group_id,
      week_start,
      average_score: Math.round((sum / attempts) * 10) / 10,
      attempts,
    }));
    return { groups, points };
  } catch (err) {
    console.error('Failed to build group trend', err);
    return null;
  }
}

/**
 * A stale warehouse is refreshed after the response, at most once per
 * STALE_MS per server instance: pg_cron normally gets there first, and this
 * covers a database without it. refreshWarehouse keeps it to one refresh at
 * a time (across instances since 096).
 */
let lastBackgroundRefresh = 0;

function refreshInBackground(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (Date.now() - lastBackgroundRefresh < STALE_MS) return;
  lastBackgroundRefresh = Date.now();
  after(async () => {
    const { error } = await refreshWarehouse(supabase);
    if (error) console.error('Warehouse background refresh failed', error);
  });
}

/** Never loaded: no figures at all, so this one is worth waiting for. */
function neverLoaded(summary: Summary): boolean {
  return !summary?.etl?.last_run_at;
}

function isStale(summary: Summary): boolean {
  const lastRun = summary?.etl?.last_run_at;
  if (!lastRun) return true;
  const age = Date.now() - new Date(lastRun).getTime();
  return Number.isNaN(age) || age > STALE_MS;
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const resolved = await resolveSummaryArgs(request.nextUrl.searchParams, session, supabase);
    if ('error' in resolved) {
      return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
    }
    const course = await loadCourseScope(supabase, session, request.nextUrl.searchParams);
    if (course === 'not_found') return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    // Without a course, the group and criteria filters apply across all of them.
    const params = request.nextUrl.searchParams;
    const groupIds = (params.get('group_ids') ?? '').split(',').map((g) => g.trim()).filter(Boolean);
    const kinds = course ? [] : askedKinds(params);
    const args = course
      ? courseArgs(resolved, course)
      : groupIds.length > 0
        ? await narrowToGroups(supabase, session, resolved, groupIds)
        : resolved;

    const { data, error } = await callAnalytics(supabase, 'dw_analytics_summary', { ...args });

    if (error) {
      console.error('Failed to fetch analytics summary', error);
      return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
    }
    let summary = data as Summary;

    // A warehouse that has never been loaded is refreshed before answering;
    // a stale one is served as it is and refreshed after the response. A
    // failed refresh is non-fatal: the warehouse's current figures still go out.
    if (neverLoaded(summary)) {
      const { error: etlError } = await refreshWarehouse(supabase);
      if (etlError) {
        console.error('Warehouse first load failed', etlError);
      } else {
        const refreshed = await callAnalytics(supabase, 'dw_analytics_summary', { ...args }, { fresh: true });
        if (!refreshed.error && refreshed.data) summary = refreshed.data as Summary;
      }
    } else if (isStale(summary)) {
      refreshInBackground(supabase);
    }

    // Laid over the warehouse's figures; its ranked students bring their own avatars.
    const own = course && summary ? await courseFigures(supabase, course, args) : null;
    if (own) summary = { ...summary, ...own.figures };
    // Only some kinds of work, across all courses: laid over the warehouse's figures the same way.
    const byKind = !course && summary && kinds.length > 0 ? await kindFigures(supabase, args, kinds) : null;
    if (byKind) summary = { ...summary, ...byKind };

    // Avatars and the per-group split don't depend on each other, so they
    // are read side by side. The split is opt-in: only the performance chart
    // needs it, not the previous-period comparison or the admin dashboard.
    const wantsTrend = !!summary && request.nextUrl.searchParams.get('group_trend') === '1';
    const [topStudents, groupTrend] = await Promise.all([
      !own && !byKind && summary?.top_students?.length ? withStudentAvatars(supabase, summary.top_students) : null,
      wantsTrend
        ? readGroupTrend(
            supabase,
            session,
            args,
            summary?.cohort?.graded === undefined ? ['quiz'] : kinds.length > 0 ? kinds : WORK_KINDS.map((k) => k.kind),
            course && own ? { scope: course, graded: own.graded } : null,
          )
        : null,
    ]);
    if (summary && topStudents) summary = { ...summary, top_students: topStudents };
    const deanId = summary ? await viewerDeanId(supabase, session) : null;
    if (summary && deanId) summary = { ...summary, room_utilization: await ownRoomUtilization(supabase, deanId) };

    if (summary && wantsTrend) {
      return NextResponse.json({
        summary: { ...summary, group_trend: groupTrend },
        bucket: args.p_bucket,
      });
    }

    return NextResponse.json({ summary, bucket: args.p_bucket });
  } catch (err) {
    console.error('Fetch analytics summary failed', err);
    return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
  }
}
