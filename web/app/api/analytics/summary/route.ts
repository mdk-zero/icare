import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { resolveSummaryArgs } from '@/app/lib/analytics';

/**
 * Dashboard analytics read from the star-schema warehouse
 * (public.dw_analytics_summary → dw facts/dims). The warehouse is kept fresh
 * self-healingly: if it has never been loaded or is older than STALE_MS, this
 * route runs the ETL (run_dw_etl) and re-reads, so faculty never see a stale or
 * empty dashboard even without pg_cron. POST /api/admin/etl still forces a run.
 *
 * Query params (all optional): section_ids (csv), from, to — see
 * resolveSummaryArgs, which also confines faculty to their own sections.
 */
const STALE_MS = 5 * 60 * 1000; // refresh the warehouse at most every 5 minutes

type Summary = { etl?: { last_run_at?: string | null } } | null;

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
