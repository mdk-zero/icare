import type { SupabaseClient } from '@supabase/supabase-js';
import { SHORT_ANSWER } from './short-answer';
import { scoredStatuses } from './quiz-practice';
import { DEFAULT_BKT, answersInOrder, loadBktParameters, traceMastery } from './bkt';
import { isMissingSkillColumn, skillIdFromTitle } from './taylor-skills';

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
 *   Emphasis — every graded try spreads what is left over the criteria in
 *   proportion to how much material each has, so a student's tries follow the
 *   same blueprint and their average compares like with like. Within a
 *   criterion a retake serves unseen questions first.
 *
 * Order is interleaved rather than grouped, so a student never meets all of one
 * criterion's questions in a block.
 *
 * A review quiz (083) is the adaptive paper, dealt once the graded tries are
 * used up. It holds only the questions the student got wrong the last time they
 * answered them, whatever size the instructor set, so it shrinks as they get
 * them right. Each criterion's Taylor's skill gets a mastery estimate from
 * Bayesian Knowledge Tracing — the student's every quiz answer on that skill,
 * in order, through the update rules in bkt.ts with the parameters the ML
 * service fitted (084) — and the questions come grouped by skill, least
 * mastered first.
 *
 * Selection only ever considers questions with a `criteria_id`. An unassigned
 * question is invisible here and publish validation refuses to publish while
 * any exist — a question is either owned by a criterion or it is not asked.
 */

