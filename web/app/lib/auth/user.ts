import { getSupabaseAdmin, type DbUser, type UserRole, type UserSex } from '../supabase/server';
import { isMissingColumn } from './live-user';
import { isMissingMigration } from './super-admin';
import { parseAdminTitle, type AdminTitle } from '../role-labels';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** 'program_chair' for a Program Chair (080); null for a Dean and every other role. */
  admin_title: AdminTitle | null;
  picture_url: string | null;
  /** Null when unrecorded; the mobile greeting drops the honorific then. */
  sex: UserSex | null;
  has_password: boolean;
  /** Whether a Google account is connected; the Google id itself stays server-side. */
  google_linked: boolean;
  force_password_change: boolean;
}

/**
 * The columns every account lookup needs. Kept as one constant so a field
 * added to PublicUser cannot reach some auth paths and miss others — `sex`
 * arriving in 032 would otherwise have had to be remembered in four places.
 */
const USER_SELECT_BEFORE_080 =
  'id, email, name, role, picture_url, sex, password_hash, google_sub, force_password_change';
const USER_SELECT = `${USER_SELECT_BEFORE_080}, admin_title`;

/** A users row as USER_SELECT reads it; admin_title is missing before 080. */
type UserRow = Pick<
  DbUser,
  | 'id'
  | 'email'
  | 'name'
  | 'role'
  | 'admin_title'
  | 'picture_url'
  | 'sex'
  | 'password_hash'
  | 'google_sub'
  | 'force_password_change'
>;

/**
 * A query's response with its rows typed as UserRow. The column list is
 * chosen at run time, too late for the Supabase client to type it.
 */
type UserResponse<R> = R extends { data: infer D } ? Omit<R, 'data'> & { data: D extends null ? null : UserRow } : never;

/**
 * Runs an account read with USER_SELECT. Before migration 080, admin_title
 * doesn't exist (42703) and the read runs again without it, so signing in
 * never waits on 080; a Program Chair then reads as a Dean. A write that
 * returns these columns fails whole on that error, so running it again is
 * safe too.
 */
export async function withUserColumns<R extends { error: { code?: string } | null }>(
  run: (columns: string) => PromiseLike<R>,
): Promise<UserResponse<R>> {
  const first = await run(USER_SELECT);
  const result = first.error?.code === '42703' ? await run(USER_SELECT_BEFORE_080) : first;
  return result as unknown as UserResponse<R>;
}

/**
 * Normalizes a `sex` value arriving from a form field or a CSV cell.
 *
 * Optional everywhere it is collected, so absent means "don't touch it" and
 * an explicit empty value means "leave it unrecorded" — neither is an error.
 * The single-letter forms are what a roster spreadsheet usually holds.
 */
export function parseSex(value: unknown): { sex?: UserSex | null; error?: string } {
  if (value === undefined) return {};
  if (value === null) return { sex: null };
  if (typeof value !== 'string') return { error: 'Sex must be male or female' };
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return { sex: null };
  if (normalized === 'male' || normalized === 'm') return { sex: 'male' };
  if (normalized === 'female' || normalized === 'f') return { sex: 'female' };
  return { error: 'Sex must be male or female' };
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    admin_title: row.role === 'admin' ? parseAdminTitle(row.admin_title) : null,
    picture_url: row.picture_url,
    sex: row.sex ?? null,
    has_password: Boolean(row.password_hash),
    google_linked: Boolean(row.google_sub),
    force_password_change: row.force_password_change,
  };
}

/**
 * A Dean-level account's title (080): 'program_chair', or null for a Dean,
 * any other role, or before 080 adds the column.
 */
