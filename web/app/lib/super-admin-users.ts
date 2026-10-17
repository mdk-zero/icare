import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export const SUPER_ADMIN_ROLES = ['student', 'faculty', 'admin', 'super_admin'] as const;
export type AccountRole = (typeof SUPER_ADMIN_ROLES)[number];

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (SUPER_ADMIN_ROLES as readonly string[]).includes(value);
}

// campus_id is the institution (007, shown as "Institution" since 077).
const BASE_SELECT =
  'id, email, name, role, picture_url, sex, created_at, last_login_at, force_password_change, section_id, sections(name), campus_id, campuses(name)';

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

/** Flattens the embedded section and institution into name fields. */
export function toAccount(row: Record<string, unknown>) {
  const { sections, campuses, ...rest } = row;
  const section = sections as { name?: string } | null;
  const campus = campuses as { name?: string } | null;
  return { ...rest, section_name: section?.name ?? null, institution_name: campus?.name ?? null };
}

/** Every institution (the campuses table, 007), by name. */
export async function listInstitutions(supabase: Supabase): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('campuses').select('id, name').order('name');
  if (error) throw new Error(`Unable to read institutions: ${error.message}`);
  return (data ?? []) as { id: string; name: string }[];
}

/** Every section, with the Dean who owns it once 077 is applied (null before). */
export async function listSectionsWithOwner(
  supabase: Supabase,
): Promise<{ id: string; name: string; admin_id: string | null }[]> {
  const owned = await supabase.from('sections').select('id, name, admin_id').order('name');
  if (!owned.error) return (owned.data ?? []) as { id: string; name: string; admin_id: string | null }[];
  if (owned.error.code !== '42703' && owned.error.code !== 'PGRST204') {
    throw new Error(`Unable to read sections: ${owned.error.message}`);
  }
  const plain = await supabase.from('sections').select('id, name').order('name');
  if (plain.error) throw new Error(`Unable to read sections: ${plain.error.message}`);
  return (plain.data ?? []).map((s) => ({ id: s.id as string, name: s.name as string, admin_id: null }));
}

const MAX_INSTITUTION_NAME = 120;

/**
 * The institution a Dean is being put in, from a request body: an existing
 * one by `campus_id`, or a new one by `new_institution` (an existing one of
 * the same name is reused). Undefined when the body names neither.
 */
export async function resolveInstitution(
  supabase: Supabase,
  body: Record<string, unknown>,
): Promise<{ id: string | null } | { error: string } | undefined> {
  if (typeof body.new_institution === 'string' && body.new_institution.trim()) {
    const name = body.new_institution.replace(/\s+/g, ' ').trim();
    if (name.length > MAX_INSTITUTION_NAME) {
      return { error: `Institution name is too long (max ${MAX_INSTITUTION_NAME} characters)` };
    }
    const { data: same } = await supabase.from('campuses').select('id').ilike('name', name).limit(1).maybeSingle();
    if (same) return { id: same.id as string };
    // The code is required and unique; nothing shows it, so it is derived.
    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'INSTITUTION';
    for (let n = 1; n <= 20; n++) {
      const code = n === 1 ? base : `${base}-${n}`;
      const { data, error } = await supabase.from('campuses').insert({ name, code }).select('id').single();
      if (!error && data) return { id: data.id as string };
      if (error?.code !== '23505') return { error: 'Unable to create the institution' };
    }
    return { error: 'Unable to create the institution' };
  }
  if (body.campus_id === undefined) return undefined;
  if (body.campus_id === null || body.campus_id === '') return { id: null };
  if (typeof body.campus_id !== 'string') return { error: 'Invalid institution' };
  const { data } = await supabase.from('campuses').select('id').eq('id', body.campus_id).maybeSingle();
  return data ? { id: data.id as string } : { error: 'Institution not found' };
}

/** How many super admins exist, so the last one can't be demoted or deleted. */
export async function countSuperAdmins(supabase: Supabase): Promise<number> {
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin');
  return count ?? 0;
}
