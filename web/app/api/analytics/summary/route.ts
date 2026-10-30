import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAnalytics, resolveSummaryArgs, withStudentAvatars, type SummaryArgs } from '@/app/lib/analytics';
import { isMissingTeamTables, loadTeams, manageableSectionIds } from '@/app/lib/teams';
import { viewerDeanId } from '@/app/lib/dean-scope';
import { loadGradedWork } from '@/app/lib/graded-work';
import { WORK_KINDS, type WorkKind } from '@/app/lib/work-kinds';

/**
 * Dashboard analytics read from the star-schema warehouse
 * (public.dw_analytics_summary → dw facts/dims). The warehouse is kept fresh
 * self-healingly: if it has never been loaded or is older than STALE_MS, this
 * route runs the ETL (run_dw_etl) and re-reads, so faculty never see a stale or
 * empty dashboard even without pg_cron. POST /api/admin/etl still forces a run.
 *
 * Query params (all optional): section_ids (csv), from, to — see
 * resolveSummaryArgs, which also confines faculty to their own sections.
 * group_trend=1 also attaches `group_trend` (see readGroupTrend).
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

/** The start of `date`'s bucket, as the warehouse's date_trunc would put it (weeks start Monday). */
function bucketStart(date: string, bucket: SummaryArgs['p_bucket']): string {
  if (bucket === 'year') return `${date.slice(0, 4)}-01-01`;
  if (bucket === 'month') return `${date.slice(0, 7)}-01`;
  if (bucket === 'day') return date;
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * DAY_MS).toISOString().slice(0, 10);
}

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
 */
async function readGroupTrend(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: { role: string; uid: string },
  args: SummaryArgs,
  kinds: readonly WorkKind[],
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
    const students = [...groupOf.keys()];
    if (students.length === 0) return { groups, points: [] };

    const from = args.p_from ?? new Date(Date.now() - 56 * DAY_MS).toISOString().slice(0, 10);
    const work = await loadGradedWork(supabase, students, { from, to: args.p_to, kinds });

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
 * One warehouse refresh at a time per server instance. The page asks for the
 * current and the previous period at once, and both find the same stale
 * warehouse; without this each ran its own ETL, and the slower of the two
 * held up the page.
 */
let refreshing: ReturnType<typeof runRefresh> | null = null;

function runRefresh(supabase: ReturnType<typeof getSupabaseAdmin>) {
  return Promise.resolve(supabase.rpc('run_dw_etl')).then(({ error }) => ({ error }));
}

function refreshWarehouse(supabase: ReturnType<typeof getSupabaseAdmin>) {
  refreshing ??= runRefresh(supabase).finally(() => {
    refreshing = null;
  });
  return refreshing;
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

    const args = await resolveSummaryArgs(request.nextUrl.searchParams, session, supabase);
    if ('error' in args) {
      return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
    }

    const { data, error } = await callAnalytics(supabase, 'dw_analytics_summary', { ...args });

    if (error) {
      console.error('Failed to fetch analytics summary', error);
      return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
    }
    let summary = data as Summary;

    // Empty or stale warehouse → refresh it and re-read. A failed ETL is
    // non-fatal: we still return whatever the warehouse currently holds.
    if (isStale(summary)) {
      const { error: etlError } = await refreshWarehouse(supabase);
      if (etlError) {
        console.error('Warehouse auto-ETL failed', etlError);
      } else {
        const refreshed = await callAnalytics(supabase, 'dw_analytics_summary', { ...args });
        if (!refreshed.error && refreshed.data) summary = refreshed.data as Summary;
      }
    }

    // Avatars and the per-group split don't depend on each other, so they
    // are read side by side. The split is opt-in: only the performance chart
    // needs it, not the previous-period comparison or the admin dashboard.
    const wantsTrend = !!summary && request.nextUrl.searchParams.get('group_trend') === '1';
    const [topStudents, groupTrend] = await Promise.all([
      summary?.top_students?.length ? withStudentAvatars(supabase, summary.top_students) : null,
      wantsTrend
        ? readGroupTrend(
            supabase,
            session,
            args,
            summary?.cohort?.graded === undefined ? ['quiz'] : WORK_KINDS.map((k) => k.kind),
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
