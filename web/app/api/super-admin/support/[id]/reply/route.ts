import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { sendSupportReply, type EmailAttachment } from '@/app/lib/auth/email';
import { logAudit } from '@/app/lib/audit';
import { CONTACT_EMAIL } from '@/app/lib/dev-team';
import { SUPPORT_REPLY_LIMIT } from '@/app/lib/support';
import {
  downloadAttachments,
  loadSupportCopies,
  parseAttachments,
  saveSupportCopies,
  signAttachments,
  type SupportReply,
} from '@/app/lib/support-requests';

/**
 * POST { message, attachments?, resolve? }: answers a Help & Support request.
 * The reply is emailed to the account that asked, with the Admin's images
 * attached and replies going to the contact inbox, then kept on the request
 * for every Admin to see. `resolve` closes the request in the same step.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 });
  if (message.length > SUPPORT_REPLY_LIMIT) return NextResponse.json({ error: 'That reply is too long.' }, { status: 400 });
  const attachments = parseAttachments(body.attachments, session.uid);
  if (!attachments) return NextResponse.json({ error: 'Those images could not be attached.' }, { status: 400 });
  const resolve = body.resolve === true;

  try {
    const supabase = getSupabaseAdmin();
    const copies = await loadSupportCopies(id);
    if (!copies.length) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const current = copies[0].data;

    let files: EmailAttachment[];
    try {
      files = await downloadAttachments(attachments);
    } catch (err) {
      console.error('Support reply: an image could not be read back', err);
      return NextResponse.json(
        { error: "One of your images didn't finish uploading. Remove it, attach it again, and resend." },
        { status: 400 },
      );
    }

    // The account's address now, in case it changed since they wrote in.
    const [{ data: me }, { data: requester }] = await Promise.all([
      supabase.from('users').select('name').eq('id', session.uid).maybeSingle(),
      current.user_id
        ? supabase.from('users').select('name, email').eq('id', current.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const adminName = (me?.name as string | undefined) ?? session.email;
    const to = (requester?.email as string | undefined) ?? current.email;

    try {
      await sendSupportReply(to, CONTACT_EMAIL, {
        name: (requester?.name as string | undefined) ?? current.name,
        subject: current.subject,
        message,
        adminName,
        originalMessage: current.message,
        attachments: files,
      });
    } catch (err) {
      console.error('Support reply email failed', err);
      return NextResponse.json(
        { error: `The reply could not be emailed to ${to}. Nothing was saved; please try again.` },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();
    const reply: SupportReply = { id: randomUUID(), by: session.uid, by_name: adminName, message, attachments, sent_at: now };
    // Re-read so a reply another Admin sent meanwhile isn't overwritten.
    const latest = (await loadSupportCopies(id))[0]?.data ?? current;
    const next = {
      ...latest,
      replies: [...latest.replies, reply],
      status: resolve ? ('resolved' as const) : ('answered' as const),
      resolved_by_name: resolve ? adminName : null,
      resolved_at: resolve ? now : null,
    };
    try {
      await saveSupportCopies(copies, next);
    } catch (err) {
      // The email went; say so rather than invite a second copy of it.
      console.error('Support reply sent but not saved on the request', err);
      return NextResponse.json(
        { error: `The reply was emailed to ${to}, but it couldn't be saved on the request.`, sent: true },
        { status: 500 },
      );
    }

    await logAudit(
      session,
      {
        action: 'support_request.replied',
        entityType: 'notifications',
        entityId: id,
        details: {
          message: `Replied to a support request from ${current.name}${resolve ? ' and resolved it' : ''}`,
          email: to,
          subject: current.subject,
          images: attachments.length,
        },
      },
      request,
    );

    const urls = await signAttachments(attachments.map((a) => a.path));
    return NextResponse.json({
      reply: { ...reply, attachments: attachments.map((a) => ({ ...a, url: urls[a.path] ?? null })) },
      status: next.status,
      resolved_by_name: next.resolved_by_name,
      resolved_at: next.resolved_at,
      sent_to: to,
    });
  } catch (err) {
    console.error('POST /api/super-admin/support/[id]/reply failed', err);
    return NextResponse.json({ error: 'Unable to send the reply' }, { status: 500 });
  }
}
