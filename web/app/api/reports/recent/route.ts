import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import type { RecentReport } from '@/app/lib/reports/types';

/** How many distinct reports the Reports page lists under "Recent". */
const LIMIT = 8;

/**
 * The caller's own most recent reports, read back from the audit trail every
 * report already writes (`report.generate`), so the list follows them across
 * devices without a table of its own.
 *
 * One entry per report: pulling the same student's PDF three times is one
 * row, at its latest time — the list is for getting back to a report, not
 * for counting how often it was made.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('entity_type, entity_id, details, created_at')
      .eq('actor_id', session.uid)
      .eq('action', 'report.generate')
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) {
      console.error('Failed to fetch recent reports', error);
      return NextResponse.json({ error: 'Unable to fetch recent reports' }, { status: 500 });
    }

    const seen = new Set<string>();
    const reports: RecentReport[] = [];
    for (const row of data ?? []) {
      const details = (row.details ?? {}) as Record<string, unknown>;
      const type = typeof details.report === 'string' ? details.report : row.entity_type;
      if (!type) continue;

      // Entries from before target_id was recorded carry the target in
      // entity_id — except whole-scope reports, which logged the actor there.
      const target =
        'target_id' in details
          ? typeof details.target_id === 'string'
            ? details.target_id
            : null
          : row.entity_id && row.entity_id !== session.uid
            ? row.entity_id
            : null;

      const key = `${type}:${target ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      reports.push({
        type,
        target_id: target,
        subject: typeof details.subject === 'string' ? details.subject : type,
        format: details.format === 'csv' ? 'csv' : 'pdf',
        created_at: row.created_at,
      });
      if (reports.length === LIMIT) break;
    }

    return NextResponse.json({ reports });
  } catch (err) {
    console.error('Fetch recent reports failed', err);
    return NextResponse.json({ error: 'Unable to fetch recent reports' }, { status: 500 });
  }
}
