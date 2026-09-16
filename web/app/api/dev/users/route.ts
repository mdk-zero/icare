import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { devErrorResponse, devNotFound, requireDeveloper } from '@/app/lib/dev/guard';

/**
 * The console's user list. Deliberately richer than /api/admin/users — it
 * carries the fields the developer tools act on (password state, section,
 * google_sub) that the Dean's screen has no business showing.
 */
export async function GET(request: NextRequest) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const search = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('users')
      .select(
        'id, email, name, role, sex, picture_url, section_id, google_sub, ' +
          'password_hash, force_password_change, created_at, last_login_at, sections(name)',
      )
      .order('created_at', { ascending: false })
      .limit(100);
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const users = (data ?? []).map((row) => {
      const { password_hash, sections, ...rest } = row as unknown as Record<
        string,
        unknown
      > & {
        password_hash: string | null;
        sections: { name?: string } | null;
      };
      return {
        ...rest,
        has_password: Boolean(password_hash),
        section_name: sections?.name ?? null,
      };
    });
    return NextResponse.json({ users });
  } catch (err) {
    return devErrorResponse(err);
  }
}
