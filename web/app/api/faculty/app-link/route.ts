import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedStudentIds } from '@/app/lib/admin-scope';
import { consumeRateLimit } from '@/app/lib/auth/rate-limit';
import { sendAppLinkEmails } from '@/app/lib/auth/email';
import { appDownloadUrl } from '@/app/lib/mobile-app';
import { logAudit } from '@/app/lib/audit';

/** A whole section is a few dozen; this leaves room for a Dean's larger roster. */
const MAX_STUDENTS = 200;
const MAX_SENDS = 20;
const WINDOW_MS = 60 * 60 * 1000; // an hour

const NOT_SET_UP = "The app download link isn't set up yet. Ask the iCARE++ team to add it.";

async function staffSession() {
  const session = await readSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!['faculty', 'admin'].includes(session.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}

/** GET: the app download link Instructors and Deans hand out, or null while there is none. */
export async function GET(request: NextRequest) {
  const { error } = await staffSession();
  if (error) return error;
  return NextResponse.json({ url: appDownloadUrl(request.nextUrl.origin) });
}

/**
 * POST { student_ids }: emails each of those students the app download link.
 * Only students on the sender's own roster are mailed (an instructor's groups,
 * a dean's own students); any others in the list are left out silently.
 */
export async function POST(request: NextRequest) {
  const { session, error } = await staffSession();
  if (error) return error;

  let body: { student_ids?: unknown };
  try {
    body = (await request.json()) as { student_ids?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const ids = Array.isArray(body.student_ids)
    ? [...new Set(body.student_ids.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
    : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one student' }, { status: 400 });
  if (ids.length > MAX_STUDENTS) {
    return NextResponse.json({ error: `Send to at most ${MAX_STUDENTS} students at a time` }, { status: 400 });
  }

  const appUrl = appDownloadUrl(request.nextUrl.origin);
  if (!appUrl) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });

  if (!(await consumeRateLimit(`app-link:${session.uid}`, MAX_SENDS, WINDOW_MS))) {
    return NextResponse.json(
      { error: "You've sent the app link many times in the last hour. Please wait a little and try again." },
      { status: 429 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const scoped = await getScopedStudentIds(supabase, session);
    const allowed = scoped === null ? ids : ids.filter((id) => scoped.includes(id));
    if (allowed.length === 0) {
      return NextResponse.json({ error: 'None of those students are on your roster' }, { status: 404 });
    }

    const [{ data: students, error: studentsError }, { data: sender }] = await Promise.all([
      supabase.from('users').select('id, name, email').eq('role', 'student').in('id', allowed),
      supabase.from('users').select('name').eq('id', session.uid).maybeSingle(),
    ]);
    if (studentsError) {
      console.error('App link: failed to load students', studentsError);
      return NextResponse.json({ error: 'Unable to send the app link' }, { status: 500 });
    }
    const recipients = (students ?? []) as { id: string; name: string; email: string }[];
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'None of those students are on your roster' }, { status: 404 });
    }

    const result = await sendAppLinkEmails(recipients, {
      appUrl,
      senderName: (sender?.name as string | undefined) || 'Your instructor',
      replyTo: session.email,
    });

    if (result.sent > 0) {
      const one = recipients.length === 1 ? recipients[0] : null;
      await logAudit(
        session,
        {
          action: 'user.app_link_sent',
          entityType: 'users',
          entityId: one?.id,
          details: {
            message: one
              ? `Emailed the app download link to ${one.name}`
              : `Emailed the app download link to ${result.sent} students`,
            count: result.sent,
          },
        },
        request,
      );
    }

    if (result.sent === 0) {
      return NextResponse.json(
        { error: `The email could not be sent${result.error ? `: ${result.error}` : '.'}` },
        { status: 502 },
      );
    }
    const failed = recipients.length - result.sent;
    return NextResponse.json({
      sent: result.sent,
      failed,
      ...(failed > 0 ? { warning: `${failed} could not be sent${result.error ? `: ${result.error}` : '.'}` } : {}),
    });
  } catch (err) {
    console.error('App link send failed', err);
    return NextResponse.json({ error: 'Unable to send the app link' }, { status: 500 });
  }
}
