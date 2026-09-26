import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingMigration, requireSuperAdmin } from '@/app/lib/auth/super-admin';

const RANGES = {
  '1h': { ms: 3_600_000, bucket: 'minute' },
  '24h': { ms: 86_400_000, bucket: 'hour' },
  '7d': { ms: 7 * 86_400_000, bucket: 'hour' },
  '30d': { ms: 30 * 86_400_000, bucket: 'day' },
} as const;

/** Response time, throughput and reliability over a window (migration 054). */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  const key = request.nextUrl.searchParams.get('range') ?? '24h';
  const range = RANGES[key as keyof typeof RANGES] ?? RANGES['24h'];
  const since = new Date(Date.now() - range.ms).toISOString();

  const { data, error } = await getSupabaseAdmin().rpc('super_admin_metrics_summary', {
    p_since: since,
    p_bucket: range.bucket,
  });
  if (error) {
    if (isMissingMigration(error)) return NextResponse.json({ pending_migration: true });
    console.error('Failed to read metrics', error);
    return NextResponse.json({ error: 'Unable to read metrics' }, { status: 500 });
  }
  return NextResponse.json({ range: key, bucket: range.bucket, since, ...data });
}
