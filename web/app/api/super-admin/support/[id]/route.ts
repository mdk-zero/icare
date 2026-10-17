import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { logAudit } from '@/app/lib/audit';
import { loadSupportCopies, saveSupportCopies, signAttachments } from '@/app/lib/support-requests';

type Params = { params: Promise<{ id: string }> };

/** GET: one request with its replies, images signed for an hour. Marks the caller's copy read. */
export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  try {
    const copies = await loadSupportCopies(id);
    if (!copies.length) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const mine = copies.find((c) => c.user_id === session.uid);
    const d = (mine ?? copies[0]).data;

    const paths = [...d.attachments, ...d.replies.flatMap((r) => r.attachments)].map((a) => a.path);
    const urls = await signAttachments(paths);
    const withUrls = <T extends { path: string }>(list: T[]) => list.map((a) => ({ ...a, url: urls[a.path] ?? null }));

    const markedRead = !!mine && !mine.read_at;
    if (markedRead) {
      await getSupabaseAdmin().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', mine.id);
    }

    return NextResponse.json({
      request: {
        id: d.request_id,
        status: d.status,
        user_id: d.user_id,
        name: d.name,
        email: d.email,
        role: d.role,
        section: d.section,
        topic: d.topic,
        subject: d.subject,
        message: d.message,
        client: d.client,
        created_at: copies[0].created_at,
        attachments: withUrls(d.attachments),
        replies: d.replies.map((r) => ({ ...r, attachments: withUrls(r.attachments) })),
        resolved_by_name: d.resolved_by_name ?? null,
        resolved_at: d.resolved_at ?? null,
      },
      // Tells the page to refresh the bell, whose count just went down.
      marked_read: markedRead,
    });
  } catch (err) {
    console.error('GET /api/super-admin/support/[id] failed', err);
    return NextResponse.json({ error: 'Unable to load the request' }, { status: 500 });
  }
}

/**
 * PATCH { status: 'resolved' | 'open' }: closes a request, or reopens one.
 * Reopening an answered request leaves it answered, since the reply was sent.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const wanted = (body as { status?: unknown }).status;
  if (wanted !== 'resolved' && wanted !== 'open') {
    return NextResponse.json({ error: 'status must be resolved or open' }, { status: 400 });
  }

  try {
    const copies = await loadSupportCopies(id);
    if (!copies.length) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const current = copies[0].data;

    let next = current;
    if (wanted === 'resolved') {
      if (current.status === 'resolved') return NextResponse.json({ status: current.status });
      const { data: me } = await getSupabaseAdmin().from('users').select('name').eq('id', session.uid).maybeSingle();
      next = {
        ...current,
        status: 'resolved',
        resolved_by_name: (me?.name as string | undefined) ?? session.email,
        resolved_at: new Date().toISOString(),
      };
    } else {
      if (current.status !== 'resolved') return NextResponse.json({ status: current.status });
      next = {
        ...current,
        status: current.replies.length ? 'answered' : 'open',
        resolved_by_name: null,
        resolved_at: null,
      };
    }
    await saveSupportCopies(copies, next);

    await logAudit(
      session,
      {
        action: wanted === 'resolved' ? 'support_request.resolved' : 'support_request.reopened',
        entityType: 'notifications',
        entityId: id,
        details: {
          message: `${wanted === 'resolved' ? 'Resolved' : 'Reopened'} a support request from ${current.name}`,
          email: current.email,
          subject: current.subject,
        },
      },
      request,
    );
    return NextResponse.json({ status: next.status, resolved_by_name: next.resolved_by_name ?? null, resolved_at: next.resolved_at ?? null });
  } catch (err) {
    console.error('PATCH /api/super-admin/support/[id] failed', err);
    return NextResponse.json({ error: 'Unable to update the request' }, { status: 500 });
  }
}
