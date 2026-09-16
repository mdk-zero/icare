import { NextResponse } from 'next/server';

/**
 * Reachability probe for the mobile app's connectivity heartbeat.
 *
 * Deliberately free of session and database work: a device polls this while
 * offline to notice the moment it can reach us again, so the handler has to
 * stay cheap enough that the polling costs nothing.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: NO_STORE });
}