export interface SelectedQuestion {
  id: string;
  criteria_id: string | null;
  content: string;
  /** The choices; empty for a short answer question, whose accepted answers stay on the server. */
  options: string[];
  question_type: string;
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
  /** BKT P(known) for the criterion's skill; null on a graded try, which doesn't adapt. */
  mastery: number | null;
  /** 1 - mastery: the lowest mastery comes first on a review quiz. */
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

/** Why a review quiz can't be dealt; the mobile app shows the server's sentence on a 409. */
export const NOTHING_TO_REVIEW =
  'There are no wrong answers to review on this quiz. Ask your instructor if you need another try.';

interface QuestionRow {
  id: string;
  position: number;
  content: string;
  options: unknown;
  question_type: string | null;
  criteria_id: string | null;
}

/** What a student is shown of a question's options: none for short answer, which would give the answer away. */
function servedChoices(q: { options: unknown; question_type: string | null }) {
  const question_type = q.question_type || 'multiple_choice';
  const options = question_type === SHORT_ANSWER || !Array.isArray(q.options) ? [] : (q.options as string[]);
  return { options, question_type };
}

interface CriterionRow {
  id: string;
  name: string;
  min_questions: number;
  sort_order: number;
  skill_id?: string | null;
}

/** The knowledge component BKT traces a criterion's questions under: its skill, else the criterion itself. */
function knowledgeComponent(skillId: string | null | undefined, criteriaId: string | null, assessmentId: string) {
  if (skillId) return skillId;
  return criteriaId ? `criterion:${criteriaId}` : `quiz:${assessmentId}`;
}

/** A criterion's skill: skill_id (049), else the one its name cites. */
export function criterionSkill(c: { skill_id?: string | null; name?: string | null }): string | null {
  return c.skill_id ?? skillIdFromTitle(c.name ?? '');
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
    .select('id, content, options, question_type')
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
        ...servedChoices(question),
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

/** The questions whose last answer was wrong, given the answers oldest first. */
function wrongLastTime(answers: readonly { question_id: string; is_correct: boolean }[]): Set<string> {
  const last = new Map<string, boolean>();
  for (const answer of answers) last.set(answer.question_id, Boolean(answer.is_correct));
  return new Set([...last].filter(([, correct]) => !correct).map(([id]) => id));
}

/** The size of a graded paper: the instructor's, or the whole bank; never more than the bank holds. */
function sizeOfPaper(requested: number | null | undefined, eligible: number): number {
  return Math.max(1, Math.min(requested ?? eligible, eligible));
}

// ---------------------------------------------------------------
// Reads
// ---------------------------------------------------------------

/**
 * Per quiz, the questions a student got wrong the last time they answered them
 * and that the quiz can still serve: what their review quiz would hold.
 */
export async function loadMissedQuestions(
  supabase: SupabaseClient,
  studentId: string,
  assessmentIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (assessmentIds.length === 0) return out;

  const { data: history } = await supabase
    .from('assessment_attempts')
    .select('id, assessment_id, submitted_at')
    .eq('student_id', studentId)
    .in('assessment_id', [...assessmentIds])
    .in('status', await scoredStatuses(supabase));
  const attempts = (history ?? []) as { id: string; assessment_id: string; submitted_at: string | null }[];
  if (attempts.length === 0) return out;

  const attemptIds = attempts.map((a) => a.id);
  const [servedRes, answersRes, criteriaRes] = await Promise.all([
    supabase.from('attempt_questions').select('attempt_id, question_id, position').in('attempt_id', attemptIds),
    supabase.from('attempt_answers').select('attempt_id, question_id, is_correct').in('attempt_id', attemptIds),
    supabase.from('assessment_criteria').select('id, assessment_id').in('assessment_id', [...assessmentIds]),
  ]);
  const answers = (answersRes.data ?? []) as { attempt_id: string; question_id: string; is_correct: boolean }[];
  const served = (servedRes.data ?? []) as { attempt_id: string; question_id: string; position: number }[];
  const missed = wrongLastTime(answersInOrder(answers, attempts, served));
  if (missed.size === 0) return out;

  // Selection only serves a question a criterion owns, or any on a quiz with none.
  const criteria = (criteriaRes.data ?? []) as { id: string; assessment_id: string }[];
  const withCriteria = new Set(criteria.map((c) => c.assessment_id));
  const criterionIds = new Set(criteria.map((c) => c.id));
  const { data: questions } = await supabase
    .from('questions')
    .select('id, assessment_id, criteria_id')
    .in('id', [...missed]);
  for (const q of (questions ?? []) as { id: string; assessment_id: string; criteria_id: string | null }[]) {
    if (withCriteria.has(q.assessment_id) && !(q.criteria_id && criterionIds.has(q.criteria_id))) continue;
    out.set(q.assessment_id, (out.get(q.assessment_id) ?? new Set<string>()).add(q.id));
  }
  return out;
}

/** How many questions a graded paper on this quiz holds right now. */
export async function gradedPaperSize(supabase: SupabaseClient, assessmentId: string): Promise<number> {
  const [assessmentRes, criteriaRes, questionsRes] = await Promise.all([
    supabase.from('assessments').select('total_questions').eq('id', assessmentId).maybeSingle(),
    supabase.from('assessment_criteria').select('id').eq('assessment_id', assessmentId),
    supabase.from('questions').select('id, criteria_id').eq('assessment_id', assessmentId),
  ]);
  const criterionIds = new Set(((criteriaRes.data ?? []) as { id: string }[]).map((c) => c.id));
  const questions = (questionsRes.data ?? []) as { id: string; criteria_id: string | null }[];
  const eligible = criterionIds.size > 0 ? questions.filter((q) => q.criteria_id && criterionIds.has(q.criteria_id)).length : questions.length;
  return sizeOfPaper(assessmentRes.data?.total_questions as number | null | undefined, eligible);
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
  options: {
    assessmentId: string;
    studentId: string;
    /** A review quiz past the attempt limit: only wrong answers, weakest skills first. */
    practice?: boolean;
    rng?: Rng;
  },
): Promise<SelectionResult> {
  const { assessmentId, studentId, practice = false, rng = Math.random } = options;

  const readCriteria = (columns: string) =>
    supabase
      .from('assessment_criteria')
      .select(columns)
      .eq('assessment_id', assessmentId)
      .order('sort_order', { ascending: true });
  const [assessmentRes, criteriaFirst, questionsRes] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, total_questions')
      .eq('id', assessmentId)
      .maybeSingle(),
    readCriteria('id, name, min_questions, sort_order, skill_id'),
    supabase
      .from('questions')
      .select('id, position, content, options, question_type, criteria_id')
      .eq('assessment_id', assessmentId)
      .order('position', { ascending: true }),
  ]);

