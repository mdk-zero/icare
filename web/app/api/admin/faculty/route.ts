import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/** Faculty overview: every faculty account with its assigned sections and derived student count. */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [facultyRes, linksRes, studentsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, name, picture_url, created_at, last_login_at')
        .eq('role', 'faculty')
        .order('name'),
      supabase.from('faculty_sections').select('faculty_id, sections(id, name)'),
      supabase
        .from('users')
        .select('section_id')
        .eq('role', 'student')
        .not('section_id', 'is', null)
        .limit(5000),
    ]);

    if (facultyRes.error) {
      console.error('Failed to list faculty', facultyRes.error);
      return NextResponse.json({ error: 'Unable to list faculty' }, { status: 500 });
    }

    const studentsPerSection = new Map<string, number>();
    for (const row of studentsRes.data ?? []) {
      if (!row.section_id) continue;
      studentsPerSection.set(row.section_id, (studentsPerSection.get(row.section_id) ?? 0) + 1);
    }

    const sectionsByFaculty = new Map<string, { id: string; name: string }[]>();
    for (const row of linksRes.data ?? []) {
      const section = row.sections as unknown as { id: string; name: string } | null;
      if (!section) continue;
      const list = sectionsByFaculty.get(row.faculty_id) ?? [];
      list.push(section);
      sectionsByFaculty.set(row.faculty_id, list);
    }

    const faculty = (facultyRes.data ?? []).map((f) => {
      const sections = (sectionsByFaculty.get(f.id) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const studentCount = sections.reduce(
        (sum, s) => sum + (studentsPerSection.get(s.id) ?? 0),
        0,
      );
      return { ...f, sections, student_count: studentCount };
    });

    return NextResponse.json({ faculty });
  } catch (err) {
    console.error('List faculty failed', err);
    return NextResponse.json({ error: 'Unable to list faculty' }, { status: 500 });
  }
}
