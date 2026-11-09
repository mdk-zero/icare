import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { setStudentWebEnabled, studentWebSummary } from '@/app/lib/student-web-server';

/** GET: the student web switch, its history and how many students use it (lib/student-web). */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  try {
    return NextResponse.json(await studentWebSummary());
  } catch (err) {
    console.error('GET /api/super-admin/student-web failed', err);
    return NextResponse.json({ error: 'Unable to load the web version settings' }, { status: 500 });
  }
}

/** POST { on }: turns the student web app on or off. */
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  let on: unknown;
  try {
    on = ((await request.json()) as { on?: unknown }).on;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof on !== 'boolean') return NextResponse.json({ error: 'Say on: true or false' }, { status: 400 });
  try {
    await setStudentWebEnabled(guard.session, on, request);
    return NextResponse.json(await studentWebSummary());
  } catch (err) {
    console.error('POST /api/super-admin/student-web failed', err);
    return NextResponse.json({ error: 'Unable to change the web version setting' }, { status: 500 });
  }
}