  // Before 049 there is no skill_id; the skill then comes from the name.
  const criteriaRes =
    criteriaFirst.error && isMissingSkillColumn(criteriaFirst.error)
      ? await readCriteria('id, name, min_questions, sort_order')
      : criteriaFirst;

  if (!assessmentRes.data) throw new SelectionError('Assessment not found', 404);
  if (criteriaRes.error || questionsRes.error) {
    throw new SelectionError('Unable to read the assessment', 500);
  }

  const criteria = (criteriaRes.data ?? []) as unknown as CriterionRow[];
  const allQuestions = (questionsRes.data ?? []) as QuestionRow[];
  if (allQuestions.length === 0) throw new SelectionError('Assessment has no questions');

  // An assessment with no criteria has nothing to balance, so the whole bank
  // is one bucket. Keeps quizzes that predate criteria working.
  const useCriteria = criteria.length > 0;
  const buckets: { id: string | null; name: string; min: number; skill: string | null; kc: string; pool: QuestionRow[] }[] =
    useCriteria
      ? criteria.map((c) => {
          const skill = criterionSkill(c);
          return {
            id: c.id,
            name: c.name,
            min: Math.max(0, c.min_questions ?? 0),
            skill,
            kc: knowledgeComponent(skill, c.id, assessmentId),
            pool: allQuestions.filter((q) => q.criteria_id === c.id),
          };
        })
      : [{ id: null, name: 'All questions', min: 0, skill: null, kc: knowledgeComponent(null, null, assessmentId), pool: allQuestions }];

  const eligible = buckets.reduce((sum, b) => sum + b.pool.length, 0);
  if (eligible === 0) {
    throw new SelectionError('No questions are assigned to a criterion yet');
  }

  const paperSize = sizeOfPaper(assessmentRes.data.total_questions, eligible);

  // ---------- history ----------
  // Every finished run the student has on any quiz: a skill is often asked on
  // more than one, and BKT should hear all of it.
  const { data: history } = await supabase
    .from('assessment_attempts')
    .select('id, assessment_id, submitted_at')
    .eq('student_id', studentId)
    .in('status', await scoredStatuses(supabase));
  const attempts = (history ?? []) as { id: string; assessment_id: string; submitted_at: string | null }[];

  const priorIds = attempts.filter((a) => a.assessment_id === assessmentId).map((a) => a.id);

  if (practice) {
    const review = await dealReview(supabase, { assessmentId, buckets, attempts, rng });
    return {
      ...review,
      attemptNumber: priorIds.length + 1,
      excludedUnassigned: allQuestions.filter((q) => !q.criteria_id).length,
    };
  }

  const seen = new Set<string>();
  if (priorIds.length > 0) {
    const { data: served } = await supabase.from('attempt_questions').select('question_id').in('attempt_id', priorIds);
    for (const row of (served ?? []) as { question_id: string }[]) seen.add(row.question_id);
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

  // Every graded try spreads by how much material each criterion has.
  const extra = distribute(remainder, headroom, headroom);
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
    const chosen = [...unseen, ...already].slice(0, take);
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
      ...servedChoices(q),
      position: index,
    })),
    allocations: buckets.map((bucket, i) => ({
      criteria_id: bucket.id,
      name: bucket.name,
      min_questions: bucket.min,
      pool: caps[i],
      allocated: allocated[i],
      unseen_used: picks[i].unseenUsed,
      mastery: null,
      weakness: null,
    })),
    attemptNumber: priorIds.length + 1,
    excludedUnassigned: allQuestions.filter((q) => !q.criteria_id).length,
  };
}

/**
 * A review quiz: the questions the student got wrong the last time they
 * answered them, grouped by skill with the least mastered first, and shuffled
 * within a skill. Throws when there is nothing to review.
 */
