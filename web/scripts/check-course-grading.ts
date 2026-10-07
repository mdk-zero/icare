/**
 * Behavioural checks for the grading split (app/lib/course-grading.ts): the
 * rules a split must keep (weights adding up, items only on leaves, never
 * attendance), the weighted grade with per-level rescaling, and the helpers
 * the routes and the Grading tab use.
 * There is no test runner in this repo.
 *
 *   npx tsx scripts/check-course-grading.ts
 *
 * Exits non-zero if any expectation fails.
 */
import type { ItemProgress, RequirementRow } from '../app/lib/course-progress';
import {
  addComponent,
  computeGrades,
  formatGrade,
  gradeLeafProblem,
  gradingLeaves,
  gradingSignature,
  leafOf,
  parseGrading,
  presetSplit,
  readStoredSplit,
  refile,
  type GradingSplit,
} from '../app/lib/course-grading';
import {
  MigrationNeeded,
  REQUIREMENT_COLUMNS,
  isMissingGradingSchema,
  normaliseRequirement,
  requirementQuery,
} from '../app/lib/course-schema';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

const blank = {
  offering_id: 'o',
  title: '',
  activity_type: null,
  scenario_id: null,
  assessment_id: null,
  presentation_id: null,
  target_count: null,
  skill_id: null,
  min_score: null,
  skills_only: false,
  manual_type: 'lab',
} as const;
let n = 0;
const req = (fields: Partial<RequirementRow> & Pick<RequirementRow, 'kind'>): RequirementRow => ({
  ...blank,
  id: `r${++n}`,
  position: n,
  ...fields,
});
const item = (over: Partial<ItemProgress> = {}): ItemProgress => ({
  done: false,
  source: null,
  current: 0,
  target: 1,
  done_at: null,
  best_score: null,
  avg_score: null,
  level: null,
  has_grade: false,
  entries: [],
  marked: false,
  note: null,
  ...over,
});

const quizA = req({ kind: 'activity', activity_type: 'assessment', assessment_id: 'qa' });
const quizB = req({ kind: 'activity', activity_type: 'assessment', assessment_id: 'qb' });
const lab = req({ kind: 'manual', title: 'Return demo' });
const shifts = req({ kind: 'count', activity_type: 'shift', target_count: 4 });
const quizzes = req({ kind: 'count', activity_type: 'assessment', target_count: 3 });
const reqs = [quizA, quizB, lab, shifts, quizzes];
const split = (): GradingSplit => ({
  parts: [
    {
      id: 'W',
      name: 'Written Exams',
      weight: 30,
      items: [],
      components: [
        { id: 'M', name: 'Midterm', weight: 15, items: [quizA.id] },
        { id: 'F', name: 'Final', weight: 15, items: [quizB.id] },
      ],
    },
    { id: 'L', name: 'Laboratory & Skills', weight: 70, items: [lab.id], components: [] },
  ],
});

