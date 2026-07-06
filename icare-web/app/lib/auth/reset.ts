import { getSupabaseAdmin } from '../supabase/server';
import { hashPassword, verifyPassword } from './password';

export interface ResetableUser {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function findUserForPasswordReset(email: string): Promise<ResetableUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, password_hash, force_password_change')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    hasPassword: Boolean(data.password_hash),
  };
}

export async function storePasswordResetOtp(
  userId: string,
  otpHash: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  const { error } = await supabase.from('password_resets').insert({
    user_id: userId,
    otp_hash: otpHash,
    expires_at: expiresAt,
  });

  if (error) throw error;
}

export async function verifyPasswordResetOtp(
  userId: string,
  plainOtp: string,
  markUsed = true,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('password_resets')
    .select('id, otp_hash, expires_at, used_at')
    .eq('user_id', userId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  const ok = await verifyPassword(plainOtp, data.otp_hash);
  if (!ok) return false;

  // Mark as used immediately to prevent replay unless we're only checking it.
  if (markUsed) {
    await supabase.from('password_resets').update({ used_at: new Date().toISOString() }).eq('id', data.id);
  }
  return true;
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const passwordHash = await hashPassword(newPassword);

  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, force_password_change: false })
    .eq('id', userId);

  if (error) throw error;
}
