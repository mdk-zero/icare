import type { getSupabaseAdmin } from './supabase/server';
import { isMissingColumn } from './auth/live-user';
import { isMissingMigration } from './auth/super-admin';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * The Program Chairs under a Dean: Dean-level accounts titled program_chair
 * (080) whose users.admin_id is that Dean (087). Each keeps their own
 * instructors, students and records (077); the Dean sees how many people they
 * have, and nothing of what is theirs.
 */

export const PROGRAM_CHAIR_COLUMNS = 'id, email, name, picture_url, sex, created_at, last_login_at';

/** Every table with an owner column (065, 077), apart from users. */
const OWNED_TABLES = [
  'sections',
  'rooms',
  'ward_fixtures',
  'patients',
  'scenarios',
  'assessments',
  'case_presentations',
  'library_materials',
  'scenario_categories',
  'academic_terms',
  'courses',
];

function programChairsOf(supabase: Supabase, deanId: string, columns: string) {
  return supabase
    .from('users')
    .select(columns)
    .eq('role', 'admin')
    .eq('admin_title', 'program_chair')
    .eq('admin_id', deanId);
}

/** How many instructors and students belong to this Program Chair. */
export async function peopleOf(
  supabase: Supabase,
  chairId: string,
): Promise<{ instructor_count: number; student_count: number }> {
  const count = async (role: 'faculty' | 'student') => {
    const { count: total, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', role)
      .eq('admin_id', chairId);
    if (error) throw new Error(`Unable to count a Program Chair's people: ${error.message}`);
    return total ?? 0;
  };
  const [instructor_count, student_count] = await Promise.all([count('faculty'), count('student')]);
  return { instructor_count, student_count };
}

export async function listProgramChairs(supabase: Supabase, deanId: string) {
  const { data, error } = await programChairsOf(supabase, deanId, PROGRAM_CHAIR_COLUMNS).order('name');
  if (error) throw new Error(`Unable to read Program Chairs: ${error.message}`);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return Promise.all(rows.map(async (row) => ({ ...row, ...(await peopleOf(supabase, row.id as string)) })));
}

/** This Dean's Program Chair with that id, or null when they have none. */
export async function findProgramChair(
  supabase: Supabase,
  deanId: string,
  id: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const { data } = await programChairsOf(supabase, deanId, 'id, email, name').eq('id', id).maybeSingle();
  return data as unknown as { id: string; email: string; name: string } | null;
}

/**
 * Whether this account still owns any records. Owner columns are `on delete
 * set null`, and a row with no owner reads as a shared preset (see
 * ownedOrSharedFilter), so deleting them would hand their records to everyone.
 */
export async function ownsRecords(supabase: Supabase, ownerId: string): Promise<boolean> {
  const found = await Promise.all(
    OWNED_TABLES.map(async (table) => {
      const { data, error } = await supabase.from(table).select('id').eq('admin_id', ownerId).limit(1);
      // A table a later migration adds (ward_fixtures, 062) may not exist yet.
      if (error && !isMissingColumn(error) && !isMissingMigration(error)) {
        throw new Error(`Unable to read the owner of ${table}: ${error.message}`);
      }
      return (data ?? []).length > 0;
    }),
  );
  return found.some(Boolean);
}