async function dealReview(
  supabase: SupabaseClient,
  options: {
    assessmentId: string;
    buckets: { id: string | null; name: string; min: number; skill: string | null; kc: string; pool: QuestionRow[] }[];
    attempts: { id: string; assessment_id: string; submitted_at: string | null }[];
    rng: Rng;
  },
): Promise<Pick<SelectionResult, 'questions' | 'allocations'>> {
  const { assessmentId, buckets, attempts, rng } = options;
  const attemptIds = attempts.map((a) => a.id);
  const [servedRes, answersRes] = await Promise.all([
    supabase.from('attempt_questions').select('attempt_id, question_id, position').in('attempt_id', attemptIds),
    supabase.from('attempt_answers').select('attempt_id, question_id, is_correct').in('attempt_id', attemptIds),
  ]);
  const served = (servedRes.data ?? []) as { attempt_id: string; question_id: string; position: number }[];

  // Which knowledge component each answered question belongs to.
  const answers = (answersRes.data ?? []) as { attempt_id: string; question_id: string; is_correct: boolean }[];
  const answeredIds = [...new Set(answers.map((a) => a.question_id))];
  const { data: answeredQuestions } = answeredIds.length
    ? await supabase.from('questions').select('id, criteria_id, assessment_id').in('id', answeredIds)
    : { data: [] };
  const questionMeta = new Map(
    ((answeredQuestions ?? []) as { id: string; criteria_id: string | null; assessment_id: string }[]).map((q) => [q.id, q]),
  );
  const criteriaIds = [...new Set([...questionMeta.values()].map((q) => q.criteria_id).filter((id): id is string => !!id))];
  const skillOfCriterion = new Map<string, string | null>();
  if (criteriaIds.length > 0) {
    let res = await supabase.from('assessment_criteria').select('id, name, skill_id').in('id', criteriaIds);
    if (res.error && isMissingSkillColumn(res.error)) {
      res = (await supabase.from('assessment_criteria').select('id, name').in('id', criteriaIds)) as typeof res;
    }
    for (const c of (res.data ?? []) as { id: string; name: string; skill_id?: string | null }[]) {
      skillOfCriterion.set(c.id, criterionSkill(c));
    }
  }

  const ordered = answersInOrder(answers, attempts, served);
  const sequences = new Map<string, boolean[]>();
  for (const answer of ordered) {
    const meta = questionMeta.get(answer.question_id);
    if (!meta) continue;
    const kc = knowledgeComponent(
      meta.criteria_id ? skillOfCriterion.get(meta.criteria_id) : null,
      meta.criteria_id,
      meta.assessment_id,
    );
    sequences.set(kc, [...(sequences.get(kc) ?? []), Boolean(answer.is_correct)]);
  }
  const missed = wrongLastTime(ordered.filter((a) => questionMeta.get(a.question_id)?.assessment_id === assessmentId));

  const params = await loadBktParameters(
    supabase,
    buckets.map((b) => b.skill).filter((id): id is string => !!id),
  );
  const rows = buckets.map((bucket) => {
    const skillParams = (bucket.skill && params.get(bucket.skill)) || DEFAULT_BKT;
    return {
      bucket,
      mastery: traceMastery(skillParams, sequences.get(bucket.kc) ?? []),
      questions: shuffle(bucket.pool.filter((q) => missed.has(q.id)), rng),
    };
  });

  // Criteria on one skill share a mastery, so the tie on kc keeps them together.
  const weakestFirst = rows
    .filter((r) => r.questions.length > 0)
    .sort((a, b) => a.mastery - b.mastery || a.bucket.kc.localeCompare(b.bucket.kc));
  if (weakestFirst.length === 0) throw new SelectionError(NOTHING_TO_REVIEW, 409);

  return {
    questions: weakestFirst
      .flatMap((r) => r.questions)
      .map((q, index) => ({
        id: q.id,
        criteria_id: q.criteria_id,
        content: q.content,
        ...servedChoices(q),
        position: index,
      })),
    allocations: rows.map((r) => ({
      criteria_id: r.bucket.id,
      name: r.bucket.name,
      min_questions: r.bucket.min,
      pool: r.bucket.pool.length,
      allocated: r.questions.length,
      unseen_used: 0,
      mastery: r.mastery,
      weakness: 1 - r.mastery,
    })),
  };
}