export async function adminTitleOf(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<AdminTitle | null> {
  const { data, error } = await supabase.from('users').select('role, admin_title').eq('id', userId).maybeSingle();
  if (error) {
    if (!isMissingColumn(error)) console.error('Failed to read the title of', userId, error);
    return null;
  }
  return data?.role === 'admin' ? parseAdminTitle(data.admin_title) : null;
}

/**
 * The name of the user's section, or null. Mobile's profile shows it, so
 * sign-in returns it as the session check does; without it the profile read
 * "No section assigned" until the app's next start.
 */
export async function sectionNameOf(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select('sections!section_id(name)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.sections as unknown as { name?: string } | null)?.name ?? null;
}

export async function findUserByEmail(email: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await withUserColumns((columns) =>
    supabase.from('users').select(columns).eq('email', email).maybeSingle(),
  );
  if (error) throw error;
  return data;
}

export async function findUserByGoogleSub(sub: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await withUserColumns((columns) =>
    supabase.from('users').select(columns).eq('google_sub', sub).maybeSingle(),
  );
  if (error) throw error;
  return data;
}

export async function upsertGoogleUser(profile: {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await withUserColumns((columns) =>
    supabase
      .from('users')
      .upsert(
        {
          google_sub: profile.sub,
          email: profile.email,
          name: profile.name,
          picture_url: profile.picture,
          last_login_at: new Date().toISOString(),
        },
        { onConflict: 'google_sub' },
      )
      .select(columns)
      .single(),
  );
  if (error) throw error;
  return data;
}

export async function createGoogleUser(
  profile: {
    sub: string;
    email: string;
    name: string;
    picture: string | null;
  },
  role: UserRole,
  /** Google tells us nothing about this, so it is asked for alongside the role. */
  sex: UserSex | null = null,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await withUserColumns((columns) =>
    supabase
      .from('users')
      .insert({
        google_sub: profile.sub,
        email: profile.email,
        name: profile.name,
        picture_url: profile.picture,
        role,
        sex,
        last_login_at: new Date().toISOString(),
      })
      .select(columns)
      .single(),
  );
  if (error) throw error;
  return data;
}

export async function touchLastLogin(userId: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
}

/**
 * Clears whatever only other roles may hold, after an account's role is set
 * and audited. Call it whenever a role was part of the update. The update
 * itself revokes existing sessions when the role changed (updateUser).
 *
 * An ex-faculty member loses their sections, legacy student links and groups.
 * An ex-admin's faculty stop pointing at them; the 053 trigger would otherwise
 * refuse any later edit to those faculty rows. A non-student leaves their
 * section, group and faculty links. This depends only on the new role, so
 * running it again repairs a change that failed halfway.
 */
export async function applyRoleChange(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  role: string,
): Promise<void> {
  const cleanups = [];
  if (role !== 'faculty') {
    cleanups.push(
      supabase.from('faculty_sections').delete().eq('faculty_id', userId),
      supabase.from('faculty_students').delete().eq('faculty_id', userId),
      supabase.from('teams').update({ faculty_id: null }).eq('faculty_id', userId),
    );
  }
  if (role !== 'admin') {
    cleanups.push(supabase.from('users').update({ admin_id: null }).eq('admin_id', userId));
  }
  if (role !== 'student') {
    cleanups.push(
      supabase.from('users').update({ section_id: null }).eq('id', userId),
      supabase.from('team_members').delete().eq('student_id', userId),
      supabase.from('faculty_students').delete().eq('student_id', userId),
    );
  }
  const results = await Promise.all(cleanups);
  // A table or column a later migration adds (teams 048/051, admin_id 053)
  // may not exist yet; then there is nothing of that kind to clear.
  const failed = results.find((r) => r.error && !isMissingColumn(r.error) && !isMissingMigration(r.error));
  if (failed?.error) throw failed.error;
}

/**
 * applyRoleChange for routes, run after the role change is committed and
 * audited: a failed cleanup must not report the change itself as failed.
 * Returns a warning to pass on instead. Saving the role again repeats the
 * cleanup.
 */
export async function applyRoleChangeReporting(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  role: string,
): Promise<string | undefined> {
  try {
    await applyRoleChange(supabase, userId, role);
    return undefined;
  } catch (err) {
    console.error('Role cleanup failed for user', userId, err);
    return 'The role was changed, but clearing links left over from the old role failed. Save the role again to retry.';
  }
}