console.log('computeGrades');
const r1 = computeGrades(split(), reqs, {
  S: { [quizA.id]: item({ best_score: 76 }), [quizB.id]: item(), [lab.id]: item({ best_score: 85 }) },
});
check('82.3 example (per-level rescale, not 83.4)', !r1.invalid && Math.abs((r1.grades.S?.grade ?? 0) - 82.3) < 1e-9, `got ${r1.grades.S?.grade}`);
eq('scored weight', r1.grades.S?.scored_weight, 85);
eq('part scores', r1.grades.S?.parts, { W: 76, L: 85 });
eq('component scores', r1.grades.S?.components, { M: 76, F: null });
eq('empty part drops out', computeGrades(split(), reqs, { S: { [lab.id]: item({ best_score: 85 }) } }).grades.S?.grade, 85);
eq('nothing scored', computeGrades(split(), reqs, { S: {} }).grades.S, {
  grade: null,
  scored_weight: 0,
  parts: { W: null, L: null },
  components: { M: null, F: null },
});
const withCount = split();
withCount.parts[1].items = [quizzes.id];
eq(
  'count uses avg_score',
  computeGrades(withCount, reqs, { S: { [quizzes.id]: item({ avg_score: 80, best_score: 99 }) } }).grades.S?.parts.L,
  80,
);
eq(
  'count with no work is unscored, not 0',
  computeGrades(withCount, reqs, { S: { [quizzes.id]: item({ avg_score: null }) } }).grades.S?.parts.L,
  null,
);
const withShift = split();
withShift.parts[1].items = [lab.id, shifts.id];
eq(
  'filed shift count ignored',
  computeGrades(withShift, reqs, {
    S: { [lab.id]: item({ best_score: 85 }), [shifts.id]: item({ current: 1, target: 4 }) },
  }).grades.S?.parts.L,
  85,
);
const withStale = split();
withStale.parts[1].items = [lab.id, 'gone'];
eq('stale id ignored', computeGrades(withStale, reqs, { S: { [lab.id]: item({ best_score: 85 }) } }).grades.S?.parts.L, 85);
const broken = split();
broken.parts[1].weight = 60;
eq('invalid split gives no grades', computeGrades(broken, reqs, { S: {} }), { invalid: true, grades: {} });
eq('no split', computeGrades(null, reqs, { S: {} }), { invalid: false, grades: {} });

console.log('parseGrading');
const err = (body: unknown) => {
  const p = parseGrading(body, reqs);
  return p.ok ? null : p.error;
};
check('valid split', parseGrading(split(), reqs).ok, String(err(split())));
eq('clear', parseGrading({ parts: [] }, reqs), { ok: true, value: null });
const thirds = {
  parts: [33.33, 33.33, 33.34].map((weight, i) => ({ id: `p${i}`, name: `P${i}`, weight, items: [], components: [] })),
};
check('thirds save', parseGrading(thirds, reqs).ok, String(err(thirds)));
const rounded = parseGrading(
  {
    parts: [
      { id: 'a', name: 'A', weight: 33.333, items: [], components: [] },
      { id: 'b', name: 'B', weight: 66.667, items: [], components: [] },
    ],
  },
  reqs,
);
eq('weights rounded to 2 decimals', rounded.ok && rounded.value?.parts.map((p) => p.weight), [33.33, 66.67]);
const s95 = split();
s95.parts[1].weight = 65;
eq('top sum', err(s95), 'The parts add up to 95%, not 100%');
const s25 = split();
s25.parts[0].components[1].weight = 10;
eq('part sum', err(s25), 'The components of "Written Exams" add up to 25%, not 30%');
const sOn = split();
sOn.parts[0].items = [lab.id];
sOn.parts[1].items = [];
eq('items on a split part', err(sOn), '"Written Exams" has components, so its items go in one of them');
const sDup = split();
sDup.parts[0].components[1].items = [quizA.id];
eq('filed twice', err(sDup), 'An item is filed twice');
const sUnknown = split();
sUnknown.parts[1].items = ['nope'];
eq('unknown item', err(sUnknown), "An item isn't on this checklist");
const sShift = split();
sShift.parts[1].items = [shifts.id];
eq('shift refused', err(sShift), "Attendance has no score, so it can't count toward the grade");
const sBlank = split();
sBlank.parts[0].name = '  ';
eq('blank name', err(sBlank), 'Every part and component needs a name');
const sSame = split();
sSame.parts[1].name = 'written exams';
eq('duplicate name', err(sSame), 'Two parts are both called "written exams"');
const sZero = split();
sZero.parts[0].components[0].weight = 0;
eq('zero weight', err(sZero), '"Midterm" needs a percent above 0');
eq(
  'too many parts',
  err({
    parts: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, weight: 100 / 11, items: [], components: [] })),
  }),
  'A split can have at most 10 parts',
);
eq('not a split', err({ parts: 'x' }), 'Invalid grading split');

