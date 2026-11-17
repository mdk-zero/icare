import type { getSupabaseAdmin } from './supabase/server';
import {
  customFormKey,
  formByKey,
  isCustomFormKey,
  type FormPageImage,
  type FormRow,
  type FormSection,
  type ReturnDemoForm,
} from './return-demo-forms';
import { isMissingForms, loadFormKeys } from './return-demos-server';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** An uploaded form as return_demo_custom_forms (095) holds it. */
export interface CustomFormRow {
  id: string;
  created_by: string | null;
  title: string;
  description: string;
  pages: FormPageImage[];
  sections: FormSection[];
  created_at: string;
}

export const CUSTOM_FORM_COLUMNS = 'id, created_by, title, description, pages, sections, created_at';

/** Whether an error means migration 095 (uploaded forms) isn't applied yet. */
export const isMissingCustomForms = (error: { code?: string } | null | undefined) =>
  error?.code === '42P01' || error?.code === 'PGRST205';

export const CUSTOM_FORMS_NEED_MIGRATION = 'Uploading your own forms needs database migration 095.';

/** A stored upload as a form, the same shape as a built-in one. */
export function customForm(row: CustomFormRow): ReturnDemoForm & { created_by: string | null; created_at: string } {
  const pages = Array.isArray(row.pages) && row.pages.length > 0 ? row.pages : [{ image: '', width: 595, height: 842 }];
  return {
    key: customFormKey(row.id),
    title: row.title,
    description: row.description,
    source: 'Uploaded by an instructor',
    page: pages[0],
    pages,
    sections: Array.isArray(row.sections) ? row.sections : [],
    custom: true,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/**
 * The forms with these keys, in the same order: built-in ones from the code,
 * uploaded ones from the database. Unknown keys are left out.
 */
export async function loadFormsByKeys(supabase: Supabase, keys: readonly string[]): Promise<ReturnDemoForm[]> {
  const ids = keys.filter(isCustomFormKey).map((k) => k.slice('custom:'.length));
  const custom = new Map<string, ReturnDemoForm>();
  if (ids.length > 0) {
    const { data, error } = await supabase.from('return_demo_custom_forms').select(CUSTOM_FORM_COLUMNS).in('id', ids);
    if (error && !isMissingCustomForms(error)) throw new Error(`Unable to read the forms: ${error.message}`);
    for (const row of (data ?? []) as CustomFormRow[]) custom.set(customFormKey(row.id), customForm(row));
  }
  return keys
    .map((key) => (isCustomFormKey(key) ? custom.get(key) : formByKey(key)))
    .filter((f): f is ReturnDemoForm => !!f);
}

/** The keys among these that name a form that exists, in order. */
export async function knownFormKeys(supabase: Supabase, keys: readonly string[]): Promise<string[]> {
  return (await loadFormsByKeys(supabase, keys)).map((f) => f.key);
}

/** The uploaded forms an instructor can add: their own, or every one for an admin. Newest first. */
export async function listCustomForms(supabase: Supabase, session: { uid: string; role: string }) {
  let query = supabase.from('return_demo_custom_forms').select(CUSTOM_FORM_COLUMNS).order('created_at', { ascending: false });
  if (session.role !== 'admin') query = query.eq('created_by', session.uid);
  const { data, error } = await query;
  if (error) {
    if (isMissingCustomForms(error)) return { forms: [], enabled: false };
    throw new Error(`Unable to list the forms: ${error.message}`);
  }
  return { forms: ((data ?? []) as CustomFormRow[]).map(customForm), enabled: true };
}

/**
 * What an app from before the PhilPEN form reads off a form: a sheet's
 * columns and what a row is called. Sent empty so an old install shows an
 * empty card rather than crashing on a form it can't draw.
 */
export const LEGACY_SHEET = { fields: [] as never[], rowLabel: 'Form' };

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

  const forms = (await loadFormsByKeys(supabase, keys)).map((form) => {
      const saved = byKey.get(form.key);
      return {
        ...form,
        ...LEGACY_SHEET,
        rows: Array.isArray(saved?.entries) ? saved.entries : [],
        submitted_at: saved?.submitted_at ?? null,
        updated_at: saved?.updated_at ?? null,
      };
    });
  return { assignment, forms };
}
