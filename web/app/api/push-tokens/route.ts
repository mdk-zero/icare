import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/** Expo push tokens look like ExponentPushToken[xxxxxxxx]. */
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

/** Before 072 the push_tokens table doesn't exist. */
function isMissingTable(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function readToken(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: unknown; platform?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform = body.platform === 'ios' ? 'ios' : 'android';
    return TOKEN_PATTERN.test(token) ? { token, platform } : null;
  } catch {
    return null;
  }
}

/**
 * POST { token, platform }: this device gets the signed-in user's push
 * notifications. A token moves to whoever signed in on the device last.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = await readToken(request);
  if (!input) return NextResponse.json({ error: 'Provide a valid Expo push token' }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from('push_tokens')
    .upsert({ ...input, user_id: session.uid, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  if (isMissingTable(error)) {
    return NextResponse.json({ error: 'Push notifications need database migration 072 applied first.' }, { status: 503 });
  }
  if (error) {
    console.error('Failed to save push token', error);
    return NextResponse.json({ error: 'Unable to save the push token' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

/** DELETE { token }: stop pushing to this device (on sign-out). */
export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const input = await readToken(request);
  if (!input) return NextResponse.json({ error: 'Provide a valid Expo push token' }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from('push_tokens')
    .delete()
    .eq('token', input.token)
    .eq('user_id', session.uid);
  if (error && !isMissingTable(error)) {
    console.error('Failed to remove push token', error);
    return NextResponse.json({ error: 'Unable to remove the push token' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
