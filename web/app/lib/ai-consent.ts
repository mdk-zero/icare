import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A student's permission to send their record to the AI provider (migration
 * 092). No recorded yes means no AI, whatever the reason: not asked yet, said
 * no, the column isn't there, or the read failed.
 */

export const AI_CONSENT_NEEDS_MIGRATION = 'AI permission needs database migration 092 applied first.';

const isMissingColumn = (error: { code?: string } | null) => error?.code === '42703' || error?.code === 'PGRST204';

export interface AiConsent {
  /** null: hasn't answered. */
  consent: boolean | null;
  /** False when it can't be read or saved, so the app shouldn't ask. */
  available: boolean;
}

export async function readAiConsent(supabase: SupabaseClient, studentId: string): Promise<AiConsent> {
  const { data, error } = await supabase.from('users').select('ai_consent').eq('id', studentId).maybeSingle();
  if (error) {
    if (!isMissingColumn(error)) console.error('Failed to read AI consent', error);
    return { consent: null, available: false };
  }
  return { consent: (data?.ai_consent as boolean | null | undefined) ?? null, available: true };
}

export async function hasAiConsent(supabase: SupabaseClient, studentId: string): Promise<boolean> {
  return (await readAiConsent(supabase, studentId)).consent === true;
}

/**
 * Records the answer. A no also deletes the AI writing saved about this
 * student, as the Privacy Policy says: the tips and the feedback on their work.
 */
export async function saveAiConsent(
  supabase: SupabaseClient,
  studentId: string,
  consent: boolean,
): Promise<'saved' | 'needs_migration' | 'failed'> {
  const { error } = await supabase
    .from('users')
    .update({ ai_consent: consent, ai_consent_at: new Date().toISOString() })
    .eq('id', studentId);
  if (error) {
    if (isMissingColumn(error)) return 'needs_migration';
    console.error('Failed to save AI consent', error);
    return 'failed';
  }
  if (consent) return 'saved';

  const [tips, feedback] = await Promise.all([
    supabase.from('student_ai_tips').delete().eq('student_id', studentId),
    supabase.from('student_reflections').update({ ai_feedback: null, ai_signature: null }).eq('student_id', studentId),
  ]);
  // The answer stands and no more is sent, but they were told this is gone.
  if (tips.error || feedback.error) {
    console.error('Failed to delete saved AI writing', tips.error ?? feedback.error);
    return 'failed';
  }
  return 'saved';
}
