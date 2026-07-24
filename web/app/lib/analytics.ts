import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionPayload } from './auth/session';

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
  if (session.role === 'faculty') {
    const { data: links, error } = await supabase
      .from('faculty_sections')
      .select('section_id')
      .eq('faculty_id', session.uid);
    if (error) {
      console.error('Failed to read faculty sections', error);
      return { error: 'Unable to read your sections' };
    }
    const managed = (links ?? []).map((l) => l.section_id as string);
    sectionIds = requested.length > 0 ? managed.filter((id) => requested.includes(id)) : managed;
  }

  return {
    p_section_ids: sectionIds,
    p_from: from,
    p_to: to,
    p_bucket: deriveBucket(from, to),
  };
}
