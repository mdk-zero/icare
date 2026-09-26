import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const SUPER_ADMIN_ROLES = ['student', 'faculty', 'admin', 'super_admin'] as const;
export type AccountRole = (typeof SUPER_ADMIN_ROLES)[number];

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (SUPER_ADMIN_ROLES as readonly string[]).includes(value);
}

const BASE_SELECT =
  'id, email, name, role, picture_url, sex, created_at, last_login_at, force_password_change, section_id, sections(name)';

/**
 * users.admin_id arrives with migration 053, which may not be applied yet.
 * Reads try it first and fall back without it; `ownerEnabled` tells the page
 * whether to offer the owning-admin field at all.
 */
export async function selectAccounts(
  supabase: Supabase,
  filter?: { id?: string },
): Promise<{ users: Record<string, unknown>[]; ownerEnabled: boolean; error?: unknown }> {
  const run = (columns: string) => {
    let query = supabase.from('users').select(columns).order('created_at', { ascending: false });
    if (filter?.id) query = query.eq('id', filter.id);
    return query;
  };
  const withOwner = await run(`${BASE_SELECT}, admin_id`);
  if (!withOwner.error) {
    return { users: (withOwner.data ?? []) as unknown as Record<string, unknown>[], ownerEnabled: true };
  }
  if (withOwner.error.code !== '42703' && withOwner.error.code !== 'PGRST204') {
    return { users: [], ownerEnabled: false, error: withOwner.error };
  }
  const plain = await run(BASE_SELECT);
  return {
    users: (plain.data ?? []) as unknown as Record<string, unknown>[],
    ownerEnabled: false,
    error: plain.error ?? undefined,
  };
}

/** Flattens the embedded section into a `section_name` field. */
export function toAccount(row: Record<string, unknown>) {
  const { sections, ...rest } = row;
  const section = sections as { name?: string } | null;
  return { ...rest, section_name: section?.name ?? null };
}

/** How many super admins exist, so the last one can't be demoted or deleted. */
export async function countSuperAdmins(supabase: Supabase): Promise<number> {
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin');
  return count ?? 0;
}
