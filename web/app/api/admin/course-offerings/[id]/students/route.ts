import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { termStatus } from '@/app/lib/course-progress';
import { deanOwnershipLive } from '@/app/lib/dean-scope';
import {
  badRequest,
  courseFailure,
  loadDeanOffering,
  loadOfferingRosters,
  must,
  notFound,
  readJson,
  requireRole,
  setAddedStudent,
} from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** Letters, digits and the few marks a name or email has; PostgREST's `or` filter can't carry the rest. */
const cleanQuery = (q: string) => q.replace(/[^\p{L}\p{N}@._' -]/gu, ' ').trim().slice(0, 60);

/** One of the Dean's course assignments with its sections, for its roster. */
async function deanOffering(supabase: Supabase, adminId: string, id: string) {
  const offering = await loadDeanOffering(supabase, adminId, id);
  if (!offering) return null;
  const sections = (must(
    await supabase.from('course_offering_sections').select('section_id').eq('offering_id', id),
  ) ?? []) as { section_id: string }[];
  return { ...offering, section_ids: sections.map((s) => s.section_id) };
}

/**
 * GET → { students: [{ id, name, email, section, group, source }] }: the
 * course assignment's roster, as its instructor sees it (their groups, whole
 * sections where they have none, and students added by hand), for the Dean's
 * Courses page.
 * GET ?q= → { students: [{ id, name, email, section, on_roster }] }: students
 * the Dean could add to it, for the Add student search.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;
  const rawQuery = request.nextUrl.searchParams.get('q');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await deanOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course assignment');
    const rosters = await loadOfferingRosters(supabase, [
      { id, faculty_id: offering.faculty_id, section_ids: offering.section_ids },
    ]);
    const roster = rosters.get(id)?.students ?? [];

    if (rawQuery !== null) {
      const q = cleanQuery(rawQuery);
      if (q.length < 2) return NextResponse.json({ students: [] });
      let search = supabase
        .from('users')
        .select('id, name, email, sections!section_id(name)')
        .eq('role', 'student')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('name')
        .limit(15);
      // Their own students once Dean ownership is live (077).
      if (await deanOwnershipLive(supabase)) search = search.eq('admin_id', session.uid);
      const found = (must(await search) ?? []) as unknown as { id: string; name: string | null; email: string; sections: { name?: string } | null }[];
      const onRoster = new Set(roster.map((s) => s.id));
      return NextResponse.json({
        students: found.map((u) => ({
          id: u.id,
          name: u.name ?? 'Student',
          email: u.email,
          section: u.sections?.name ?? null,
          on_roster: onRoster.has(u.id),
        })),
      });
    }

    const emails = roster.length
      ? ((must(await supabase.from('users').select('id, email').in('id', roster.map((s) => s.id))) ?? []) as {
          id: string;
          email: string;
        }[])
      : [];
    const emailOf = new Map(emails.map((u) => [u.id, u.email]));
    return NextResponse.json({
      students: roster.map((s) => {
        // "BSN 1101 · Group A": the section, then the group.
        const [section, ...group] = s.group_label.split(' · ');
        return {
          id: s.id,
          name: s.name,
          email: emailOf.get(s.id) ?? '',
          section,
          group: group.join(' · ') || 'No group',
          source: s.source,
        };
      }),
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load the course roster');
  }
}

/**
 * POST { student_id }: the Dean puts a student on this course assignment's
 * roster, as its instructor can (an irregular student from another section).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('admin');
  if (response) return response;
  const { id } = await params;
  const body = await readJson(request);
  const studentId = typeof body?.student_id === 'string' ? body.student_id : '';
  if (!studentId) return badRequest('Choose a student');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadDeanOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course assignment');
    if (termStatus(offering.term) === 'ended') return badRequest('This semester has ended, so its roster is locked');
    let lookup = supabase.from('users').select('id, name').eq('id', studentId).eq('role', 'student');
    if (await deanOwnershipLive(supabase)) lookup = lookup.eq('admin_id', session.uid);
    const student = must(await lookup.maybeSingle()) as { id: string; name: string | null } | null;
    if (!student) return notFound('Student');

    await setAddedStudent(supabase, id, student.id, true, session.uid);
    await logAudit(
      session,
      {
        action: 'course.student.add',
        entityType: 'course_offerings',
        entityId: id,
        details: { code: offering.course.code, student_id: student.id, student: student.name },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return courseFailure(err, 'Unable to add the student');
  }
}
