import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { confirmEmailChange, requestEmailChange } from '@/app/lib/auth/email-change';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// One route for every actor — the account holder, the owning admin, a super
// admin. Who may change whose email is decided in app/lib/auth/email-change.ts
// from the live rows, not from the caller's portal.

// POST /api/users/:id/email  { email } — send a code to the new address.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  try {
    const result = await requestEmailChange(session, id, body.email);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { new_email, devOtp } = result.value;
    return NextResponse.json({
      new_email,
      message: devOtp
        ? 'Email sending is skipped in development. Use the code shown below.'
        : `A 6-digit code was sent to ${new_email}. It expires in 10 minutes.`,
      devOtp,
    });
  } catch (err) {
    console.error('Failed to start an email change', err);
    return NextResponse.json({ error: 'Unable to send the confirmation code' }, { status: 500 });
  }
}

// PUT /api/users/:id/email  { code } — confirm and apply the change.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  try {
    const result = await confirmEmailChange(session, id, body.code, request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ user: result.value });
  } catch (err) {
    console.error('Failed to confirm an email change', err);
    return NextResponse.json({ error: 'Unable to change the email' }, { status: 500 });
  }
}
