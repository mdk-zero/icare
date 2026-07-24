import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { resolveSummaryArgs, type SummaryArgs } from '@/app/lib/analytics';

/**
 * Plain-language reading of the analytics dashboard.
 *
 * The filters arrive as query params, but the figures do not: this route
 * re-runs dw_analytics_summary itself with the same arguments the dashboard
 * used, so the narrative can only describe numbers the caller is actually
 * allowed to see, and can't be steered by a doctored request body.
 */

interface WarehouseSummary {
  sections?: { id: string; name: string; students: number }[];
  cohort?: {
    total_students?: number;
    submitted_attempts?: number;
    average_score?: number | null;
    active_students_30d?: number;
  };
  weekly_trend?: { week_start: string; average_score: number; attempts: number }[];
  competency_detail?: {
    name: string;
    ratings: number;
    students: number;
    average_score: number;
    pass_rate_pct: number;
  }[];
  clinical_activity?: Record<string, number>;
  risk_distribution?: Record<string, number>;
}

const BUCKET_NOUN: Record<SummaryArgs['p_bucket'], string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

function buildPrompt(summary: WarehouseSummary, args: SummaryArgs): string {
  const cohort = summary.cohort ?? {};
  const trend = summary.weekly_trend ?? [];
  const competencies = summary.competency_detail ?? [];
  const activity = summary.clinical_activity ?? {};
  const risk = summary.risk_distribution ?? {};

  const sectionNames = (summary.sections ?? []).map((s) => `${s.name} (${s.students} students)`);
  const scope = sectionNames.length > 0 ? sectionNames.join(', ') : 'all sections';
  const period =
    args.p_from && args.p_to ? `${args.p_from} to ${args.p_to}` : 'the full available history';

  const bucket = BUCKET_NOUN[args.p_bucket];
  const trendBlock =
    trend.length > 0
      ? trend.map((t) => `- ${t.week_start} (${bucket}): ${t.average_score}% over ${t.attempts} attempts`).join('\n')
      : '(no submitted attempts in this period)';

  const competencyBlock =
    competencies.length > 0
      ? competencies
          .map(
            (c) =>
              `- ${c.name}: avg ${c.average_score}%, ${c.pass_rate_pct}% at or above the 75% pass mark, ${c.ratings} ratings across ${c.students} students`,
          )
          .join('\n')
      : '(no faculty-validated competency scores in this period)';

  const activityBlock =
    Object.keys(activity).length > 0
      ? Object.entries(activity)
          .map(([key, value]) => `- ${key.replace(/_/g, ' ')}: ${value}`)
          .join('\n')
      : '(no clinical activity recorded in this period)';

  const atRisk = risk.at_risk ?? 0;
  const safe = risk.safe ?? 0;
  const riskBlock =
    atRisk + safe > 0
      ? `${atRisk} students classified at risk, ${safe} safe (latest ML prediction per student).`
      : '(the ML prediction service has not produced any predictions for these students yet)';

  return `You are a nursing education analyst briefing a faculty member on their cohort dashboard. Describe only the data below. Never invent a number, a student, or a trend that is not present.

Scope: ${scope}
Period: ${period}

Cohort totals for the period:
- Students in scope: ${cohort.total_students ?? 0}
- Students active (submitted at least one attempt in the period): ${cohort.active_students_30d ?? 0}
- Submitted quiz attempts: ${cohort.submitted_attempts ?? 0}
- Average quiz score: ${cohort.average_score ?? 'no submitted attempts'}

Score trend, one point per ${bucket}:
${trendBlock}

Faculty-validated competency scores:
${competencyBlock}

Clinical training activity:
${activityBlock}

At-risk prediction:
${riskBlock}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "headline": "string",
  "overview": "string",
  "highlights": ["string"],
  "watchouts": ["string"],
  "actions": ["string"]
}

Guidelines:
- "headline" is one short sentence (under 15 words) stating the single most important takeaway for this period.
- "overview" is 2-4 sentences covering participation, performance, and direction of travel. Quote the figures you rely on.
- "highlights" (up to 3) are genuinely positive findings. Missing, absent, or zero data is never a highlight — it belongs in "watchouts". If nothing is genuinely going well, return an empty array rather than padding it.
- "watchouts" (2-3) are what needs attention; "actions" (2-3) are concrete steps this faculty member can take next.
- If a section of the data is empty, say so plainly rather than speculating — and treat sparse data as a data-collection problem worth flagging, not as poor student performance.
- Describe the trend only if there are at least two points; otherwise say the period is too short to show a trend.
- Plain, professional language for an educator audience. No medical advice about real patients.`;
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const args = await resolveSummaryArgs(request.nextUrl.searchParams, session, supabase);
    if ('error' in args) {
      return NextResponse.json({ error: args.error }, { status: 500 });
    }

    const { data, error } = await supabase.rpc('dw_analytics_summary', args);
    if (error) {
      console.error('Failed to fetch analytics for narrative', error);
      return NextResponse.json({ error: 'Unable to read analytics' }, { status: 500 });
    }

    const summary = (data ?? {}) as WarehouseSummary;

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

    const generated = await callAI(buildPrompt(summary, args));

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
