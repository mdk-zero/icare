/**
 * Behavioural checks for app/lib/assessment-selection.ts.
 *
 * The allocation is the subtlest logic in the assessment stack — guaranteed
 * minimums, largest-remainder distribution under capacity limits, unseen-first
 * picking, an even interleave, and a review quiz of only the wrong answers with
 * the weakest skills first — and a mistake in
 * it produces a paper that still looks plausible. There is no test runner in
 * this repo, so this is the safety net: synthetic fixtures through a stub
 * client for the cases real data doesn't cover, then every real assessment for
 * a sanity pass.
 *
 *   npm run check:selection
 *
 * Exits non-zero on the first failing expectation. The database section is
 * skipped when Supabase credentials are absent, so the synthetic checks still
 * run anywhere.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  NOTHING_TO_REVIEW,
  SelectionError,
  gradedPaperSize,
  loadMissedQuestions,
  selectQuestionsForAttempt,
  distribute,
  type SelectionResult,
} from '../app/lib/assessment-selection';
import { DEFAULT_ATTEMPTS, attemptLimit, quizGrade } from '../app/lib/quiz-attempts';
import { isPracticeRun } from '../app/lib/quiz-practice';
import { DEFAULT_BKT, predictCorrect, traceMastery, updateMastery } from '../app/lib/bkt';

config({ path: '.env.local' });

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Deterministic rng so a failure is reproducible. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Minimal chainable/awaitable stand-in for the supabase client. */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return api;
        },
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return api;
        },
        limit: () => api,
        order: (col: string) => {
          rows = [...rows].sort((a, b) => Number(a[col]) - Number(b[col]));
          return api;
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return api;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function buildFixture(opts: {
  totalQuestions: number | null;
  pools: { name: string; min: number; count: number; skill?: string }[];
  priorAttempt?: {
    /** 'practiced' is a review quiz past the attempt limit (083). */
    status?: string;
    seenQuestionIds: string[];
    /** Per criterion, the share of its seen questions answered right (the first ones). */
    scores: { criteriaIndex: number; score: number; total: number }[];
    /** Seen questions answered wrong, on top of what `scores` says. */
    wrongQuestionIds?: string[];
  };
  /** Answers on another quiz 'B', handed in before the prior attempt: skill -> right/wrong in order. */
  otherQuiz?: Record<string, boolean[]>;
}) {
  const criteria: Record<string, unknown>[] = opts.pools.map((p, i) => ({
    id: `c${i}`,
    assessment_id: 'A',
    name: p.name,
    min_questions: p.min,
    sort_order: i,
    skill_id: p.skill ?? null,
  }));
  const questions: Record<string, unknown>[] = [];
  let n = 0;
  opts.pools.forEach((p, i) => {
    for (let k = 0; k < p.count; k++) {
      questions.push({
        id: `q${n}`,
        assessment_id: 'A',
        position: n,
        content: `Q${n}`,
        options: ['a', 'b'],
        criteria_id: `c${i}`,
      });
      n++;
    }
  });

  const tables: Record<string, Record<string, unknown>[]> = {
    assessments: [{ id: 'A', total_questions: opts.totalQuestions }],
    assessment_criteria: criteria,
    questions,
    assessment_attempts: [],
    attempt_questions: [],
    attempt_answers: [],
  };

  if (opts.priorAttempt) {
    const prior = opts.priorAttempt;
    tables.assessment_attempts = [
      { id: 'PRIOR', assessment_id: 'A', student_id: 'S', status: prior.status ?? 'submitted', submitted_at: '2026-10-02T00:00:00Z' },
    ];
    tables.attempt_questions = prior.seenQuestionIds.map((qid, position) => ({
      attempt_id: 'PRIOR',
      question_id: qid,
      position,
    }));
    const criterionOf = new Map(questions.map((q) => [q.id as string, q.criteria_id as string]));
    const right = new Map(prior.scores.map((sc) => [`c${sc.criteriaIndex}`, sc.score / 100]));
    const seenIn = new Map<string, string[]>();
    for (const qid of prior.seenQuestionIds) {
      const c = criterionOf.get(qid)!;
      seenIn.set(c, [...(seenIn.get(c) ?? []), qid]);
    }
    tables.attempt_answers = prior.seenQuestionIds.map((qid) => {
      const c = criterionOf.get(qid)!;
      const mine = seenIn.get(c)!;
      const correct =
        mine.indexOf(qid) < Math.round((right.get(c) ?? 1) * mine.length) && !prior.wrongQuestionIds?.includes(qid);
      return { attempt_id: 'PRIOR', question_id: qid, is_correct: correct };
    });
  }
  if (opts.otherQuiz) {
    tables.assessment_attempts.push({
      id: 'OTHER', assessment_id: 'B', student_id: 'S', status: 'submitted', submitted_at: '2026-10-01T00:00:00Z',
    });
    let n = 0;
    for (const [skill, results] of Object.entries(opts.otherQuiz)) {
      tables.assessment_criteria.push({ id: `b-${skill}`, assessment_id: 'B', name: `Skill ${skill}`, skill_id: skill });
      for (const correct of results) {
        const id = `b${n}`;
        tables.questions.push({ id, assessment_id: 'B', position: n, criteria_id: `b-${skill}` });
        tables.attempt_questions.push({ attempt_id: 'OTHER', question_id: id, position: n });
        tables.attempt_answers.push({ attempt_id: 'OTHER', question_id: id, is_correct: correct });
        n++;
      }
    }
  }
  return { tables, questions };
}

function invariants(result: SelectionResult, expectedSize: number, label: string) {
  const ids = result.questions.map((q) => q.id);
  check(`${label}: paper is ${expectedSize} questions`, ids.length === expectedSize, `got ${ids.length}`);
  check(`${label}: no duplicate questions`, new Set(ids).size === ids.length);
  check(
    `${label}: positions are 0..n-1`,
    result.questions.every((q, i) => q.position === i),
  );
  const shortfall = result.allocations.filter(
    (a) => a.allocated < Math.min(a.min_questions, a.pool),
  );
  check(`${label}: every criterion meets its minimum`, shortfall.length === 0,
    shortfall.map((s) => `${s.name} ${s.allocated}<${s.min_questions}`).join(', '));
  const sum = result.allocations.reduce((s, a) => s + a.allocated, 0);
  check(`${label}: allocations sum to the paper`, sum === ids.length, `${sum} vs ${ids.length}`);
}

/** Longest run of consecutive questions from the same criterion. */
function longestRun(result: SelectionResult) {
  let best = 1;
  let run = 1;
  for (let i = 1; i < result.questions.length; i++) {
    run = result.questions[i].criteria_id === result.questions[i - 1].criteria_id ? run + 1 : 1;
    if (run > best) best = run;
  }
  return result.questions.length === 0 ? 0 : best;
}

async function main() {
  console.log('=== distribute() ===');
  check('respects caps when total exceeds capacity',
    JSON.stringify(distribute(100, [1, 1], [3, 2])) === JSON.stringify([3, 2]));
  check('sums exactly to total',
    distribute(7, [3, 2, 1], [10, 10, 10]).reduce((a, b) => a + b, 0) === 7);
  check('all-zero weights still fills the paper',
    distribute(5, [0, 0, 0], [2, 2, 2]).reduce((a, b) => a + b, 0) === 5);
  check('overflow from a full bucket goes elsewhere',
    JSON.stringify(distribute(6, [10, 1], [2, 10])) === JSON.stringify([2, 4]));
  check('zero total gives nothing', distribute(0, [1, 1], [5, 5]).every((n) => n === 0));
  check('empty input is safe', distribute(5, [], []).length === 0);

  console.log('\n=== first attempt: 12-question bank, 8-question paper ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 8,
      pools: [
        { name: 'Big', min: 2, count: 6 },
        { name: 'Mid', min: 1, count: 3 },
        { name: 'Small', min: 1, count: 3 },
      ],
    });
    const r = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A',
      studentId: 'S',
      rng: seeded(1),
    });
    invariants(r, 8, 'first');
    check('first attempt has no weakness signal', r.allocations.every((a) => a.weakness === null));
    check('attemptNumber is 1', r.attemptNumber === 1);
    console.log(
      '   allocation: ' + r.allocations.map((a) => `${a.name}=${a.allocated}/${a.pool}`).join(' '),
    );
    check('surplus follows pool size (Big gets the most)',
      r.allocations[0].allocated > r.allocations[1].allocated);
    check('interleaved, not grouped', longestRun(r) <= 2, `longest run ${longestRun(r)}`);
  }

  console.log('\n=== graded retake: same mix of skills as the first try, unseen preferred ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 8,
      pools: [
        { name: 'Strong', min: 1, count: 6 },
        { name: 'Weak', min: 1, count: 6 },
      ],
      priorAttempt: {
        // saw the first three of each pool
        seenQuestionIds: ['q0', 'q1', 'q2', 'q6', 'q7', 'q8'],
        scores: [
          { criteriaIndex: 0, score: 100, total: 3 },
          { criteriaIndex: 1, score: 0, total: 3 },
        ],
      },
    });
    const r = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A',
      studentId: 'S',
      rng: seeded(7),
    });
    invariants(r, 8, 'retake');
    check('attemptNumber is 2', r.attemptNumber === 2);
    const [strong, weak] = r.allocations;
    check('a graded try has no mastery signal', r.allocations.every((a) => a.mastery === null && a.weakness === null));
    check('a weak score does not change the mix', strong.allocated === 4 && weak.allocated === 4,
      `Strong ${strong.allocated}, Weak ${weak.allocated}`);
    check('each criterion uses its unseen before repeating',
      r.allocations.every((a) => a.unseen_used === Math.min(a.allocated, 3)),
      r.allocations.map((a) => `${a.name} ${a.unseen_used} unseen of ${a.allocated}`).join(', '));
    const seen = new Set(['q0', 'q1', 'q2', 'q6', 'q7', 'q8']);
    const repeats = r.questions.filter((q) => seen.has(q.id)).length;
    check('repeats only appear once the unseen pool is dry', repeats === 2, `${repeats} repeats`);
  }

  console.log('\n=== review quiz: only the wrong answers, weakest skills first ===');
  {
    const review = (tables: Record<string, Record<string, unknown>[]>, seed = 7) =>
      selectQuestionsForAttempt(fakeClient(tables), { assessmentId: 'A', studentId: 'S', practice: true, rng: seeded(seed) });
    const { tables } = buildFixture({
      totalQuestions: 8,
      pools: [
        { name: 'Skill 1-1', min: 2, count: 4, skill: '1-1' },
        { name: 'Skill 14-1', min: 2, count: 4, skill: '14-1' },
        { name: 'Skill 15-1', min: 2, count: 4, skill: '15-1' },
      ],
      priorAttempt: {
        seenQuestionIds: ['q0', 'q1', 'q2', 'q4', 'q5', 'q6', 'q8', 'q9', 'q10'],
        // Skill 1-1: one wrong of three. Skill 14-1: all three wrong. Skill 15-1: all right.
        scores: [
          { criteriaIndex: 0, score: 67, total: 3 },
          { criteriaIndex: 1, score: 0, total: 3 },
          { criteriaIndex: 2, score: 100, total: 3 },
        ],
      },
    });
    const r = await review(tables);
    const ids = r.questions.map((q) => q.id);
    check('serves exactly the questions answered wrong', [...ids].sort().join() === ['q2', 'q4', 'q5', 'q6'].sort().join(), ids.join());
    check('its length ignores the size the instructor set', ids.length === 4);
    check('the weakest skill comes first', ids.slice(0, 3).every((id) => ['q4', 'q5', 'q6'].includes(id)), ids.join());
    check('then the next weakest', ids[3] === 'q2', ids.join());
    check('positions are 0..n-1', r.questions.every((q, i) => q.position === i));
    const [s1, s14, s15] = r.allocations;
    check('mastery ranks the skills', (s14.mastery ?? 1) < (s1.mastery ?? 0) && (s1.mastery ?? 1) < (s15.mastery ?? 0));
    check('weakness is 1 - BKT mastery', Math.abs((s14.weakness ?? 0) - (1 - (s14.mastery ?? 0))) < 1e-9);
    check('a skill with nothing wrong gets no questions', s15.allocated === 0, `${s15.allocated}`);
    const orders = new Set<string>();
    for (const seed of [1, 2, 3, 5, 7, 11, 13, 29]) {
      orders.add((await review(tables, seed)).questions.slice(0, 3).map((q) => q.id).join());
    }
    check('shuffled within a skill, not a fixed order', orders.size > 1, `${orders.size} orders`);

    const missed = await loadMissedQuestions(fakeClient(tables), 'S', ['A']);
    check('the quiz list counts the same questions', [...(missed.get('A') ?? [])].sort().join() === [...ids].sort().join());
    check('a quiz not asked about is left out', (await loadMissedQuestions(fakeClient(tables), 'S', [])).size === 0);
  }

  console.log('\n=== review quiz: a question answered right drops out ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 4,
      pools: [{ name: 'Only', min: 1, count: 4 }],
      priorAttempt: {
        seenQuestionIds: ['q0', 'q1', 'q2', 'q3'],
        scores: [{ criteriaIndex: 0, score: 50, total: 4 }],
      },
    });
    const dealt = async () =>
      (await selectQuestionsForAttempt(fakeClient(tables), { assessmentId: 'A', studentId: 'S', practice: true, rng: seeded(3) }))
        .questions.map((q) => q.id).sort().join();
    check('the first review holds both wrong answers', (await dealt()) === 'q2,q3', await dealt());

    // The review: q2 right this time, q3 wrong again.
    tables.assessment_attempts.push({ id: 'REVIEW', assessment_id: 'A', student_id: 'S', status: 'practiced', submitted_at: '2026-10-03T00:00:00Z' });
    tables.attempt_questions.push({ attempt_id: 'REVIEW', question_id: 'q2', position: 0 }, { attempt_id: 'REVIEW', question_id: 'q3', position: 1 });
    tables.attempt_answers.push({ attempt_id: 'REVIEW', question_id: 'q2', is_correct: true }, { attempt_id: 'REVIEW', question_id: 'q3', is_correct: false });
    check('the next review holds only what is still wrong', (await dealt()) === 'q3', await dealt());

    // q3 right too: nothing left.
    tables.attempt_answers = tables.attempt_answers.map((a) => (a.attempt_id === 'REVIEW' ? { ...a, is_correct: true } : a));
    let refused: unknown = null;
    await dealt().catch((err) => {
      refused = err;
    });
    check('with none left it refuses, with a 409 and the reason',
      refused instanceof SelectionError && refused.status === 409 && refused.message === NOTHING_TO_REVIEW);
    check('and the quiz list has nothing to offer', ((await loadMissedQuestions(fakeClient(tables), 'S', ['A'])).get('A')?.size ?? 0) === 0);
  }

  console.log('\n=== review quiz: a question no longer on the quiz is not offered ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 2,
      pools: [{ name: 'Only', min: 1, count: 2 }],
      priorAttempt: { seenQuestionIds: ['q0', 'q1'], scores: [{ criteriaIndex: 0, score: 0, total: 2 }] },
    });
    tables.questions = tables.questions.filter((q) => q.id !== 'q1');
    const r = await selectQuestionsForAttempt(fakeClient(tables), { assessmentId: 'A', studentId: 'S', practice: true, rng: seeded(3) });
    check('only the question still there is served', r.questions.map((q) => q.id).join() === 'q0');
    check('the quiz list agrees', [...((await loadMissedQuestions(fakeClient(tables), 'S', ['A'])).get('A') ?? [])].join() === 'q0');
  }

  console.log('\n=== a quiz grade is the average of its graded tries ===');
  {
    check('5, 6 and 4 average to 5', quizGrade([5, 6, 4]) === 5);
    check('kept to two decimals', quizGrade([60, 80, 50]) === 63.33);
    check('a try with no score stays out', quizGrade([80, null, undefined]) === 80);
    check('no scored tries is no grade', quizGrade([]) === null && quizGrade([null]) === null);
  }

  console.log('\n=== every quiz has a limit, so every quiz reaches its review ===');
  {
    check('a student override wins', attemptLimit(3, 2) === 3);
    check('then the quiz', attemptLimit(null, 2) === 2);
    check('a quiz with none gets the standard', attemptLimit(null, null) === DEFAULT_ATTEMPTS);
    check('a try left is graded', !isPracticeRun(1, 2));
    check('with the tries used up, the next run is a review', isPracticeRun(2, 2));
    check('and on a quiz with no limit set, after the standard tries',
      isPracticeRun(DEFAULT_ATTEMPTS, attemptLimit(null, null)));
  }

  console.log('\n=== the size a graded paper holds, which a review is measured against ===');
  {
    const sized = (totalQuestions: number | null, count: number) =>
      buildFixture({ totalQuestions, pools: [{ name: 'Only', min: 1, count }] }).tables;
    check('the instructor\'s size', (await gradedPaperSize(fakeClient(sized(3, 5)), 'A')) === 3);
    check('never more than the bank holds', (await gradedPaperSize(fakeClient(sized(8, 5)), 'A')) === 5);
    check('the whole bank when no size is set', (await gradedPaperSize(fakeClient(sized(null, 5)), 'A')) === 5);
  }

  console.log('\n=== BKT update rules match ml/app/bkt.py ===');
  {
    const near = (a: number, b: number) => Math.abs(a - b) < 5e-5;
    check('a right answer from P(L0) = 0.3', near(updateMastery(0.3, true, DEFAULT_BKT), 0.6927));
    check('a wrong answer from P(L0) = 0.3', near(updateMastery(0.3, false, DEFAULT_BKT), 0.1458));
    check('right, wrong, right ends at 0.6906', near(traceMastery(DEFAULT_BKT, [true, false, true]), 0.6906));
    check('first prediction is 0.41', near(predictCorrect(DEFAULT_BKT.p_init, DEFAULT_BKT), 0.41));
    check('no answers leaves P(L0)', traceMastery(DEFAULT_BKT, []) === DEFAULT_BKT.p_init);
  }

  console.log('\n=== a review serves what was missed; a graded retake prefers unseen ===');
  {
    const fixture = () =>
      buildFixture({
        totalQuestions: 4,
        pools: [{ name: 'Only', min: 1, count: 6 }],
        priorAttempt: {
          seenQuestionIds: ['q0', 'q1', 'q2', 'q3'],
          scores: [{ criteriaIndex: 0, score: 100, total: 4 }],
          wrongQuestionIds: ['q1', 'q2'],
        },
      }).tables;
    const practice = await selectQuestionsForAttempt(fakeClient(fixture()), {
      assessmentId: 'A', studentId: 'S', practice: true, rng: seeded(3),
    });
    const graded = await selectQuestionsForAttempt(fakeClient(fixture()), {
      assessmentId: 'A', studentId: 'S', rng: seeded(3),
    });
    const ids = (r: SelectionResult) => new Set(r.questions.map((q) => q.id));
    check('a review serves both missed questions and no others',
      ids(practice).size === 2 && ids(practice).has('q1') && ids(practice).has('q2'));
    check('a graded retake serves both unseen questions', ids(graded).has('q4') && ids(graded).has('q5'));
  }

  console.log('\n=== another quiz on the same skill counts toward mastery ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 8,
      pools: [
        { name: 'Skill 1-1', min: 1, count: 6, skill: '1-1' },
        { name: 'Skill 1-2', min: 1, count: 6, skill: '1-2' },
      ],
      priorAttempt: {
        // one wrong on this quiz, on each skill
        seenQuestionIds: ['q0', 'q1', 'q6', 'q7'],
        scores: [
          { criteriaIndex: 0, score: 50, total: 2 },
          { criteriaIndex: 1, score: 50, total: 2 },
        ],
      },
      otherQuiz: { '1-1': [true, true, true], '1-2': [false, false, false] },
    });
    const r = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A', studentId: 'S', practice: true, rng: seeded(5),
    });
    const [a, b] = r.allocations;
    console.log(`   1-1 mastery ${a.mastery?.toFixed(3)}, 1-2 mastery ${b.mastery?.toFixed(3)}, paper ${r.questions.map((q) => q.id).join()}`);
    check('the skill missed on the other quiz has lower mastery', (b.mastery ?? 1) < (a.mastery ?? 0));
    check('and comes first in the review', r.questions[0].criteria_id === 'c1');
    check('the other quiz adds nothing to this review', r.questions.every((q) => q.id.startsWith('q')));
  }

  console.log('\n=== an expired attempt is not history ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 8,
      pools: [
        { name: 'Strong', min: 1, count: 6 },
        { name: 'Weak', min: 1, count: 6 },
      ],
      priorAttempt: { status: 'expired', seenQuestionIds: ['q0'], scores: [] },
    });
    const r = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A',
      studentId: 'S',
      rng: seeded(7),
    });
    check('dealt as a first attempt', r.attemptNumber === 1 && r.allocations.every((a) => a.weakness === null));
  }

  console.log('\n=== edge: minimums exceed the paper ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 3,
      pools: [
        { name: 'A', min: 4, count: 5 },
        { name: 'B', min: 4, count: 5 },
      ],
    });
    const r = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A',
      studentId: 'S',
      rng: seeded(3),
    });
    check('paper stays the requested size', r.questions.length === 3);
    check('both criteria still represented', r.allocations.every((a) => a.allocated > 0));
  }

  console.log('\n=== edge: total_questions null serves the whole bank ===');
  {
    const { tables } = buildFixture({
      totalQuestions: null,
      pools: [{ name: 'Only', min: 1, count: 5 }],
    });
    const r = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A',
      studentId: 'S',
      rng: seeded(5),
    });
    check('serves all 5', r.questions.length === 5);
  }

  console.log('\n=== randomisation: two runs differ in order ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 10,
      pools: [
        { name: 'A', min: 1, count: 5 },
        { name: 'B', min: 1, count: 5 },
      ],
    });
    const a = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A', studentId: 'S', rng: seeded(11),
    });
    const b = await selectQuestionsForAttempt(fakeClient(tables), {
      assessmentId: 'A', studentId: 'S', rng: seeded(29),
    });
    check('order differs between sittings',
      a.questions.map((q) => q.id).join() !== b.questions.map((q) => q.id).join());
    check('same seed reproduces the paper',
      (await selectQuestionsForAttempt(fakeClient(tables), {
        assessmentId: 'A', studentId: 'S', rng: seeded(11),
      })).questions.map((q) => q.id).join() === a.questions.map((q) => q.id).join());
  }

  // ---------- against the real database ----------
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('\n=== real data === skipped (no Supabase credentials)');
    console.log(failures === 0 ? '\nAll synthetic checks passed.' : `\n${failures} CHECK(S) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  }

  console.log('\n=== real data ===');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, title, total_questions, is_published')
    .order('title');
  const { data: student } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'student')
    .limit(1)
    .maybeSingle();

  for (const a of assessments ?? []) {
    try {
      const r = await selectQuestionsForAttempt(supabase, {
        assessmentId: a.id,
        studentId: student!.id,
      });
      const runs = longestRun(r);
      const short = r.allocations.filter((x) => x.allocated < Math.min(x.min_questions, x.pool));
      console.log(
        `  ${a.title}: ${r.questions.length} q, attempt #${r.attemptNumber}, longest run ${runs}, ` +
          `unassigned excluded ${r.excludedUnassigned}`,
      );
      console.log(
        '      ' + r.allocations.map((x) => `${x.name}=${x.allocated}/${x.pool}`).join('  '),
      );
      check(`${a.title}: minimums met`, short.length === 0);
      check(`${a.title}: no duplicates`,
        new Set(r.questions.map((q) => q.id)).size === r.questions.length);
    } catch (err) {
      // A draft with nothing in it yet isn't broken: no student can reach it,
      // and publishing validates it first. A published one is a real failure.
      if (err instanceof SelectionError && !a.is_published) {
        console.log(`  ${a.title}: skipped, unpublished draft (${err.message})`);
        continue;
      }
      console.log(`  ${a.title}: ERROR ${(err as Error).message}`);
      failures++;
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
