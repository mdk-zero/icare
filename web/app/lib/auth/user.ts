import { getSupabaseAdmin, type DbUser, type UserRole, type UserSex } from '../supabase/server';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  picture_url: string | null;
  /** Null when unrecorded; the mobile greeting drops the honorific then. */
  sex: UserSex | null;
  has_password: boolean;
  force_password_change: boolean;
}

/**
 * The columns every account lookup needs. Kept as one constant so a field
 * added to PublicUser cannot reach some auth paths and miss others — `sex`
 * arriving in 032 would otherwise have had to be remembered in four places.
 */
export const USER_SELECT =
  'id, email, name, role, picture_url, sex, password_hash, force_password_change';

/**
 * Normalizes a `sex` value arriving from a form field or a CSV cell.
 *
 * Optional everywhere it is collected, so absent means "don't touch it" and
 * an explicit empty value means "leave it unrecorded" — neither is an error.
 * The single-letter forms are what a roster spreadsheet usually holds.
 */
export function parseSex(value: unknown): { sex?: UserSex | null; error?: string } {
  if (value === undefined) return {};
  if (value === null) return { sex: null };
  if (typeof value !== 'string') return { error: 'Sex must be male or female' };
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return { sex: null };
  if (normalized === 'male' || normalized === 'm') return { sex: 'male' };
  if (normalized === 'female' || normalized === 'f') return { sex: 'female' };
  return { error: 'Sex must be male or female' };
}

export function toPublicUser(
  row: Pick<
    DbUser,
    'id' | 'email' | 'name' | 'role' | 'picture_url' | 'sex' | 'password_hash' | 'force_password_change'
  >,
): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    picture_url: row.picture_url,
    sex: row.sex ?? null,
    has_password: Boolean(row.password_hash),
    force_password_change: row.force_password_change,
  };
}

export async function findUserByEmail(email: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select(USER_SELECT)
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findUserByGoogleSub(sub: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select(USER_SELECT)
    .eq('google_sub', sub)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertGoogleUser(profile: {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        google_sub: profile.sub,
        email: profile.email,
        name: profile.name,
        picture_url: profile.picture,
        last_login_at: new Date().toISOString(),
      },
      { onConflict: 'google_sub' },
    )
    .select(USER_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function createGoogleUser(
  profile: {
    sub: string;
    email: string;
    name: string;
    picture: string | null;
  },
  role: UserRole,
  /** Google tells us nothing about this, so it is asked for alongside the role. */
  sex: UserSex | null = null,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .insert({
      google_sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture_url: profile.picture,
      role,
      sex,
      last_login_at: new Date().toISOString(),
    })
    .select(USER_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function touchLastLogin(userId: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
}
