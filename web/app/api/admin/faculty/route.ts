import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/** Faculty roster overview: every faculty account with its assigned student ids. */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [facultyRes, rosterRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, name, picture_url, created_at, last_login_at')
        .eq('role', 'faculty')
        .order('name'),
      supabase.from('faculty_students').select('faculty_id, student_id'),
    ]);

    if (facultyRes.error) {
      console.error('Failed to list faculty', facultyRes.error);
      return NextResponse.json({ error: 'Unable to list faculty' }, { status: 500 });
    }

    const rosterByFaculty = new Map<string, string[]>();
    for (const row of rosterRes.data ?? []) {
      const list = rosterByFaculty.get(row.faculty_id) ?? [];
      list.push(row.student_id);
      rosterByFaculty.set(row.faculty_id, list);
    }

    const faculty = (facultyRes.data ?? []).map((f) => ({
      ...f,
      student_ids: rosterByFaculty.get(f.id) ?? [],
    }));

    return NextResponse.json({ faculty });
  } catch (err) {
    console.error('List faculty failed', err);
    return NextResponse.json({ error: 'Unable to list faculty' }, { status: 500 });
  }
}
