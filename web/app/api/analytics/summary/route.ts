import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { resolveSummaryArgs, type SummaryArgs } from '@/app/lib/analytics';

/**
 * Dashboard analytics read from the star-schema warehouse
 * (public.dw_analytics_summary → dw facts/dims). The warehouse is kept fresh
 * self-healingly: if it has never been loaded or is older than STALE_MS, this
 * route runs the ETL (run_dw_etl) and re-reads, so faculty never see a stale or
 * empty dashboard even without pg_cron. POST /api/admin/etl still forces a run.
 *
 * Query params (all optional): section_ids (csv), from, to — see
 * resolveSummaryArgs, which also confines faculty to their own sections.
 * section_trend=1 also attaches `section_trend` (see readSectionTrend).
 */
const STALE_MS = 5 * 60 * 1000; // refresh the warehouse at most every 5 minutes

type Summary = {
  etl?: { last_run_at?: string | null };
  sections?: { id: string; name: string }[];
  weekly_trend?: { week_start: string; average_score: number; attempts: number }[];
} | null;

/**
 * The summary's trend split by section, for the one-line-per-section
 * performance chart — read after any ETL refresh so it matches the summary it
 * rides on. dw_section_trend (migration 039) does it in one query. Where 039
 * isn't applied yet, the same split comes from the summary function itself,
 * read once per section in scope: its weekly_trend for a single section is
 * exactly that section's line. Null only if both fail.
 */
async function readSectionTrend(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  args: SummaryArgs,
  sections: { id: string; name: string }[],
): Promise<unknown[] | null> {
  const { data, error } = await supabase.rpc('dw_section_trend', args);
  if (!error) return (data as unknown[] | null) ?? [];
  console.warn('dw_section_trend unavailable, reading per section instead:', error.message);

  try {
    const perSection = await Promise.all(
      sections.map(async (section) => {
        const one = await supabase.rpc('dw_analytics_summary', {
          ...args,
          p_section_ids: [section.id],
        });
        if (one.error) throw one.error;
        return ((one.data as Summary)?.weekly_trend ?? []).map((point) => ({
          section_id: section.id,
          section_name: section.name,
          ...point,
        }));
      }),
    );
    return perSection.flat();
  } catch (err) {
    console.error('Failed to build section trend', err);
    return null;
  }
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

    const { data, error } = await supabase.rpc('dw_analytics_summary', args);

    if (error) {
      console.error('Failed to fetch analytics summary', error);
      return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
    }
    let summary = data as Summary;

    // Empty or stale warehouse → refresh it and re-read. A failed ETL is
    // non-fatal: we still return whatever the warehouse currently holds.
    if (isStale(summary)) {
      const { error: etlError } = await supabase.rpc('run_dw_etl');
      if (etlError) {
        console.error('Warehouse auto-ETL failed', etlError);
      } else {
        const refreshed = await supabase.rpc('dw_analytics_summary', args);
        if (!refreshed.error && refreshed.data) summary = refreshed.data as Summary;
      }
    }

    // Opt-in: only the performance chart needs the split, not the
    // previous-period comparison or the admin dashboard.
    if (summary && request.nextUrl.searchParams.get('section_trend') === '1') {
      const sectionTrend = await readSectionTrend(supabase, args, summary.sections ?? []);
      return NextResponse.json({
        summary: { ...summary, section_trend: sectionTrend },
        bucket: args.p_bucket,
      });
    }

    return NextResponse.json({ summary, bucket: args.p_bucket });
  } catch (err) {
    console.error('Fetch analytics summary failed', err);
    return NextResponse.json({ error: 'Unable to fetch analytics' }, { status: 500 });
  }
}
