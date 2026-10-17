import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { termStatus } from '@/app/lib/course-progress';
import {
  badRequest,
  courseFailure,
  loadOfferingRosters,
  loadOwnOffering,
  must,
  notFound,
  readJson,
  requireRole,
  setAddedStudent,
} from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Letters, digits and the few marks a name or email has; PostgREST's `or` filter can't carry the rest. */
const cleanQuery = (q: string) => q.replace(/[^\p{L}\p{N}@._' -]/gu, ' ').trim().slice(0, 60);

/**
 * GET ?q= → { students: [{ id, name, email, section, on_roster }] }
 * Students the instructor could add to this course by name or email, for the
 * Add student search. Shows whether each is already on the roster.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;
  const q = cleanQuery(request.nextUrl.searchParams.get('q') ?? '');
  if (q.length < 2) return NextResponse.json({ students: [] });

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');

    const [found, rosters] = await Promise.all([
      supabase
        .from('users')
        .select('id, name, email, sections!section_id(name)')
        .eq('role', 'student')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('name')
        .limit(15)
        .then(must),
      loadOfferingRosters(supabase, [{ id, faculty_id: offering.faculty_id, section_ids: offering.section_ids }]),
    ]);
    const onRoster = new Set((rosters.get(id)?.students ?? []).map((s) => s.id));
    const students = ((found ?? []) as unknown as { id: string; name: string | null; email: string; sections: { name?: string } | null }[]).map(
      (u) => ({
        id: u.id,
        name: u.name ?? 'Student',
        email: u.email,
        section: u.sections?.name ?? null,
        on_roster: onRoster.has(u.id),
      }),
    );
    return NextResponse.json({ students });
  } catch (err) {
    return courseFailure(err, 'Unable to search students');
  }
}

/**
 * POST { student_id }: the instructor puts a student on this course's roster
 * personally, such as an irregular student from another section.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, response } = await requireRole('faculty');
  if (response) return response;
  const { id } = await params;
  const body = await readJson(request);
  const studentId = typeof body?.student_id === 'string' ? body.student_id : '';
  if (!studentId) return badRequest('Choose a student');

  try {
    const supabase = getSupabaseAdmin();
    const offering = await loadOwnOffering(supabase, session.uid, id);
    if (!offering) return notFound('Course');
    if (termStatus(offering.term) === 'ended') return badRequest('This term has ended, so its roster is locked');
    const student = must(
      await supabase.from('users').select('id, name').eq('id', studentId).eq('role', 'student').maybeSingle(),
    ) as { id: string; name: string | null } | null;
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
