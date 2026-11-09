import { NextResponse } from 'next/server';
import { studentWebEnabled } from '@/app/lib/student-web-server';

/**
 * GET: whether the student web app is turned on (lib/student-web). Public:
 * the app asks before anyone signs in, to show "turned off" instead of a
 * sign-in form that can't work.
 */
export async function GET() {
  try {
    return NextResponse.json({ on: await studentWebEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/student-web failed', err);
    return NextResponse.json({ error: 'Unable to check the web version' }, { status: 500 });
  }
}
