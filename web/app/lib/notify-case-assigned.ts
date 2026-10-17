import type { getSupabaseAdmin } from './supabase/server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** "Mon, Oct 20", in the school's time zone: the day it is performed. */
function performLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' });
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
      // Performed on its date, not due by it.
      body: `You have been assigned "${scenario.title}". You'll perform it on ${performLabel(deadline)}.`,
      data: { kind: 'scenario', scenario_id: scenario.id, assignment_id: a.id, patient_id: scenario.patient_id },
    })),
  );
  if (error) console.error('Failed to create patient case notifications', error);
}

/**
 * The same for a Return Demonstration: a notification (and, through the push
 * trigger, a phone banner) that opens its skill checklists.
 */
export async function notifyReturnDemoAssigned(
  supabase: Supabase,
  demo: { id: string; title: string },
  assignments: { id: string; student_id: string }[],
  deadline: Date,
): Promise<void> {
  if (assignments.length === 0) return;
  const day = deadline.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' });
  const { error } = await supabase.from('notifications').insert(
    assignments.map((a) => ({
      user_id: a.student_id,
      type: 'assignment_created',
      title: 'New Return Demonstration',
      body: `You'll demonstrate "${demo.title}" on ${day}. Open it to see the checklist.`,
      data: { kind: 'return_demo', scenario_id: demo.id, assignment_id: a.id },
    })),
  );
  if (error) console.error('Failed to create Return Demonstration notifications', error);
}
