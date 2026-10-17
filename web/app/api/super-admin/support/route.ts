import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { toSupportData } from '@/app/lib/support-requests';

/** Enough rows for a long history even with a copy per Admin. */
const MAX_ROWS = 2000;

/**
 * GET: every Help & Support request, newest first, one entry per request
 * however many Admins hold a copy. Unread is the caller's own copy's state.
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;

  const { data, error } = await getSupabaseAdmin()
    .from('notifications')
    .select('user_id, data, read_at, created_at')
    .eq('data->>kind', 'support_request')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) {
    console.error('GET /api/super-admin/support failed', error);
    return NextResponse.json({ error: 'Unable to load support requests' }, { status: 500 });
  }

  const byId = new Map<string, { row: (typeof data)[number]; mine: boolean }>();
  for (const row of data ?? []) {
    const id = (row.data as { request_id?: unknown })?.request_id;
    if (typeof id !== 'string') continue;
    const mine = row.user_id === session.uid;
    const seen = byId.get(id);
    if (!seen || (mine && !seen.mine)) byId.set(id, { row, mine });
  }

  const requests = [...byId.values()].map(({ row, mine }) => {
    const d = toSupportData(row.data as Record<string, unknown>);
    const lastReply = d.replies[d.replies.length - 1];
    return {
      id: d.request_id,
      status: d.status,
      name: d.name,
      email: d.email,
      role: d.role,
      topic: d.topic,
      subject: d.subject,
      preview: d.message.slice(0, 180),
      image_count: d.attachments.length,
      reply_count: d.replies.length,
      unread: mine && !row.read_at,
      created_at: row.created_at,
      last_activity_at: lastReply?.sent_at ?? row.created_at,
    };
  });
  requests.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ requests });
}
