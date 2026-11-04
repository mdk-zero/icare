import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../supabase/server';
import { readSession } from './session';
import type { SessionPayload } from './jwt';

/**
 * A Dean proper, for what a Program Chair may not do. A Program Chair is
 * stored as a Dean (role admin with users.admin_title, 080), so every role
 * check lets them in and only the title tells the two apart. The live row
 * decides, and anything short of reading it as untitled refuses: a failed read
 * must not hand a Program Chair the Dean's pages.
 */
export async function readDeanSession(): Promise<SessionPayload | null> {
  const session = await readSession();
  if (!session || session.role !== 'admin') return null;

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('role, admin_title')
    .eq('id', session.uid)
    .maybeSingle();
  if (error || !data || data.role !== 'admin' || data.admin_title !== null) return null;
  return session;
}

/** For route handlers: the session, or the 401/403 response to return instead. */
export async function requireDean(): Promise<
  { session: SessionPayload; response?: never } | { session?: never; response: NextResponse }
> {
  const signedIn = await readSession();
  if (!signedIn) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const session = await readDeanSession();
  if (!session) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}
