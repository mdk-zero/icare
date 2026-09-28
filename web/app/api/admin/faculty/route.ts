import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getAdminScope } from '@/app/lib/admin-scope';
import { compareTeamNames, isMissingTeamTables, loadTeams, manageableSectionIds } from '@/app/lib/teams';

/**
 * Faculty overview: the admin's own faculty, each with the groups they
 * supervise, those groups' sections, and the students in them; plus every
 * group in the admin's sections, for the assignment picker.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const scope = await getAdminScope(supabase, session.uid);
    if (scope && scope.facultyIds.length === 0) return NextResponse.json({ faculty: [], groups: [] });

    let facultyQuery = supabase
      .from('users')
      .select('id, email, name, picture_url, sex, created_at, last_login_at')
      .eq('role', 'faculty')
      .order('name');
    // Each admin has their own faculty (migration 053).
    if (scope) facultyQuery = facultyQuery.in('id', scope.facultyIds);

    const sectionIds = await manageableSectionIds(supabase, session.role, session.uid);
    const [facultyRes, sectionsRes, loaded] = await Promise.all([
      facultyQuery,
      sectionIds.length
        ? supabase.from('sections').select('id, name').in('id', sectionIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      loadTeams(supabase, sectionIds),
    ]);

    if (facultyRes.error) {
      console.error('Failed to list instructors', facultyRes.error);
      return NextResponse.json({ error: 'Unable to list instructor' }, { status: 500 });
    }

    if (loaded.error && !isMissingTeamTables(loaded.error)) {
      console.error('Failed to load groups', loaded.error);
      return NextResponse.json({ error: 'Unable to list instructor' }, { status: 500 });
    }

    const sectionName = new Map((sectionsRes.data ?? []).map((s) => [s.id as string, s.name as string]));
    const groups = loaded.teams
      .map((t) => ({
        id: t.id,
        name: t.name,
        section_id: t.section_id,
        section_name: sectionName.get(t.section_id) ?? '',
        faculty_id: t.faculty_id,
        faculty_name: t.faculty_name,
        member_count: t.members.length,
      }))
      .sort(
        (a, b) =>
          a.section_name.localeCompare(b.section_name, undefined, { numeric: true }) ||
          compareTeamNames(a.name, b.name),
      );

    // An instructor sees only the members of the groups they supervise, so
    // that is what their student count is.
    const faculty = (facultyRes.data ?? []).map((f) => {
      const own = groups.filter((g) => g.faculty_id === f.id);
      const sections = [...new Map(own.map((g) => [g.section_id, { id: g.section_id, name: g.section_name }])).values()];
      return {
        ...f,
        groups: own,
        sections,
        student_count: own.reduce((sum, g) => sum + g.member_count, 0),
      };
    });

    return NextResponse.json({ faculty, groups });
  } catch (err) {
    console.error('List instructors failed', err);
    return NextResponse.json({ error: 'Unable to list instructor' }, { status: 500 });
  }
}
