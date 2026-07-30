import { NextRequest } from 'next/server';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadNotifications, toNotificationRow } from '@/app/lib/notifications';

/**
 * Server-sent events feed for the caller's notifications.
 *
 * Clients can't subscribe to Supabase Realtime directly: sessions here are
 * app-signed JWTs (not Supabase Auth), so the RLS policies behind realtime
 * would never match. Instead the server holds the subscription with the
 * service-role key and relays only the caller's rows down this stream.
 *
 * Events: `snapshot` (full state, on connect), `insert`, `update`, `delete`.
 */

// A connection is request-scoped and long-lived, so it must never be cached
// or prerendered.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HEARTBEAT_MS = 20_000;
/**
 * Safety-net poll. A subscription to a table that isn't in the
 * `supabase_realtime` publication still reports SUBSCRIBED and then delivers
 * nothing, so an error-only fallback would sit there looking healthy while the
 * feed went stale. Polling therefore runs from the start and only stops once a
 * realtime event has proved the subscription actually delivers.
 */
const FALLBACK_POLL_MS = 15_000;
/**
 * Serverless hosts cap function duration, so the stream closes itself first
 * and lets the client reconnect (which replays a fresh snapshot) instead of
 * being killed mid-response.
 */
const STREAM_TTL_MS =
  Number(process.env.NOTIFICATIONS_STREAM_TTL_MS) || (process.env.VERCEL ? 50_000 : 9 * 60_000);
/** Client reconnect delay hint (EventSource honours this automatically). */
const RETRY_MS = 3_000;

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.uid;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let channel: RealtimeChannel | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let poll: ReturnType<typeof setInterval> | null = null;
      let ttl: ReturnType<typeof setTimeout> | null = null;
      let lastSignature = '';
      let realtimeProven = false;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Client vanished between the abort signal and this write.
          shutdown();
        }
      };

      const send = (event: string, data?: unknown) => {
        write(`event: ${event}\n${data === undefined ? '' : `data: ${JSON.stringify(data)}\n`}\n`);
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (poll) clearInterval(poll);
        if (ttl) clearTimeout(ttl);
        if (channel) void getSupabaseAdmin().removeChannel(channel);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      const snapshotSignature = (state: Awaited<ReturnType<typeof loadNotifications>>) =>
        `${state.unread}:${state.notifications.length}:${state.notifications[0]?.id ?? ''}`;

      const sendSnapshot = async () => {
        try {
          const state = await loadNotifications(userId);
          lastSignature = snapshotSignature(state);
          send('snapshot', state);
        } catch (err) {
          console.error('Notification stream snapshot failed', err);
          send('error', { message: 'Unable to load notifications' });
        }
      };

      const startPolling = () => {
        if (poll || closed) return;
        poll = setInterval(async () => {
          try {
            const state = await loadNotifications(userId);
            const signature = snapshotSignature(state);
            if (signature === lastSignature) return;
            lastSignature = signature;
            send('snapshot', state);
          } catch {
            // Transient; the next tick retries.
          }
        }, FALLBACK_POLL_MS);
      };

      const stopPolling = () => {
        if (!poll) return;
        clearInterval(poll);
        poll = null;
      };

      const subscribe = () => {
        channel = getSupabaseAdmin()
          // Two tabs of the same account share one socket, so the topic has to
          // be unique per connection or the second subscribe is rejected.
          .channel(`notifications:${userId}:${crypto.randomUUID()}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notifications',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              if (!realtimeProven) {
                // Delivery confirmed: the poll is no longer earning its keep.
                realtimeProven = true;
                stopPolling();
              }
              if (payload.eventType === 'DELETE') {
                const id = (payload.old as { id?: string })?.id;
                if (id) send('delete', { id });
                return;
              }
              const record = payload.new as Record<string, unknown>;
              if (!record?.id) return;
              send(payload.eventType === 'INSERT' ? 'insert' : 'update', {
                notification: toNotificationRow(record),
              });
            },
          )
          .subscribe((status) => {
            if (closed) return;
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              // Whatever it delivered before, it isn't delivering now.
              realtimeProven = false;
              startPolling();
            }
          });
      };

      write(`retry: ${RETRY_MS}\n\n`);
      void sendSnapshot();
      subscribe();
      startPolling();

      heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
      ttl = setTimeout(shutdown, STREAM_TTL_MS);

      request.signal.addEventListener('abort', shutdown);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      // Tells nginx-style proxies not to buffer the response.
      'X-Accel-Buffering': 'no',
    },
  });
}
