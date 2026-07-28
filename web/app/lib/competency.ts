import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Competency scoring derived from assessment performance.
 *
 * The pieces were already in place: faculty define weighted `assessment_criteria`
 * against a competency area, `question_competencies` maps each question to its
 * competency, and submitting an attempt writes a per-criterion breakdown to
 * `attempt_criteria_scores`. What was missing is the roll-up — turning those
 * breakdowns into `competency_scores` rows so a student's standing per
 * competency emerges from the quizzes they take instead of only from manual
 * faculty entry. `competency_scores` was built for this: it carries an
 * `attempt_id` and a `source` enum whose 'assessment' value went unused.
 */

/** Bands shared by the derivation and the UI, so a badge never disagrees with a bar. */
export const COMPETENCY_STRONG_MIN = 80;
export const COMPETENCY_DEVELOPING_MIN = 60;

export type CompetencyLevel = 'strong' | 'developing' | 'needs_improvement';

export function competencyLevel(score: number): CompetencyLevel {
  if (score >= COMPETENCY_STRONG_MIN) return 'strong';
  if (score >= COMPETENCY_DEVELOPING_MIN) return 'developing';
  return 'needs_improvement';
}

export const COMPETENCY_LEVEL_LABEL: Record<CompetencyLevel, string> = {
  strong: 'Doing well',
  developing: 'Developing',
  needs_improvement: 'Needs improvement',
};

export const COMPETENCY_LEVEL_TONE: Record<CompetencyLevel, string> = {
  strong: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  developing: 'bg-amber-100 text-amber-700 border-amber-200',
  needs_improvement: 'bg-rose-100 text-rose-700 border-rose-200',
};

export const COMPETENCY_LEVEL_BAR: Record<CompetencyLevel, string> = {
  strong: 'bg-emerald-500',
  developing: 'bg-amber-500',
  needs_improvement: 'bg-rose-500',
};

/**
 * Roll one submitted attempt's criteria breakdown into `competency_scores`.
 *
 * A criterion is weighted for its contribution to the assessment's overall
 * grade, but a competency score answers "how well does this student do X",
 * so the raw per-criterion percentage is used rather than `weighted_score`.
 * Several criteria can target the same competency, in which case they are
 * averaged by questions answered — a 10-question criterion should count for
 * more than a 2-question one.
 *
 * Idempotent: existing rows for this attempt are left alone, so re-running the
 * backfill (or a retried submit) cannot double-count.
 *
 * Returns the number of competency rows written.
 */
export async function deriveCompetencyScoresForAttempt(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<number> {
  const [{ data: attempt }, { data: breakdown }, { data: existing }] = await Promise.all([
    supabase
      .from('assessment_attempts')
      .select('id, student_id')
      .eq('id', attemptId)
      .maybeSingle(),
    supabase
      .from('attempt_criteria_scores')
      .select('competency_id, criteria_name, score, correct, total')
      .eq('attempt_id', attemptId),
    supabase.from('competency_scores').select('competency_id').eq('attempt_id', attemptId),
  ]);

  if (!attempt?.student_id || !breakdown || breakdown.length === 0) return 0;

  const alreadyDerived = new Set((existing ?? []).map((r) => r.competency_id));

  // Weight each criterion by the questions it actually covered.
  const totals = new Map<string, { weighted: number; questions: number; names: string[] }>();
  for (const row of breakdown) {
    if (!row.competency_id) continue;
    // A criterion with no matching questions carries no evidence — skip it
    // rather than recording a spurious 0%.
    if (!row.total || row.total <= 0) continue;
    const entry = totals.get(row.competency_id) ?? { weighted: 0, questions: 0, names: [] };
    entry.weighted += Number(row.score) * row.total;
    entry.questions += row.total;
    if (row.criteria_name) entry.names.push(row.criteria_name);
    totals.set(row.competency_id, entry);
  }

  const rows = [...totals.entries()]
    .filter(([competencyId]) => !alreadyDerived.has(competencyId))
    .map(([competencyId, entry]) => {
      const score = Math.round((entry.weighted / entry.questions) * 100) / 100;
      return {
        student_id: attempt.student_id,
        competency_id: competencyId,
        faculty_id: null,
        source: 'assessment' as const,
        score: Math.min(100, Math.max(0, score)),
        attempt_id: attemptId,
        remarks: `Auto-derived from ${entry.questions} question${
          entry.questions === 1 ? '' : 's'
        }${entry.names.length > 0 ? ` · ${[...new Set(entry.names)].join(', ')}` : ''}`,
      };
    });

  if (rows.length === 0) return 0;

  const { error } = await supabase.from('competency_scores').insert(rows);
  if (error) {
    console.error('Failed to derive competency scores', error);
    return 0;
  }
  return rows.length;
}

export interface ResolvedCompetency {
  competency_id: string;
  name: string;
  score: number;
  level: CompetencyLevel;
  /** Which kind of record is being shown. */
  source: 'faculty_validation' | 'assessment' | 'simulation';
  /** How many assessment attempts contributed evidence for this competency. */
  attempts: number;
  latest_at: string;
}

interface ScoreRow {
  competency_id: string;
  source: string;
  score: number | string;
  created_at: string;
  competency_areas?: { name: string } | null;
}

/**
 * Collapse a student's score history into one current standing per competency.
 *
 * Faculty judgement outranks a quiz result, so a validated score is shown
 * whenever one exists and assessment-derived scores fill the rest. Within a
 * source the most recent row wins. `attempts` always reports the assessment
 * evidence available, even when a faculty validation is what's displayed, so
 * the UI can show what the derivation saw.
 */
export function resolveCompetencies(scores: ScoreRow[]): ResolvedCompetency[] {
  const byCompetency = new Map<string, ScoreRow[]>();
  for (const row of scores) {
    const list = byCompetency.get(row.competency_id) ?? [];
    list.push(row);
    byCompetency.set(row.competency_id, list);
  }

  const resolved: ResolvedCompetency[] = [];
  for (const [competencyId, rows] of byCompetency) {
    const newestFirst = [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const faculty = newestFirst.find((r) => r.source === 'faculty_validation');
    const chosen = faculty ?? newestFirst[0];
    const score = Number(chosen.score);
    resolved.push({
      competency_id: competencyId,
      name: chosen.competency_areas?.name ?? competencyId,
      score,
      level: competencyLevel(score),
      source: chosen.source as ResolvedCompetency['source'],
      attempts: rows.filter((r) => r.source === 'assessment').length,
      latest_at: chosen.created_at,
    });
  }

  // Weakest first: the tab exists to surface what needs attention.
  return resolved.sort((a, b) => a.score - b.score);
}