console.log('helpers');
eq('leaves', gradingLeaves(split()), [
  { id: 'M', label: 'Written Exams › Midterm' },
  { id: 'F', label: 'Written Exams › Final' },
  { id: 'L', label: 'Laboratory & Skills' },
]);
eq('leafOf', leafOf(split(), quizA.id), 'M');
eq('leaf problem: split part', gradeLeafProblem(split(), 'W'), '"Written Exams" has components; pick one of them');
eq('leaf problem: unknown', gradeLeafProblem(split(), 'zzz'), 'That grading component no longer exists. Reload and try again.');
eq('refile moves', leafOf(refile(split(), quizA, 'F'), quizA.id), 'F');
eq(
  'refile unfiles attendance',
  leafOf(refile({ ...split(), parts: [{ ...split().parts[0] }, { ...split().parts[1], items: [shifts.id] }] }, shifts, 'L'), shifts.id),
  null,
);
eq('refile undefined leaves it', gradingSignature(refile(split(), quizA, undefined)), gradingSignature(split()));
const added = addComponent(split(), 'L', { id: 'R', name: 'Return demos', weight: 70, items: [] });
eq('first component takes the part items', [added.parts[1].items, added.parts[1].components[0].items], [[], [lab.id]]);
eq(
  'signature ignores key order',
  gradingSignature({ parts: [{ weight: 100, name: 'A', id: 'x', items: [], components: [] }] }),
  gradingSignature({ parts: [{ id: 'x', name: 'A', weight: 100, components: [], items: [] }] }),
);
eq('signature of null', gradingSignature(null), 'null');
eq('stored junk', readStoredSplit({ parts: 'x' }), null);
eq('preset', presetSplit(() => 'id').parts.map((p) => [p.name, p.weight]), [
  ['Written Exams', 30],
  ['Laboratory & Skills', 70],
]);
eq('format', [formatGrade(82.3456), formatGrade(100)], ['82.3%', '100%']);

async function fallbackChecks() {
  console.log('pre-067 fallback');
  const calls: string[] = [];
  const data = await requirementQuery((_columns, legacy) => {
    calls.push(legacy ? 'legacy' : 'full');
    return Promise.resolve(legacy ? { data: ['ok'], error: null } : { data: null, error: { code: '42703' } });
  });
  eq('retries without manual_type on 42703', [calls, data], [['full', 'legacy'], ['ok']]);
  let legacyColumns = '';
  await requirementQuery((columns, legacy) => {
    if (legacy) legacyColumns = columns;
    return Promise.resolve(legacy ? { data: 1, error: null } : { data: null, error: { code: 'PGRST204' } });
  });
  check('legacy columns drop manual_type', !legacyColumns.includes('manual_type') && legacyColumns.includes('skills_only'), legacyColumns);
  check('full columns name manual_type', REQUIREMENT_COLUMNS.endsWith(', manual_type'), REQUIREMENT_COLUMNS);
  let threw: unknown = null;
  try {
    await requirementQuery(() => Promise.resolve({ data: null, error: { code: '23505' } }));
  } catch (e) {
    threw = e;
  }
  eq('other errors throw', (threw as { code?: string } | null)?.code, '23505');
  eq('normalise', normaliseRequirement({ ...lab, manual_type: undefined, min_score: '75.00' }), { ...lab, min_score: 75, manual_type: 'lab' });
  check(
    'missing-grading codes',
    isMissingGradingSchema({ code: '42703' }) &&
      isMissingGradingSchema({ code: 'PGRST204' }) &&
      !isMissingGradingSchema({ code: '42P01' }) &&
      !isMissingGradingSchema(null),
  );
  const migration = new MigrationNeeded('needs 067');
  check('MigrationNeeded is an Error with its message', migration instanceof Error && migration.message === 'needs 067');
}

void fallbackChecks().then(() => {
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll checks passed');
});
