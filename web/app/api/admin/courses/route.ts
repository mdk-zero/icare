import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  badRequest,
  courseFailure,
  loadCourseSkillIds,
  loadOfferingRosters,
  loadOfferingSections,
  must,
  parseCourse,
  readJson,
  requireRole,
} from '@/app/lib/courses';

/**
 * GET: everything the Dean's Courses page shows, in one call — their terms,
 * their courses with skills, and every assignment of those courses with its
 * instructor, sections and student count.
 * POST { code, title, description? }: add a course.
 */
export async function GET() {
  const { session, response } = await requireRole('admin');
  if (response) return response;

  try {
    const supabase = getSupabaseAdmin();
    const [terms, courses] = await Promise.all([
      supabase
        .from('academic_terms')
        .select('id, name, starts_on, ends_on')
        .eq('admin_id', session.uid)
        .order('starts_on', { ascending: false })
        .then(must),
      supabase
        .from('courses')
        .select('id, code, title, description')
        .eq('admin_id', session.uid)
        .order('code')
        .then(must),
    ]);

    const courseIds = (courses ?? []).map((c) => c.id as string);
    const offerings = courseIds.length
      ? ((must(
          await supabase
            .from('course_offerings')
            .select('id, course_id, term_id, faculty_id, created_at')
            .in('course_id', courseIds)
            .order('created_at'),
        ) ?? []) as { id: string; course_id: string; term_id: string; faculty_id: string | null }[])
      : [];
    const offeringIds = offerings.map((o) => o.id);

    const [sectionsByOffering, skillsByCourse, requirementRows] = await Promise.all([
      loadOfferingSections(supabase, offeringIds),
      loadCourseSkillIds(supabase, courseIds),
      offeringIds.length
        ? supabase.from('course_requirements').select('offering_id').in('offering_id', offeringIds).then(must)
        : Promise.resolve([] as { offering_id: string }[]),
    ]);

    const facultyIds = [...new Set(offerings.map((o) => o.faculty_id).filter((id): id is string => !!id))];
    const sectionIds = [...new Set([...sectionsByOffering.values()].flat())];
    const [facultyRows, sectionRows, rosters] = await Promise.all([
      facultyIds.length
        ? supabase.from('users').select('id, name').in('id', facultyIds).then(must)
        : Promise.resolve([] as { id: string; name: string }[]),
      sectionIds.length
        ? supabase.from('sections').select('id, name').in('id', sectionIds).then(must)
        : Promise.resolve([] as { id: string; name: string }[]),
      loadOfferingRosters(
        supabase,
        offerings.map((o) => ({ id: o.id, faculty_id: o.faculty_id, section_ids: sectionsByOffering.get(o.id) ?? [] })),
      ),
    ]);

    const facultyName = new Map((facultyRows ?? []).map((f) => [f.id as string, f.name as string]));
    const sectionName = new Map((sectionRows ?? []).map((s) => [s.id as string, s.name as string]));
    const requirementCount = new Map<string, number>();
    for (const r of (requirementRows ?? []) as { offering_id: string }[]) {
      requirementCount.set(r.offering_id, (requirementCount.get(r.offering_id) ?? 0) + 1);
    }
    const countBy = (key: 'course_id' | 'term_id', id: string) => offerings.filter((o) => o[key] === id).length;

    return NextResponse.json({
      terms: (terms ?? []).map((t) => ({ ...t, offering_count: countBy('term_id', t.id as string) })),
      courses: (courses ?? []).map((c) => ({
        ...c,
        skill_ids: skillsByCourse.get(c.id as string) ?? [],
        offering_count: countBy('course_id', c.id as string),
      })),
      offerings: offerings.map((o) => {
        const roster = rosters.get(o.id);
        const without = new Set(roster?.sectionsWithoutGroup ?? []);
        return {
          id: o.id,
          course_id: o.course_id,
          term_id: o.term_id,
          faculty_id: o.faculty_id,
          faculty_name: o.faculty_id ? (facultyName.get(o.faculty_id) ?? null) : null,
          sections: (sectionsByOffering.get(o.id) ?? [])
            .map((id) => ({ id, name: sectionName.get(id) ?? 'Section', has_group: !without.has(id) }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
          student_count: roster?.students.length ?? 0,
          requirement_count: requirementCount.get(o.id) ?? 0,
        };
      }),
    });
  } catch (err) {
    return courseFailure(err, 'Unable to load courses');
  }
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireRole('admin');
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const parsed = parseCourse(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    const supabase = getSupabaseAdmin();
    const { data: course, error } = await supabase
      .from('courses')
      .insert({ ...parsed.value, admin_id: session.uid })
      .select('id, code, title, description')
      .single();
    if (error?.code === '23505') {
      return NextResponse.json({ error: `You already have a course with code ${parsed.value.code}` }, { status: 409 });
    }
    if (error) throw error;

    await logAudit(
      session,
      { action: 'course.create', entityType: 'courses', entityId: course.id, details: { code: course.code, title: course.title } },
      request,
    );
    return NextResponse.json({ course: { ...course, skill_ids: [], offering_count: 0 } }, { status: 201 });
  } catch (err) {
    return courseFailure(err, 'Unable to create course');
  }
}
