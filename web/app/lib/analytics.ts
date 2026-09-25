import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionPayload } from './auth/session';
import { getFacultySectionIds, getFacultyStudentIds } from './roster';

/**
 * Shared filter handling for the warehouse-backed analytics endpoints
 * (/api/analytics/summary and /api/analytics/narrative), so the numbers on the
 * dashboard and the numbers the AI narrates always come from the same query.
 */

export type AnalyticsBucket = 'day' | 'week' | 'month' | 'year';

/** Argument object for public.dw_analytics_summary(). */
export interface SummaryArgs {
  p_section_ids: string[] | null;
  p_from: string | null;
  p_to: string | null;
  p_bucket: AnalyticsBucket;
  /**
   * Only these students count (migration 052); left out when there is no
   * limit, so an unscoped call still works before 052 is applied.
   */
  p_student_ids?: string[];
}

/**
 * Calls a warehouse function, dropping p_student_ids and retrying when the
 * live database predates migration 052 (PostgREST can't find a function with
 * that parameter). The retry is still section-scoped, but counts every
 * student in those sections, so it is logged.
 */
export async function callAnalytics(
  supabase: SupabaseClient,
  fn: 'dw_analytics_summary' | 'dw_student_leaderboard' | 'dw_section_trend',
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
  const first = await supabase.rpc(fn, args);
  if (!first.error || args.p_student_ids === undefined || first.error.code !== 'PGRST202') return first;
  console.warn(`${fn}: migration 052 not applied, falling back to a section-only scope`);
  const { p_student_ids: _dropped, ...rest } = args;
  void _dropped;
  return supabase.rpc(fn, rest);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(raw: string | null): string | null {
  if (!raw || !DATE_RE.test(raw)) return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

/**
 * Keeps the trend readable at any span: roughly a month of days, half a year
 * of weeks, a few years of months, then years.
 */
export function deriveBucket(from: string | null, to: string | null): AnalyticsBucket {
  if (!from || !to) return 'week';
  const days = Math.abs(Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (days <= 31) return 'day';
  if (days <= 182) return 'week';
  if (days <= 365 * 3) return 'month';
  return 'year';
}

/**
 * Turns `?section_ids=&from=&to=` into RPC arguments.
 *
 * Faculty are confined to the sections they manage, so a hand-crafted
 * section_ids can't be used to read another faculty member's cohort. Admins
 * see whatever they ask for; null means the whole cohort.
 */
export async function resolveSummaryArgs(
  params: URLSearchParams,
  session: SessionPayload,
  supabase: SupabaseClient,
): Promise<SummaryArgs | { error: string }> {
  const requested = (params.get('section_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const from = parseDate(params.get('from'));
  const to = parseDate(params.get('to'));

  let sectionIds: string[] | null = requested.length > 0 ? requested : null;
  let studentIds: string[] | null = null;
  if (session.role === 'faculty') {
    // The sections of the groups they supervise, and only those groups'
    // members within them.
    try {
      const [managed, members] = await Promise.all([
        getFacultySectionIds(supabase as never, session.uid),
        getFacultyStudentIds(supabase as never, session.uid),
      ]);
      sectionIds = requested.length > 0 ? managed.filter((id) => requested.includes(id)) : managed;
      studentIds = members;
    } catch (err) {
      console.error('Failed to read faculty groups', err);
      return { error: 'Unable to read your groups' };
    }
  }

  return {
    p_section_ids: sectionIds,
    p_from: from,
    p_to: to,
    p_bucket: deriveBucket(from, to),
    ...(studentIds ? { p_student_ids: studentIds } : {}),
  };
}

/** Ids per `in` filter — each is a URL-encoded query param, so keep it short. */
const AVATAR_LOOKUP_CHUNK = 150;

/**
 * The warehouse carries no picture or sex, so ranked student rows are joined
 * back to users for their avatars (student_key is users.id). A failed lookup
 * leaves the rows as they were and the avatars fall back to initials.
 */
export async function withStudentAvatars<T extends { student_key: string }>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<(T & { picture_url?: string | null; sex?: 'male' | 'female' | null })[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.student_key);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += AVATAR_LOOKUP_CHUNK) {
    chunks.push(ids.slice(i, i + AVATAR_LOOKUP_CHUNK));
  }
  const results = await Promise.all(
    chunks.map((chunk) => supabase.from('users').select('id, picture_url, sex').in('id', chunk)),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    console.error('Failed to look up student avatars', failed.error);
    return rows;
  }
  const byId = new Map(results.flatMap((r) => r.data ?? []).map((u) => [u.id as string, u]));
  return rows.map((r) => {
    const user = byId.get(r.student_key);
    return user ? { ...r, picture_url: user.picture_url ?? null, sex: user.sex ?? null } : r;
  });
}
