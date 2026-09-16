/**
 * The allowlist itself, with no dependencies.
 *
 * Split out for the same reason jwt.ts is split from session.ts: proxy.ts
 * screens /api/dev before the route handlers run, and it must not drag the
 * Supabase client into the proxy bundle to do it.
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
