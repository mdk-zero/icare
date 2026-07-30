import { getSupabaseAdmin } from './supabase/server';

/** A row of `public.notifications` as served to clients. */
export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export const NOTIFICATION_COLUMNS = 'id, type, title, body, data, read_at, created_at';

/** Newest 100 notifications for one user, plus the unread count. */
export async function loadNotifications(
  userId: string,
): Promise<{ notifications: NotificationRow[]; unread: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  const notifications = (data ?? []) as NotificationRow[];
  return { notifications, unread: notifications.filter((n) => !n.read_at).length };
}

/**
 * Narrow a realtime payload down to the client-facing shape. Realtime sends
 * every published column, including `user_id`, which clients never need.
 */
export function toNotificationRow(record: Record<string, unknown>): NotificationRow {
  return {
    id: String(record.id),
    type: typeof record.type === 'string' ? record.type : 'system',
    title: typeof record.title === 'string' ? record.title : '',
    body: typeof record.body === 'string' ? record.body : '',
    data: (record.data ?? {}) as Record<string, unknown>,
    read_at: typeof record.read_at === 'string' ? record.read_at : null,
    created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
  };
}
