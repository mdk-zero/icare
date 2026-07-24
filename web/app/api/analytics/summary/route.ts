import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * Dashboard analytics read from the star-schema warehouse
 * (public.dw_analytics_summary → dw facts/dims). The warehouse is kept fresh
 * self-healingly: if it has never been loaded or is older than STALE_MS, this
 * route runs the ETL (run_dw_etl) and re-reads, so faculty never see a stale or
 * empty dashboard even without pg_cron. POST /api/admin/etl still forces a run.
 *
 * Query params (all optional):
 *   section_ids  csv of section uuids — intersected with the sections the
 *                caller actually manages, so this can't be used to read
 *                another faculty member's cohort
 *   from, to     YYYY-MM-DD range bounds; the trend bucket is derived from
 *                the span so a year-long range doesn't render 365 points
 */
const STALE_MS = 5 * 60 * 1000; // refresh the warehouse at most every 5 minutes

type Summary = { etl?: { last_run_at?: string | null } } | null;

type Bucket = 'day' | 'week' | 'month' | 'year';

interface SummaryArgs {
  p_section_ids: string[] | null;
  p_from: string | null;
  p_to: string | null;
  p_bucket: Bucket;
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
function deriveBucket(from: string | null, to: string | null): Bucket {
  if (!from || !to) return 'week';
  const days = Math.abs(Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (days <= 31) return 'day';
  if (days <= 182) return 'week';
  if (days <= 365 * 3) return 'month';
  return 'year';
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

  const params = request.nextUrl.searchParams;
  const requested = (params.get('section_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const from = parseDate(params.get('from'));
  const to = parseDate(params.get('to'));

  try {
    const supabase = getSupabaseAdmin();

    // Faculty are confined to the sections they manage; admins see whatever
    // they ask for (null = whole cohort).
    let sectionIds: string[] | null = requested.length > 0 ? requested : null;
    if (session.role === 'faculty') {
      const { data: links, error: linkError } = await supabase
        .from('faculty_sections')
        .select('section_id')
        .eq('faculty_id', session.uid);
      if (linkError) {
        console.error('Failed to read faculty sections', linkError);
        return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
      }
      const managed = (links ?? []).map((l) => l.section_id as string);
      sectionIds =
        requested.length > 0 ? managed.filter((id) => requested.includes(id)) : managed;
    }

    const args: SummaryArgs = {
      p_section_ids: sectionIds,
      p_from: from,
      p_to: to,
      p_bucket: deriveBucket(from, to),
    };

    const { data: summary, error } = await supabase.rpc('dw_analytics_summary', args);

    if (error) {
      console.error('Failed to fetch analytics summary', error);
      return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
    }

    // Empty or stale warehouse → refresh it and re-read. A failed ETL is
    // non-fatal: we still return whatever the warehouse currently holds.
    if (isStale(summary as Summary)) {
      const { error: etlError } = await supabase.rpc('run_dw_etl');
      if (etlError) {
        console.error('Warehouse auto-ETL failed', etlError);
      } else {
        const refreshed = await supabase.rpc('dw_analytics_summary', args);
        if (!refreshed.error && refreshed.data) {
          return NextResponse.json({ summary: refreshed.data, bucket: args.p_bucket });
        }
      }
    }

    return NextResponse.json({ summary, bucket: args.p_bucket });
  } catch (err) {
    console.error('Fetch analytics summary failed', err);
    return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
  }
}
