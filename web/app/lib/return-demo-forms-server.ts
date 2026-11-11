import type { getSupabaseAdmin } from './supabase/server';
import { formByKey, type FormRow, type ReturnDemoForm } from './return-demo-forms';
import { isMissingForms, loadFormKeys } from './return-demos-server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** A form on an assignment, with what the student entered on it. */
export interface FilledForm extends ReturnDemoForm {
  rows: FormRow[];
  /** When the student handed it in; null while it is still theirs to fill in. */
  submitted_at: string | null;
  updated_at: string | null;
}

export interface AssignmentForms {
  assignment: { id: string; scenario_id: string; student_id: string; status: string };
  forms: FilledForm[];
}

/**
 * The forms an assignment's Return Demonstration includes (094), in its
 * order, each with the student's rows. Null when the assignment doesn't exist.
 */
export async function loadAssignmentForms(supabase: Supabase, assignmentId: string): Promise<AssignmentForms | null> {
  const { data, error } = await supabase
    .from('scenario_assignments')
    .select('id, scenario_id, student_id, status')
    .eq('id', assignmentId)
    .maybeSingle();
  if (error || !data) return null;
  const assignment = data as AssignmentForms['assignment'];

  const keys = await loadFormKeys(supabase, assignment.scenario_id);
  if (keys.length === 0) return { assignment, forms: [] };

  const { data: entries, error: entriesError } = await supabase
    .from('return_demo_form_entries')
    .select('form_key, entries, submitted_at, updated_at')
    .eq('assignment_id', assignmentId);
  if (entriesError && !isMissingForms(entriesError)) throw new Error(`Unable to read the forms: ${entriesError.message}`);
  const byKey = new Map(
    ((entries ?? []) as { form_key: string; entries: FormRow[]; submitted_at: string | null; updated_at: string }[]).map((e) => [
      e.form_key,
      e,
    ]),
  );

  const forms = keys
    .map((key) => formByKey(key))
    .filter((f): f is ReturnDemoForm => !!f)
    .map((form) => {
      const saved = byKey.get(form.key);
      return {
        ...form,
        rows: Array.isArray(saved?.entries) ? saved.entries : [],
        submitted_at: saved?.submitted_at ?? null,
        updated_at: saved?.updated_at ?? null,
      };
    });
  return { assignment, forms };
}
