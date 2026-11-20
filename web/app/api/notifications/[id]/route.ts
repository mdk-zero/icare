import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { NOTIFICATION_COLUMNS, type NotificationRow } from '@/app/lib/notifications';
import { isUuid } from '@/app/lib/reports/targets';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET → { notification }: one of the caller's own notifications, for its own
 * page when the feed doesn't hold it (a link opened cold, or one older than
 * the newest 100). Anyone else's, or no such id, is a 404.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('id', id)
      .eq('user_id', session.uid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    return NextResponse.json({ notification: data as NotificationRow });
  } catch (err) {
    console.error('Fetch notification failed', err);
    return NextResponse.json({ error: 'Unable to fetch the notification' }, { status: 500 });
  }
}
