import { getSupabaseAdmin, type DbUser, type UserRole } from '../supabase/server';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  picture_url: string | null;
  has_password: boolean;
  force_password_change: boolean;
}

export function toPublicUser(
  row: Pick<DbUser, 'id' | 'email' | 'name' | 'role' | 'picture_url' | 'password_hash' | 'force_password_change'>,
): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    picture_url: row.picture_url,
    has_password: Boolean(row.password_hash),
    force_password_change: row.force_password_change,
  };
}

export async function findUserByEmail(email: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, picture_url, password_hash, force_password_change')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findUserByGoogleSub(sub: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, picture_url, password_hash, force_password_change')
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
    .select('id, email, name, role, picture_url, password_hash, force_password_change')
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
      last_login_at: new Date().toISOString(),
    })
    .select('id, email, name, role, picture_url, password_hash, force_password_change')
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
