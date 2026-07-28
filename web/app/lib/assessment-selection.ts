import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Picks the questions one attempt serves.
 *
 * Before this existed every attempt served the whole bank in `position` order:
 * identical paper, identical order, every student, every time. Three things
 * shape a paper now.
 *
 *   Size — `assessments.total_questions` fixes it. The bank may be larger, and
 *   the surplus is deliberate: it is the pool a later attempt draws unseen
 *   questions from.
 *
 *   Coverage — every criterion is guaranteed its `min_questions` before
 *   anything else is handed out, so a weighted criterion can never be absent
 *   from a paper that grades against it.
 *
 *   Emphasis — the first attempt spreads what is left over the criteria in
 *   proportion to how much material each has. A retake spends it on whatever
 *   the student scored worst on, and prefers questions they have not seen.
 *
 * Order is interleaved rather than grouped, so a student never meets all of one
 * criterion's questions in a block.
 *
 * Selection only ever considers questions with a `criteria_id`. An unassigned
 * question is invisible here and publish validation refuses to publish while
 * any exist — a question is either owned by a criterion or it is not asked.
 */

/** Weakness assumed for a criterion the student has no history on. Matches the ML recommender's exploration weight. */
const NEUTRAL_WEAKNESS = 0.5;

export interface SelectedQuestion {
  id: string;
  criteria_id: string | null;
  content: string;
  options: string[];
  /** 0-based order within this attempt. */
  position: number;
}

export interface CriterionAllocation {
  criteria_id: string | null;
  name: string;
  min_questions: number;
  /** Questions available to this criterion. */
  pool: number;
  allocated: number;
  /** How many of the allocated the student has not been served before. */
  unseen_used: number;
  /** 0 = perfect history, 1 = never correct, null = first attempt. */
  weakness: number | null;
}

export interface SelectionResult {
  questions: SelectedQuestion[];
  allocations: CriterionAllocation[];
  /** 1-based; 1 means this is the student's first sitting. */
  attemptNumber: number;
  /** Questions left out of the paper because no criterion owns them. */
  excludedUnassigned: number;
}

export class SelectionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SelectionError';
    this.status = status;
  }
}

interface QuestionRow {
  id: string;
  position: number;
  content: string;
  options: unknown;
  criteria_id: string | null;
}

interface CriterionRow {
  id: string;
  name: string;
  min_questions: number;
  sort_order: number;
}

type Rng = () => number;

/**
 * Re-read the paper an attempt was already served, in its served order.
 *
 * Resuming has to hand back exactly the same questions in the same order —
 * re-running selection would deal a different paper to a student who is
 * halfway through one.
 */
export async function loadServedQuestions(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<SelectedQuestion[]> {
  const { data: served } = await supabase
    .from('attempt_questions')
    .select('question_id, criteria_id, position')
    .eq('attempt_id', attemptId)
    .order('position', { ascending: true });

  if (!served || served.length === 0) return [];

  const { data: questions } = await supabase
    .from('questions')
    .select('id, content, options')
    .in(
      'id',
      served.map((s) => s.question_id),
    );

  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  return served
    .map((row, index) => {
      const question = byId.get(row.question_id);
      if (!question) return null;
      return {
        id: question.id,
        criteria_id: row.criteria_id,
        content: question.content,
        options: Array.isArray(question.options) ? (question.options as string[]) : [],
        position: index,
      } satisfies SelectedQuestion;
    })
    .filter((q): q is SelectedQuestion => q !== null);
}

// ---------------------------------------------------------------
// Pure helpers — no I/O, so they can be reasoned about and exercised directly
// ---------------------------------------------------------------

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Hand out `total` units across buckets in proportion to `weights`, never
 * exceeding each bucket's `caps`.
 *
 * Largest-remainder rather than naive rounding, because rounding each share
 * independently loses or invents units and the paper has to be exactly the
 * requested size. Capacity is rechecked as it goes: when a bucket fills, its
 * share flows to the others instead of being dropped.
 */
export function distribute(total: number, weights: number[], caps: number[]): number[] {
  const n = weights.length;
  const out = new Array<number>(n).fill(0);
  const capacity = caps.reduce((a, b) => a + b, 0);
  const target = Math.max(0, Math.min(total, capacity));
  if (target === 0 || n === 0) return out;

  // Every weight zero (e.g. a student with a perfect record on every
  // criterion) still has to produce a paper — fall back to capacity.
  const effective = weights.some((w) => w > 0) ? weights : caps.map((c) => (c > 0 ? 1 : 0));
  const sum = effective.reduce((a, b) => a + b, 0);
  if (sum <= 0) return out;

  const ideal = effective.map((w) => (target * w) / sum);
  for (let i = 0; i < n; i++) out[i] = Math.min(Math.floor(ideal[i]), caps[i]);

  let given = out.reduce((a, b) => a + b, 0);
  const byRemainder = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (ideal[b] - Math.floor(ideal[b])) - (ideal[a] - Math.floor(ideal[a])),
  );

  // Each pass places at least one unit or stops; `given` only ever rises.
  let progressed = true;
  while (given < target && progressed) {
    progressed = false;
    for (const i of byRemainder) {
      if (given >= target) break;
      if (out[i] < caps[i]) {
        out[i] += 1;
        given += 1;
        progressed = true;
      }
    }
  }
  return out;
}

