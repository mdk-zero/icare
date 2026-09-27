import { randomInt } from 'crypto';
import { getSupabaseAdmin } from '../supabase/server';
import { isMissingMigration } from './super-admin';
import { hashPassword, verifyPassword } from './password';

export interface ResetableUser {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
}

export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
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

/**
 * True if this user was already issued a code within `withinMs`.
 *
 * The in-memory limiter in rate-limit.ts cannot carry this: its Map lives in
 * one server instance, so on a multi-instance deploy a client that re-requests
 * in a loop is spread across instances and each one sees a fresh count. This
 * reads the row that was actually written, so the cooldown holds everywhere.
 */
export async function hasRecentPasswordResetOtp(
  userId: string,
  withinMs: number,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - withinMs).toISOString();

  const { data, error } = await supabase
    .from('password_resets')
    .select('id')
    .eq('user_id', userId)
    .is('used_at', null)
    .gt('created_at', since)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

/** Wrong codes allowed before a code is spent, as for email changes (058). */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * 'ok' — the code is right. 'invalid' — wrong, missing, or expired.
 * 'locked' — this wrong guess was the last one allowed, so the code is now
 * spent and a new one must be requested. A 6-digit code is otherwise
 * guessable within its 10 minutes.
 */
export type OtpCheck = 'ok' | 'invalid' | 'locked';

export async function verifyPasswordResetOtp(
  userId: string,
  plainOtp: string,
  markUsed = true,
): Promise<OtpCheck> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('password_resets')
    .select('id, otp_hash')
    .eq('user_id', userId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 'invalid';

  const ok = await verifyPassword(plainOtp, data.otp_hash);
  if (!ok) return await countWrongOtp(data.id);

  // Mark as used immediately to prevent replay unless we're only checking it.
  if (markUsed) {
    await supabase.from('password_resets').update({ used_at: new Date().toISOString() }).eq('id', data.id);
  }
  return 'ok';
}

async function countWrongOtp(resetId: string): Promise<OtpCheck> {
  const { data, error } = await getSupabaseAdmin().rpc('count_password_reset_miss', {
    p_id: resetId,
    p_max: MAX_OTP_ATTEMPTS,
  });
  // Before 059 there is no counter; the per-IP limit on the routes is then
  // the only brake.
  if (error) {
    if (isMissingMigration(error)) return 'invalid';
    throw error;
  }
  return typeof data === 'number' && data >= MAX_OTP_ATTEMPTS ? 'locked' : 'invalid';
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
