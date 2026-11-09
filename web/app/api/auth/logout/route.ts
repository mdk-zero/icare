import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie } from '@/app/lib/auth/session';
import { verifySession } from '@/app/lib/auth/jwt';
import { logStudentWebEvent } from '@/app/lib/student-web-server';
import { STUDENT_WEB_SIGNOUT } from '@/app/lib/student-web';

export async function POST(request: NextRequest) {
  // A student signing out of the student web app stops their notification
  // emails (lib/student-web). Read off the token alone: signing out still
  // counts while the switch is off.
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const claims = await verifySession(authorization.slice('Bearer '.length));
    if (claims?.client === 'student-web') await logStudentWebEvent(claims, STUDENT_WEB_SIGNOUT, request);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