/**
 * Interleave the per-criterion picks so each criterion is spread across the
 * whole paper.
 *
 * Round-robin would clump the tail once the smaller criteria run out, so each
 * question is instead given an ideal slot at its even share of the paper and
 * everything is sorted by that. Ties break on a random jitter, so two criteria
 * with the same count don't always appear in the same order.
 */
function interleave(
  picks: { criteriaId: string | null; questions: QuestionRow[] }[],
  rng: Rng,
): QuestionRow[] {
  const total = picks.reduce((sum, p) => sum + p.questions.length, 0);
  if (total === 0) return [];

  const slotted = picks.flatMap((bucket) =>
    bucket.questions.map((question, index) => ({
      question,
      // centre of this question's share of the paper
      target: ((index + 0.5) * total) / bucket.questions.length,
      jitter: rng(),
    })),
  );

  slotted.sort((a, b) => a.target - b.target || a.jitter - b.jitter);
  return slotted.map((s) => s.question);
}

// ---------------------------------------------------------------

/**
 * Build the paper for a student's next attempt at an assessment.
 *
 * Does not create the attempt or persist anything — the caller owns the
 * transaction and writes `attempt_questions` from the result.
 */
export async function selectQuestionsForAttempt(
  supabase: SupabaseClient,
  options: { assessmentId: string; studentId: string; rng?: Rng },
): Promise<SelectionResult> {
  const { assessmentId, studentId, rng = Math.random } = options;

  const [assessmentRes, criteriaRes, questionsRes] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, total_questions')
      .eq('id', assessmentId)
      .maybeSingle(),
    supabase
      .from('assessment_criteria')
      .select('id, name, min_questions, sort_order')
      .eq('assessment_id', assessmentId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('questions')
      .select('id, position, content, options, criteria_id')
      .eq('assessment_id', assessmentId)
      .order('position', { ascending: true }),
  ]);

  if (!assessmentRes.data) throw new SelectionError('Assessment not found', 404);
  if (criteriaRes.error || questionsRes.error) {
    throw new SelectionError('Unable to read the assessment', 500);
  }

  const criteria = (criteriaRes.data ?? []) as CriterionRow[];
  const allQuestions = (questionsRes.data ?? []) as QuestionRow[];
  if (allQuestions.length === 0) throw new SelectionError('Assessment has no questions');

  // An assessment with no criteria has nothing to balance, so the whole bank
  // is one bucket. Keeps quizzes that predate criteria working.
  const useCriteria = criteria.length > 0;
  const buckets: { id: string | null; name: string; min: number; pool: QuestionRow[] }[] =
    useCriteria
      ? criteria.map((c) => ({
          id: c.id,
          name: c.name,
          min: Math.max(0, c.min_questions ?? 0),
          pool: allQuestions.filter((q) => q.criteria_id === c.id),
        }))
      : [{ id: null, name: 'All questions', min: 0, pool: allQuestions }];

  const eligible = buckets.reduce((sum, b) => sum + b.pool.length, 0);
  if (eligible === 0) {
    throw new SelectionError('No questions are assigned to a criterion yet');
  }

  const requested = assessmentRes.data.total_questions ?? eligible;
  const paperSize = Math.max(1, Math.min(requested, eligible));

  // ---------- history ----------
  const { data: priorAttempts } = await supabase
    .from('assessment_attempts')
    .select('id')
    .eq('assessment_id', assessmentId)
    .eq('student_id', studentId)
    .eq('status', 'submitted');

  const priorIds = (priorAttempts ?? []).map((a) => a.id);
  const isRetake = priorIds.length > 0;

  const seen = new Set<string>();
  const weaknessByCriteria = new Map<string, number>();

  if (isRetake) {
    const [servedRes, scoresRes] = await Promise.all([
      supabase.from('attempt_questions').select('question_id').in('attempt_id', priorIds),
      supabase
        .from('attempt_criteria_scores')
        .select('criteria_id, score, total')
        .in('attempt_id', priorIds),
    ]);

    for (const row of servedRes.data ?? []) seen.add(row.question_id);

    // Weight each past result by the questions behind it: a 6-question
    // criterion is stronger evidence than a 1-question one.
    const evidence = new Map<string, { weighted: number; questions: number }>();
    for (const row of scoresRes.data ?? []) {
      if (!row.criteria_id || !row.total || row.total <= 0) continue;
      const entry = evidence.get(row.criteria_id) ?? { weighted: 0, questions: 0 };
      entry.weighted += Number(row.score) * row.total;
      entry.questions += row.total;
      evidence.set(row.criteria_id, entry);
    }
    for (const [criteriaId, entry] of evidence) {
      const average = entry.weighted / entry.questions;
      weaknessByCriteria.set(criteriaId, Math.min(1, Math.max(0, 1 - average / 100)));
    }
  }

  // ---------- allocation ----------
  const caps = buckets.map((b) => b.pool.length);

  // Guaranteed minimums first, capped by what each criterion actually has.
  // If the minimums alone overshoot the paper (publish validation should have
  // caught it) they are scaled down proportionally rather than throwing.
  const wantedMins = buckets.map((b, i) => Math.min(b.min, caps[i]));
  const minSum = wantedMins.reduce((a, b) => a + b, 0);
  const mins =
    minSum <= paperSize ? wantedMins : distribute(paperSize, wantedMins, wantedMins);

  const headroom = buckets.map((b, i) => caps[i] - mins[i]);
  const remainder = paperSize - mins.reduce((a, b) => a + b, 0);

  // First sitting spreads by how much material each criterion has; a retake
  // spends the surplus where the student is weakest.
  const weights = buckets.map((b, i) => {
    if (!isRetake) return headroom[i];
    const weakness = b.id ? (weaknessByCriteria.get(b.id) ?? NEUTRAL_WEAKNESS) : NEUTRAL_WEAKNESS;
    return weakness * headroom[i];
  });

  const extra = distribute(remainder, weights, headroom);
  const allocated = mins.map((m, i) => m + extra[i]);

  // ---------- pick within each criterion ----------
  const picks = buckets.map((bucket, i) => {
    const take = allocated[i];
    // A retake shows unseen questions first — that surplus in the bank is the
    // whole reason a paper can be smaller than it.
    const unseen = shuffle(
      bucket.pool.filter((q) => !seen.has(q.id)),
      rng,
    );
    const already = shuffle(
      bucket.pool.filter((q) => seen.has(q.id)),
      rng,
    );
    const ordered = isRetake ? [...unseen, ...already] : shuffle(bucket.pool, rng);
    const chosen = ordered.slice(0, take);
    return {
      criteriaId: bucket.id,
      questions: chosen,
      unseenUsed: chosen.filter((q) => !seen.has(q.id)).length,
    };
  });

  const ordered = interleave(picks, rng);

  return {
    questions: ordered.map((q, index) => ({
      id: q.id,
      criteria_id: q.criteria_id,
      content: q.content,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      position: index,
    })),
    allocations: buckets.map((bucket, i) => ({
      criteria_id: bucket.id,
      name: bucket.name,
      min_questions: bucket.min,
      pool: caps[i],
      allocated: allocated[i],
      unseen_used: picks[i].unseenUsed,
      weakness: isRetake
        ? (bucket.id ? (weaknessByCriteria.get(bucket.id) ?? NEUTRAL_WEAKNESS) : NEUTRAL_WEAKNESS)
        : null,
    })),
    attemptNumber: priorIds.length + 1,
    excludedUnassigned: allQuestions.filter((q) => !q.criteria_id).length,
  };
}
