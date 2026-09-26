/**
 * Impersonation swaps the session cookie for one signed as the target user and
 * parks the developer's own token beside it, so returning is a cookie swap
 * rather than a fresh login.
 */
export const IMPERSONATION_RETURN_COOKIE = 'icare_dev_return';

/**
 * Readable by client JS on purpose: the banner has to render on every page of
 * the app without waiting on a fetch, and it carries no secret — just who is
 * being impersonated. The token that grants the access stays httpOnly.
 */
export const IMPERSONATION_FLAG_COOKIE = 'icare_impersonating';

export interface ImpersonationFlag {
  name: string;
  email: string;
  role: string;
  by: string;
}

export function encodeFlag(flag: ImpersonationFlag): string {
  return encodeURIComponent(JSON.stringify(flag));
}

export function decodeFlag(raw: string | undefined): ImpersonationFlag | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ImpersonationFlag>;
    if (typeof parsed.name !== 'string' || typeof parsed.email !== 'string') return null;
    return {
      name: parsed.name,
      email: parsed.email,
      role: typeof parsed.role === 'string' ? parsed.role : 'student',
      by: typeof parsed.by === 'string' ? parsed.by : '',
    };
  } catch {
    return null;
  }
}

export function homeForRole(role: string): string {
  if (role === 'faculty') return '/faculty';
  if (role === 'admin') return '/admin';
  if (role === 'super_admin') return '/super-admin';
  // Students have no web portal (they use the mobile app).
  return '/login';
}
