import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

/**
 * Manually trigger the warehouse ETL (dw.run_etl via the public RPC
 * wrapper). The nightly pg_cron job does this automatically when the
 * extension is enabled; this endpoint covers on-demand refreshes.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: rowsLoaded, error } = await supabase.rpc('run_dw_etl');

    if (error) {
      console.error('Warehouse ETL failed', error);
      return NextResponse.json({ error: 'ETL run failed' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'warehouse.etl_run', entityType: 'dw', details: { rows_loaded: rowsLoaded } },
      request,
    );

    return NextResponse.json({ rows_loaded: rowsLoaded });
  } catch (err) {
    console.error('Warehouse ETL failed', err);
    return NextResponse.json({ error: 'ETL run failed' }, { status: 500 });
  }
}
