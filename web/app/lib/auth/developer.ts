import { getSupabaseAdmin } from '../supabase/server';
import { readSession } from './session';
import type { SessionPayload } from './jwt';

/**
 * The developer console is gated on an env allowlist rather than a role, so
 * access cannot be granted from inside the app: a stolen admin account, or
 * write access to the users table, still leaves the console unreachable.
 *
 * Unset or empty means nobody is a developer — the safe default for any
 * deployment that never opts in.
 */
export function developerEmails(): string[] {
  const raw = process.env.DEVELOPER_EMAILS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = developerEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * The console's authority on who is asking.
 *
 * The session JWT carries the email it was signed with, which would keep
 * working for seven days after the account was renamed or deleted, so the
 * live row is what actually decides — the token only names the candidate.
 */
export async function readDeveloperSession(): Promise<SessionPayload | null> {
  const session = await readSession();
  if (!session) return null;
  if (!isDeveloperEmail(session.email)) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('email')
    .eq('id', session.uid)
    .maybeSingle();
  if (error || !data) return null;
  if (!isDeveloperEmail(data.email)) return null;

  return session;
}
