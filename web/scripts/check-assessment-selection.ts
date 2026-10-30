/**
 * Behavioural checks for app/lib/assessment-selection.ts.
 *
 * The allocation is the subtlest logic in the assessment stack — guaranteed
 * minimums, largest-remainder distribution under capacity limits, weakness
 * weighting, unseen-first picking, and an even interleave — and a mistake in
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
  selectQuestionsForAttempt,
  distribute,
  type SelectionResult,
} from '../app/lib/assessment-selection';
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
    /** 'practiced' is a practice run past the attempt limit (083). */
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

  console.log('\n=== retake: weak criterion should gain, unseen preferred ===');
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
    const strong = r.allocations[0];
    const weak = r.allocations[1];
    console.log(
      `   Strong: ${strong.allocated} (weakness ${strong.weakness}), Weak: ${weak.allocated} (weakness ${weak.weakness})`,
    );
    check('weak criterion is weighted higher', (weak.weakness ?? 0) > (strong.weakness ?? 0));
    check('weakness is 1 - BKT mastery', Math.abs((weak.weakness ?? 0) - (1 - (weak.mastery ?? 0))) < 1e-9);
    check('weak criterion gets more questions', weak.allocated > strong.allocated);
    // Unseen is preferred *within* a criterion, but allocation wins: Strong is
    // capped at 2 despite having 3 unseen, because the retake is meant to
    // concentrate on the weak criterion, not to maximise novelty.
    const unseenPool = { Strong: 3, Weak: 3 } as Record<string, number>;
    const perCriterion = r.allocations.every(
      (a) => a.unseen_used === Math.min(a.allocated, unseenPool[a.name]),
    );
    check('each criterion exhausts its unseen before repeating', perCriterion,
      r.allocations.map((a) => `${a.name} ${a.unseen_used} unseen of ${a.allocated}`).join(', '));
    const seen = new Set(['q0', 'q1', 'q2', 'q6', 'q7', 'q8']);
    const repeats = r.questions.filter((q) => seen.has(q.id)).length;
    check('repeats only appear once the unseen pool is dry', repeats === 3, `${repeats} repeats`);
  }

  console.log('\n=== practice run past the limit steers the next paper ===');
  {
    const { tables } = buildFixture({
      totalQuestions: 8,
      pools: [
        { name: 'Strong', min: 1, count: 6 },
        { name: 'Weak', min: 1, count: 6 },
      ],
      priorAttempt: {
        status: 'practiced',
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
    invariants(r, 8, 'after practice');
    check('a practice run counts as history', r.attemptNumber === 2);
    check('weak criterion gets more questions', r.allocations[1].allocated > r.allocations[0].allocated);
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

  console.log('\n=== practice re-asks what was missed; a graded retake prefers unseen ===');
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
    check('practice serves both missed questions', ids(practice).has('q1') && ids(practice).has('q2'));
    check('practice fills up with unseen ones', ids(practice).has('q4') && ids(practice).has('q5'));
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
        // all right on this quiz, on both skills
        seenQuestionIds: ['q0', 'q1', 'q6', 'q7'],
        scores: [
          { criteriaIndex: 0, score: 100, total: 2 },
          { criteriaIndex: 1, score: 100, total: 2 },
        ],
      },
      otherQuiz: { '1-1': [true, true, true], '1-2': [false, false, false] },
    });
    const r = await selectQuestionsForAttempt(fakeClient(tables), { assessmentId: 'A', studentId: 'S', rng: seeded(5) });
    const [a, b] = r.allocations;
    console.log(`   1-1 mastery ${a.mastery?.toFixed(3)} → ${a.allocated}, 1-2 mastery ${b.mastery?.toFixed(3)} → ${b.allocated}`);
    check('the skill missed on the other quiz has lower mastery', (b.mastery ?? 1) < (a.mastery ?? 0));
    check('and gets more of the paper', b.allocated > a.allocated);
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
    .select('id, title, total_questions')
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
