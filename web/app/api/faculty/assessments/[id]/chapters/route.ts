import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { listSkills } from '@/app/lib/taylor-skills';
import { activityOfferings } from '@/app/lib/activity-course';
import { loadCourseSkillIds } from '@/app/lib/courses';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export interface QuizChapter {
  /** The chapter's competency area id, what a criterion stores. */
  id: string;
  chapter: number;
  /** "Vital Signs" */
  name: string;
  skills: { id: string; title: string }[];
}

/**
 * GET → { chapters, course }
 * The Taylor's chapters a quiz's scoring criteria can be, with the skills
 * under each: only the chapters and skills on the skill list of the course
 * the quiz is for. A quiz for no course, or a course with no skills picked
 * yet, gets every chapter (course is then null).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const [catalog, offerings] = await Promise.all([listSkills(supabase), activityOfferings(supabase, 'assessments', [id])]);

    let course: { code: string; title: string } | null = null;
    let allowed: Set<string> | null = null;
    const offeringId = offerings.get(id) ?? null;
    if (offeringId) {
      const { data } = await supabase
        .from('course_offerings')
        .select('course_id, courses(code, title)')
        .eq('id', offeringId)
        .maybeSingle();
      if (data?.course_id) {
        const skills = (await loadCourseSkillIds(supabase, [data.course_id as string])).get(data.course_id as string) ?? [];
        if (skills.length > 0) {
          allowed = new Set(skills);
          course = data.courses as unknown as { code: string; title: string };
        }
      }
    }

    const byChapter = new Map<string, QuizChapter>();
    for (const s of catalog) {
      if (allowed && !allowed.has(s.id)) continue;
      const chapter = byChapter.get(s.chapterId) ?? { id: s.chapterId, chapter: s.chapter, name: s.area, skills: [] };
      chapter.skills.push({ id: s.id, title: s.title });
      byChapter.set(s.chapterId, chapter);
    }
    const chapters = [...byChapter.values()].sort((a, b) => a.chapter - b.chapter);
    return NextResponse.json({ chapters, course });
  } catch (err) {
    console.error('Failed to load quiz chapters', err);
    return NextResponse.json({ error: 'Unable to load chapters' }, { status: 500 });
  }
}
