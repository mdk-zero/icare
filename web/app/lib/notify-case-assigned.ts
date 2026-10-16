import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** "Oct 20, 11:59 PM", in the school's time zone. */
function dueLabel(deadline: Date): string {
  return deadline.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Tells each newly assigned student about their patient case: a row in their
 * notifications, which the app shows live and the push trigger (072) sends to
 * their phone. Tapping it opens the case. A failure is only logged; the
 * assignment itself stands.
 */
export async function notifyCaseAssigned(
  supabase: Supabase,
  scenario: { id: string; title: string; patient_id: string | null },
  assignments: { id: string; student_id: string }[],
  deadline: Date,
): Promise<void> {
  if (assignments.length === 0) return;
  const { error } = await supabase.from('notifications').insert(
    assignments.map((a) => ({
      user_id: a.student_id,
      type: 'assignment_created',
      title: 'New patient case assigned',
      body: `You have been assigned "${scenario.title}". Due ${dueLabel(deadline)}.`,
      data: { kind: 'scenario', scenario_id: scenario.id, assignment_id: a.id, patient_id: scenario.patient_id },
    })),
  );
  if (error) console.error('Failed to create patient case notifications', error);
}
