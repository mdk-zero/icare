import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { sendAccessRequestDeclined } from '@/app/lib/auth/email';
import { logAudit } from '@/app/lib/audit';

const DEV_TEAM_EMAIL = (process.env.DEV_TEAM_EMAILS || 'contact@i-care.dev').split(',')[0].trim();

/**
 * Accept or decline a sign-up page account request. The request lives only in
 * the super admins' notifications (one copy each, sharing `request_id`), so
 * settling it rewrites every copy: the others see who handled it and lose the
 * buttons. Accepting is sent after the account was created from the Users page.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const status = (body as { status?: unknown }).status;
  if (status !== 'accepted' && status !== 'declined') {
    return NextResponse.json({ error: 'status must be accepted or declined' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from('notifications')
      .select('id, data, read_at')
      .eq('data->>kind', 'access_request')
      .eq('data->>request_id', id);
    if (error) throw error;
    if (!rows?.length) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

    const current = (rows[0].data as Record<string, unknown>).status;
    if (current === 'accepted' || current === 'declined') {
      return NextResponse.json({ error: `This request was already ${current}.` }, { status: 409 });
    }

    const { data: me } = await supabase.from('users').select('name').eq('id', session.uid).maybeSingle();
    const now = new Date().toISOString();
    const results = await Promise.all(
      rows.map((row) =>
        supabase
          .from('notifications')
          .update({
            data: {
              ...(row.data as Record<string, unknown>),
              status,
              resolved_by: session.uid,
              resolved_by_name: me?.name ?? session.email,
              resolved_at: now,
            },
            read_at: row.read_at ?? now,
          })
          .eq('id', row.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;

    const requester = rows[0].data as { email?: unknown };
    await logAudit(
      session,
      {
        action: `access_request.${status}`,
        entityType: 'notifications',
        entityId: id,
        details: { email: typeof requester.email === 'string' ? requester.email : null },
      },
      request,
    );

    if (status === 'declined' && typeof requester.email === 'string') {
      try {
        await sendAccessRequestDeclined(requester.email, DEV_TEAM_EMAIL);
      } catch (err) {
        // The decision stands even if the courtesy email bounces.
        console.error('Access request decline email failed', err);
      }
    }

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('Resolve access request failed', err);
    return NextResponse.json({ error: 'Unable to update the request' }, { status: 500 });
  }
}
