import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { logStudentWebEvent, studentWebEmailOn } from '@/app/lib/student-web-server';
import { STUDENT_WEB_EMAIL_OFF, STUDENT_WEB_EMAIL_ON } from '@/app/lib/student-web';

/**
 * A student's own switch for getting their notifications by email while they
 * use the student web app (lib/student-web). GET { on }; POST { on } sets it.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    return NextResponse.json({ on: await studentWebEmailOn(session.uid) });
  } catch (err) {
    console.error('GET /api/student-web/email failed', err);
    return NextResponse.json({ error: 'Unable to load your email setting' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let on: unknown;
  try {
    on = ((await request.json()) as { on?: unknown }).on;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof on !== 'boolean') return NextResponse.json({ error: 'Say on: true or false' }, { status: 400 });
  await logStudentWebEvent(session, on ? STUDENT_WEB_EMAIL_ON : STUDENT_WEB_EMAIL_OFF, request);
  try {
    const saved = await studentWebEmailOn(session.uid);
    if (saved !== on) throw new Error('The email setting did not save');
    return NextResponse.json({ on: saved });
  } catch (err) {
    console.error('POST /api/student-web/email failed', err);
    return NextResponse.json({ error: 'Unable to save your email setting' }, { status: 500 });
  }
}
