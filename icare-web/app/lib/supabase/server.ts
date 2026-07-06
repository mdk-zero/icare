import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
    );
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

export type UserRole = 'student' | 'faculty' | 'admin';

export interface DbUser {
  id: string;
  google_sub: string | null;
  email: string;
  name: string;
  picture_url: string | null;
  role: UserRole;
  password_hash: string | null;
  force_password_change: boolean;
  created_at: string;
  last_login_at: string | null;
}
