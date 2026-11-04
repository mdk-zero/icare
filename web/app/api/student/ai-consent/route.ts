import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { AI_CONSENT_NEEDS_MIGRATION, readAiConsent, saveAiConsent } from '@/app/lib/ai-consent';

/** GET → { consent: true | false | null, available }: the student's answer to "Allow AI features?". */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(await readAiConsent(getSupabaseAdmin(), session.uid));
}

/** POST { consent: boolean }: saves the answer. A no deletes the student's saved AI tips and feedback. */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { consent?: unknown };
  try {
    body = (await request.json()) as { consent?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.consent !== 'boolean') {
    return NextResponse.json({ error: 'consent must be true or false' }, { status: 400 });
  }

  const result = await saveAiConsent(getSupabaseAdmin(), session.uid, body.consent);
  if (result === 'needs_migration') return NextResponse.json({ error: AI_CONSENT_NEEDS_MIGRATION }, { status: 503 });
  if (result === 'failed') return NextResponse.json({ error: 'Unable to save your answer. Please try again.' }, { status: 500 });
  return NextResponse.json({ consent: body.consent, available: true });
}
