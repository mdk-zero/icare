import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Patients a student may see and chart on: the patients linked to scenarios
 * that have been assigned to them. Faculty control this by linking a patient
 * when creating a scenario (scenarios.patient_id) and then assigning it.
 */
export async function getAssignedPatientIds(
  supabase: SupabaseClient,
  studentId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('scenario_assignments')
    .select('scenarios(patient_id)')
    .eq('student_id', studentId);

  if (error) {
    console.error('Failed to resolve assigned patients', error);
    throw new Error('Unable to resolve assigned patients');
  }

  const ids = new Set<string>();
  for (const row of (data ?? []) as unknown as { scenarios: { patient_id: string | null } | null }[]) {
    const patientId = row.scenarios?.patient_id;
    if (patientId) ids.add(patientId);
  }
  return [...ids];
}

export async function isPatientAssigned(
  supabase: SupabaseClient,
  studentId: string,
  patientId: string,
): Promise<boolean> {
  const ids = await getAssignedPatientIds(supabase, studentId);
  return ids.includes(patientId);
}
