import type { SummaryArgs } from './analytics';
import type { CourseScope } from './analytics-course';
import { MASTERY_THRESHOLD, type CohortMastery } from './bkt';
import { TARGET_SCORE } from './performance-target';
import { WORK_KINDS, type WorkKind } from './work-kinds';

/** How many of the weakest skills the summary is told about. */
const WEAKEST_SKILLS = 5;

export interface WarehouseSummary {
  sections?: { id: string; name: string; students: number; active_students?: number }[];
  cohort?: {
    total_students?: number;
    submitted_attempts?: number;
    /** 085 on: graded work of every kind, with a split per kind. */
    graded?: number;
    average_score?: number | null;
    active_students_30d?: number;
    by_kind?: Partial<Record<WorkKind, { average_score: number; graded: number; students: number }>>;
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

/**
 * What a Dean's page shows beyond the warehouse's figures, so their summary
 * covers what they are reading. Null where it couldn't be read. Totals only:
 * no instructor's name goes in, nor a grade that is one student's alone,
 * because the summary may reach any provider in the AI chain.
 */
export interface DeanNarrativeContext {
  /** "Dean" or "Program Chair". */
  viewer: string;
  rooms: { status: string; capacity: number; patients_assigned: number }[] | null;
  courses:
    | {
        course: { code: string; title: string };
        term: { name: string };
        students: number;
        graded: number;
        average: number | null;
      }[]
    | null;
}

const BUCKET_NOUN: Record<SummaryArgs['p_bucket'], string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

/** The same sums the page's Room Utilization card and Active Rooms tile make. */
function roomBlock(rooms: DeanNarrativeContext['rooms']): string {
  if (!rooms) return '(could not be read for this summary)';
  if (rooms.length === 0) return '(no rooms configured)';
  const active = rooms.filter((r) => r.status === 'active').length;
  const beds = rooms.reduce((n, r) => n + r.capacity, 0);
  const occupied = rooms.reduce((n, r) => n + r.patients_assigned, 0);
  return `- ${active} of ${rooms.length} rooms active
- ${occupied} of ${beds} beds occupied by patients (${beds > 0 ? Math.round((100 * occupied) / beds) : 0}%)`;
}

function courseBlock(courses: DeanNarrativeContext['courses']): string {
  if (!courses) return '(could not be read for this summary)';
  if (courses.length === 0) return '(no course assignments with students in this period)';
  return courses
    .map(({ course, term, students, graded, average }) => {
      const name = `- ${course.code} ${course.title} (${term.name})`;
      const roster = `${students} ${students === 1 ? 'student' : 'students'}`;
      if (graded === 0 || average === null) return `${name}: ${roster}, none graded yet`;
      // One student's grade is that student's record, not a class figure.
      if (graded === 1) return `${name}: ${roster}, too few graded to report an average`;
      return `${name}: class average ${average}%, ${graded} of ${students} students graded`;
    })
    .join('\n');
}

export function buildNarrativePrompt(
  summary: WarehouseSummary,
  args: SummaryArgs,
  course: CourseScope | null,
  mastery: CohortMastery | null,
  dean: DeanNarrativeContext | null = null,
): string {
  const cohort = summary.cohort ?? {};
  const trend = summary.weekly_trend ?? [];
  const competencies = summary.competency_detail ?? [];
  const activity = summary.clinical_activity ?? {};
  const risk = summary.risk_distribution ?? {};

  const sectionNames = (summary.sections ?? []).map((s) =>
    dean ? `${s.name} (${s.students} students, ${s.active_students ?? 0} active)` : `${s.name} (${s.students} students)`,
  );
  const scope = sectionNames.length > 0 ? sectionNames.join(', ') : 'all sections';
  const period =
    args.p_from && args.p_to ? `${args.p_from} to ${args.p_to}` : 'the full available history';

  // From 085 every kind of graded work counts; before it, quizzes only.
  const allWork = cohort.graded !== undefined;
  const unit = allWork ? 'graded pieces of work' : 'attempts';

  const bucket = BUCKET_NOUN[args.p_bucket];
  const trendBlock =
    trend.length > 0
      ? trend.map((t) => `- ${t.week_start} (${bucket}): ${t.average_score}% over ${t.attempts} ${unit}`).join('\n')
      : allWork
        ? '(nothing graded in this period)'
        : '(no submitted attempts in this period)';

  const kindBlock = WORK_KINDS.map(({ kind, label }) => {
    const k = cohort.by_kind?.[kind];
    return k
      ? `- ${label}: avg ${k.average_score}%, ${k.graded} graded across ${k.students} students`
      : `- ${label}: nothing graded in this period`;
  }).join('\n');

  const cohortBlock = allWork
    ? `- Students in scope: ${cohort.total_students ?? 0}
- Students active (handed in at least one piece of work in the period): ${cohort.active_students_30d ?? 0}
- Graded pieces of work (patient cases, quizzes, case presentations and return demonstrations): ${cohort.graded ?? 0}
- Average grade across all of them: ${cohort.average_score ?? 'nothing graded'}

Average grade by kind of work:
${kindBlock}`
    : `- Students in scope: ${cohort.total_students ?? 0}
- Students active (submitted at least one attempt in the period): ${cohort.active_students_30d ?? 0}
- Submitted quiz attempts: ${cohort.submitted_attempts ?? 0}
- Average quiz score: ${cohort.average_score ?? 'no submitted attempts'}`;

  const competencyBlock =
    competencies.length > 0
      ? competencies
          .map(
            (c) =>
              `- ${c.name}: avg ${c.average_score}%, ${c.pass_rate_pct}% at or above the 75% pass mark, ${c.ratings} ratings across ${c.students} students`,
          )
          .join('\n')
      : '(no faculty-validated skill area scores in this period)';

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
      ? `${atRisk} students classified low performing, ${safe} on track (latest ML prediction per student).`
      : '(the ML prediction service has not produced any predictions for these students yet)';

  const masteryBlock =
    mastery && mastery.skills.length > 0
      ? `${mastery.students_traced} of ${mastery.total_students} students traced across ${mastery.answers} results (quiz answers, and skills rated on finished Patient Cases and Return Demonstrations). Weakest skills:\n` +
        mastery.skills
          .slice(0, WEAKEST_SKILLS)
          .map(
            (s) =>
              `- Skill ${s.skill_id} ${s.title}: average ${Math.round(s.average_mastery * 100)}%, ${s.mastered} of ${s.students} students mastered`,
          )
          .join('\n') +
        (mastery.skills.every((s) => s.source === 'default')
          ? '\nThese skills are still on starting parameters, so treat the percentages as rough estimates.'
          : '')
      : '(no results on a skill yet)';

  // A Dean's page has no skill area chart or clinical activity panel, so their
  // summary sticks to what they can see, and adds the panels only they have.
  const figureBlocks = dean
    ? `Low-performance prediction (call these students "low performing", never "at risk"):
${riskBlock}

Skill mastery estimated by Bayesian Knowledge Tracing, from each student's whole record of quizzes, Patient Cases and Return Demonstrations rather than this period (${Math.round(MASTERY_THRESHOLD * 100)}% counts as mastered):
${masteryBlock}

Class average grade per course assignment, so far across each course's whole semester, against a ${TARGET_SCORE}% target. Two rows of one course are two instructors' classes:
${courseBlock(dean.courses)}

Room use, live and not limited to this period or course:
${roomBlock(dean.rooms)}`
    : `Faculty-validated skill area scores:
${competencyBlock}

Clinical training activity:
${activityBlock}

Low-performance prediction (call these students "low performing", never "at risk"):
${riskBlock}

Skill mastery estimated by Bayesian Knowledge Tracing, from each student's whole record of quizzes, Patient Cases and Return Demonstrations rather than this period (${Math.round(MASTERY_THRESHOLD * 100)}% counts as mastered):
${masteryBlock}`;

  const courseNote = course
    ? `Course: ${course.offering.course.code} ${course.offering.course.title}, ${course.offering.term.name}. ${
        dean
          ? "The totals and trend count only this course's own work. The low-performance prediction and skill mastery are each student's overall record, not this course alone."
          : "The totals, trend and skill area scores count only this course's own work. The clinical training activity and the low-performance prediction are each student's overall record, not this course alone."
      }\n`
    : '';

  const deanGuidelines = dean
    ? `
- This reader may not know how the dashboard's figures are worked out. Use its own names (Active Students, Low Performing Students, Performance per Course, Performance by Activity, Skill Mastery, Section Engagement, Room Utilization) so they can find each figure, and say in a few words what a figure means the first time it matters.
- You are given no instructor's or student's name. Never guess who teaches a course or who a figure is about.`
    : '';

  return `You are a nursing education analyst briefing ${
    dean ? `the ${dean.viewer} of a nursing program on their program-wide` : 'a faculty member on their cohort'
  } dashboard. Describe only the data below. Never invent a number, a student, or a trend that is not present.

Scope: ${scope}
Period: ${period}
${courseNote}
Cohort totals for the period:
${cohortBlock}

${allWork ? 'Grade' : 'Score'} trend, one point per ${bucket}:
${trendBlock}

${figureBlocks}

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
- "watchouts" (2-3) are what needs attention; "actions" (2-3) are concrete steps this ${
    dean
      ? `${dean.viewer} can take next. They oversee instructors, sections and courses rather than grading students themselves, so suggest what to follow up on or ask of their instructors.`
      : 'faculty member can take next.'
  }
- If a section of the data is empty, say so plainly rather than speculating — and treat sparse data as a data-collection problem worth flagging, not as poor student performance.
- Describe the trend only if there are at least two points; otherwise say the period is too short to show a trend.
- Plain, professional language for an educator audience. No medical advice about real patients.${deanGuidelines}`;
}
