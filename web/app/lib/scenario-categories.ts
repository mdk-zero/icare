import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { VALID_CATEGORIES } from '@/app/lib/ai/scenario';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

export type CategorySource = 'faculty' | 'lesson';

/** The DB check caps a name at 60 characters. */
const MAX_NAME_LENGTH = 60;

/** Collapses whitespace and caps length the way the table's check expects. */
export function normalizeCategoryName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
}

/** Finds `name` in `list` ignoring case, returning the list's spelling. */
export function matchCategory(list: readonly string[], name: string): string | null {
  const key = name.toLowerCase();
  return list.find((c) => c.toLowerCase() === key) ?? null;
}

/**
 * Before migration 042 there is no table, only the ten-value enum. Reads fall
 * back to the presets and writes of anything new are refused with a message
 * that says why, instead of failing on the enum with a generic error.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (error.message ?? '').includes('scenario_categories')
  );
}

const NEEDS_MIGRATION =
  'New categories need database migration 042 (scenario categories) applied first.';

/** Alphabetical, with the catch-all General last. */
function sortCategories(names: string[]): string[] {
  return names.sort((a, b) =>
    a === 'General' ? 1 : b === 'General' ? -1 : a.localeCompare(b),
  );
}

export async function listCategories(supabase: Supabase): Promise<string[]> {
  const { data, error } = await supabase.from('scenario_categories').select('name');
  if (error) {
    if (!isMissingTable(error)) console.error('Failed to list scenario categories', error);
    return sortCategories([...VALID_CATEGORIES]);
  }
  return sortCategories((data ?? []).map((row) => (row as { name: string }).name));
}

/**
 * Ensures every name exists as a category and returns each one's stored
 * spelling, in input order. An existing category matched in another case is
 * reused rather than duplicated.
 */
export async function ensureCategories(
  supabase: Supabase,
  names: string[],
  source: CategorySource,
  createdBy: string | null,
): Promise<{ names: string[] } | { error: string; status: number }> {
  const wanted = names.map(normalizeCategoryName);
  if (wanted.some((n) => !n)) return { error: 'Category name is required', status: 400 };

  const read = async () => {
    const { data, error } = await supabase.from('scenario_categories').select('name');
    return { existing: (data ?? []).map((row) => (row as { name: string }).name), error };
  };

  let { existing, error } = await read();
  if (error) {
    if (!isMissingTable(error)) {
      console.error('Failed to read scenario categories', error);
      return { error: 'Unable to read categories', status: 500 };
    }
    // Pre-042: only the enum's own labels can be saved.
    const resolved = wanted.map((n) => matchCategory(VALID_CATEGORIES, n));
    return resolved.every((n): n is string => n !== null)
      ? { names: resolved }
      : { error: NEEDS_MIGRATION, status: 503 };
  }

  const missing = Array.from(
    new Map(
      wanted
        .filter((n) => !matchCategory(existing, n))
        .map((n) => [n.toLowerCase(), n] as const),
    ).values(),
  );

  if (missing.length > 0) {
    // One row at a time: a multi-row insert is all-or-nothing, and a single
    // name raced in by someone else would take the rest down with it.
    for (const name of missing) {
      const { error: insertError } = await supabase
        .from('scenario_categories')
        .insert({ name, source, created_by: createdBy });
      // 23505: created meanwhile (maybe in another case) — the re-read
      // below picks up that spelling.
      if (insertError && insertError.code !== '23505') {
        console.error('Failed to create scenario category', insertError);
        return { error: 'Unable to create categories', status: 500 };
      }
    }
    ({ existing, error } = await read());
    if (error) return { error: 'Unable to read categories', status: 500 };
  }

  const resolved = wanted.map((n) => matchCategory(existing, n));
  if (resolved.some((n) => n === null)) return { error: 'Unable to create categories', status: 500 };
  return { names: resolved as string[] };
}
