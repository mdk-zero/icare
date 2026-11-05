import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { adminTitleOf } from '@/app/lib/auth/user';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { hasAiConsent } from '@/app/lib/ai-consent';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { callAnalytics, resolveSummaryArgs } from '@/app/lib/analytics';
import { courseArgs, courseFigures, loadCourseScope } from '@/app/lib/analytics-course';
import {
  buildNarrativePrompt,
  type DeanNarrativeContext,
  type WarehouseSummary,
} from '@/app/lib/analytics-narrative';
import { summariseCohort } from '@/app/lib/bkt';
import { loadCoursePerformance } from '@/app/lib/course-performance';
import { loadRoomsWithCounts } from '@/app/lib/patient-rooms';
import { roleLabel } from '@/app/lib/role-labels';
import { analyticsStudentIds, loadSkillMastery } from '@/app/lib/skill-mastery';

/**
 * Plain-language reading of the analytics dashboard.
 *
 * The filters arrive as query params, but the figures do not: this route
 * re-runs dw_analytics_summary itself with the same arguments the dashboard
 * used, so the narrative can only describe numbers the caller is actually
 * allowed to see, and can't be steered by a doctored request body.
 */

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];
}

function logAndSkip(what: string) {
  return (err: unknown) => {
    console.error(`Failed to read ${what} for the narrative`, err);
    return null;
  };
}

/** What a Dean or Program Chair's page shows beyond the warehouse, from the reads that page uses. */
async function deanContext(session: { uid: string; role: string }, params: URLSearchParams): Promise<DeanNarrativeContext> {
  const supabase = getSupabaseAdmin();
  const [title, rooms, courses] = await Promise.all([
    adminTitleOf(supabase, session.uid),
    loadRoomsWithCounts(supabase, session).catch(logAndSkip('rooms')),
    loadCoursePerformance(supabase, session, params).catch(logAndSkip('course grades')),
  ]);
  return { viewer: roleLabel('admin', title), rooms, courses };
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const resolved = await resolveSummaryArgs(request.nextUrl.searchParams, session, supabase);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 500 });
    }
    const course = await loadCourseScope(supabase, session, request.nextUrl.searchParams);
    if (course === 'not_found') return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    const args = course ? courseArgs(resolved, course) : resolved;

    const { data, error } = await callAnalytics(supabase, 'dw_analytics_summary', { ...args });
    if (error) {
      console.error('Failed to fetch analytics for narrative', error);
      return NextResponse.json({ error: 'Unable to read analytics' }, { status: 500 });
    }

    let summary = (data ?? {}) as WarehouseSummary;
    if (course) summary = { ...summary, ...(await courseFigures(supabase, course, args)).figures };

    // Nothing in scope: an AI call would only produce a paraphrase of "no
    // data", so answer directly instead of spending a request on it.
    if ((summary.cohort?.total_students ?? 0) === 0) {
      return NextResponse.json({
        narrative: {
          headline: 'No students in scope for this filter.',
          overview:
            'The selected sections have no students assigned, so there is nothing to analyse. Assign students to a section, or widen the section filter, and the summary will fill in.',
          highlights: [],
          watchouts: ['No students match the current section filter.'],
          actions: ['Check that students have been assigned to your sections.'],
        },
        generated_at: new Date().toISOString(),
      });
    }

    const studentIds = await analyticsStudentIds(supabase, resolved, course).catch(logAndSkip('the students in scope'));

    // The totals of one student are that student's record, so they go by the
    // student's own yes (092), and only to Claude. Not knowing counts as no.
    const oneStudent = summary.cohort?.total_students === 1 || studentIds?.length === 1;
    if (oneStudent && !(studentIds?.length === 1 && (await hasAiConsent(supabase, studentIds[0])))) {
      return NextResponse.json(
        { error: "This selection covers one student, who hasn't turned on AI features in the app, so an AI summary isn't available." },
        { status: 409 },
      );
    }

    // The reading stands without any of these, so a failure doesn't cost the summary.
    const [mastery, dean] = await Promise.all([
      studentIds
        ? loadSkillMastery(supabase, studentIds)
            .then((byStudent) => summariseCohort(byStudent, studentIds.length))
            .catch(logAndSkip('skill mastery'))
        : null,
      session.role === 'admin' ? deanContext(session, request.nextUrl.searchParams) : null,
    ]);

    const generated = await callAI(buildNarrativePrompt(summary, args, course, mastery, dean), { studentData: oneStudent });

    return NextResponse.json({
      narrative: {
        headline: typeof generated.headline === 'string' ? generated.headline : '',
        overview:
          typeof generated.overview === 'string' ? generated.overview : 'No summary available.',
        highlights: pickStringArray(generated.highlights),
        watchouts: pickStringArray(generated.watchouts),
        actions: pickStringArray(generated.actions),
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Generate analytics narrative failed', err);
    const { error, status } = aiErrorResponse(err, 'summary');
    return NextResponse.json({ error }, { status });
  }
}
