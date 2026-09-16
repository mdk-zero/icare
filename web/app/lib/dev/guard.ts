import { NextResponse } from 'next/server';
import { readDeveloperSession } from '../auth/developer';
import { DevError } from './catalog';
import type { SessionPayload } from '../auth/jwt';

/**
 * The console is meant to be invisible, so a caller who is not a developer
 * gets the same 404 a nonexistent route would give. A 403 would confirm that
 * /api/dev exists and is worth attacking.
 */
export function devNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function requireDeveloper(): Promise<SessionPayload | null> {
  return readDeveloperSession();
}

export function devErrorResponse(err: unknown): NextResponse {
  if (err instanceof DevError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('developer console request failed', err);
  const message = err instanceof Error ? err.message : 'Request failed';
  return NextResponse.json({ error: message }, { status: 500 });
}
