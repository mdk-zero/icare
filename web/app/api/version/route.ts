import { NextResponse } from 'next/server';

/**
 * Which build is live, for UpdateToast: a tab whose own build differs offers
 * a refresh. Free of session and database work, like /api/health, since
 * every open tab asks now and then.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { version: process.env.ICARE_BUILD_ID || null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
