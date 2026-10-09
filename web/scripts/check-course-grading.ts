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
import { NO_FACTS, evaluate, type ItemProgress, type RequirementRow } from '../app/lib/course-progress';
import {
  addComponent,
  evenShares,
  flattenSplit,
  itemShares,
  withItemWeights,
  computeGrades,
  dropUnknown,
  fileItem,
  formatGrade,
  gradeLeafProblem,
  gradingLeaves,
  gradingSignature,
  gradingSummary,
  isGradeable,
  leafOf,
  parseGradeLeaf,
  parseGrading,
  presetSplit,
  readStoredSplit,
  baseMatches,
  refile,
  settle,
  type GradingSplit,
} from '../app/lib/course-grading';
import { seed } from '../app/lib/demo/fixtures';
import { afterItemSaved, followServer, saveBase, savedDraft, startDraft } from '../app/faculty/courses/grading-draft';
import {
  MigrationNeeded,
  REQUIREMENT_COLUMNS,
  isMissingGradingSchema,
  normaliseRequirement,
  requirementQuery,
  requirementWrite,
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
const sBig = split();
sBig.parts[0].components[0].weight = 105;
eq('weight over 100', err(sBig), '"Midterm" can be at most 100%');
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
eq('summary', [gradingSummary(split()), gradingSummary(null)], ['Written Exams 30% · Laboratory & Skills 70%', 'cleared']);
eq('leaf absent', parseGradeLeaf(undefined), { ok: true, value: undefined });
eq('leaf null unfiles', parseGradeLeaf(null), { ok: true, value: null });
eq('leaf empty string unfiles', parseGradeLeaf(''), { ok: true, value: null });
eq('leaf id', parseGradeLeaf('M'), { ok: true, value: 'M' });
eq('leaf junk', parseGradeLeaf(7), { ok: false, error: 'Choose what this counts toward' });

console.log('final review fixes');
// #4: sums are compared in hundredths, so 99.99 and 100.01 never slip through.
const two = (a: number, b: number) => ({
  parts: [
    { id: 'a', name: 'A', weight: a, items: [], components: [] },
    { id: 'b', name: 'B', weight: b, items: [], components: [] },
  ],
});
eq('99.99 refused', err(two(50, 49.99)), 'The parts add up to 99.99%, not 100%');
eq('100.01 refused', err(two(50, 50.01)), 'The parts add up to 100.01%, not 100%');
eq('99.99 refused (other split)', err(two(60.01, 39.98)), 'The parts add up to 99.99%, not 100%');
const sNear = split();
sNear.parts[0].components[1].weight = 14.99;
eq('component sum off by 0.01 refused', err(sNear), 'The components of "Written Exams" add up to 29.99%, not 30%');
check('thirds still save', parseGrading(thirds, reqs).ok);
// #3: ids no longer on the checklist are dropped before validating.
const sGone = split();
sGone.parts[1].items = [lab.id, 'gone'];
eq('dropUnknown removes stale ids', dropUnknown(sGone, reqs)?.parts[1].items, [lab.id]);
check('a stored split with a stale id can be saved once cleaned', parseGrading(dropUnknown(sGone, reqs), reqs).ok);
eq('dropUnknown keeps null', dropUnknown(null, reqs), null);
// #5: filing an item where it already is changes nothing.
const sTwo = split();
sTwo.parts[1].items = [lab.id, quizzes.id];
eq('re-filing in place keeps the order', fileItem(sTwo, lab.id, 'L').parts[1].items, [lab.id, quizzes.id]);
eq('re-filing in place keeps the signature', gradingSignature(refile(sTwo, lab, 'L')), gradingSignature(sTwo));
// #1/#2: the Grading draft follows the server only when the server's split changes.
const oldSplit = split();
const newSplit = split();
newSplit.parts[0].name = 'Exams';
const afterSave = savedDraft(startDraft(oldSplit), newSplit);
eq('a save is not undone while the refetch is pending', followServer(afterSave, oldSplit).draft?.parts[0].name, 'Exams');
eq('the refetch then confirms it', gradingSignature(followServer(afterSave, newSplit).draft), gradingSignature(newSplit));
const clean = startDraft(oldSplit);
eq('a clean draft follows a newer server split', followServer(clean, newSplit).draft?.parts[0].name, 'Exams');
const edited = { ...clean, draft: { parts: [{ ...oldSplit.parts[0], name: 'Mine' }, oldSplit.parts[1]] } };
const kept = followServer(edited, newSplit);
eq('unsaved edits survive a newer server split', kept.draft?.parts[0].name, 'Mine');
eq('…and keep their old base, so saving them is refused', kept.base, gradingSignature(oldSplit));

console.log('item changes during unsaved edits');
const sSettle = split();
sSettle.parts[1].items = [lab.id, shifts.id, 'gone', quizzes.id];
eq('settle drops removed and attendance ids, keeps order', settle(sSettle, reqs)?.parts[1].items, [lab.id, quizzes.id]);
eq('settle keeps null', settle(null, reqs), null);
eq('startDraft remembers where it began', startDraft(oldSplit).from, oldSplit);
eq('a clean draft adopting the server moves from', followServer(clean, newSplit).from, newSplit);
eq('a dirty draft keeps from', followServer(edited, newSplit).from, oldSplit);
eq('savedDraft moves from', savedDraft(edited, newSplit).from, newSplit);
const before = split();
const dirty = { ...startDraft(before), draft: { parts: [{ ...before.parts[0], name: 'Exams' }, before.parts[1]] } };
const reqsAfter = reqs.filter((r) => r.id !== quizB.id);
eq("after a removal, a dirty draft saves against the server's new split", saveBase(dirty, reqsAfter), gradingSignature(fileItem(before, quizB.id, null)));
check('a dirty draft holding a removed item still parses', parseGrading(settle(dirty.draft, reqsAfter), reqsAfter).ok);
const elsewhere: GradingSplit = { parts: [before.parts[0], { ...before.parts[1], name: 'Lab' }] };
check('a change made elsewhere still differs', saveBase(dirty, reqs) !== gradingSignature(elsewhere));
const toShift: RequirementRow = { ...quizB, kind: 'count', activity_type: 'shift', target_count: 4, assessment_id: null };
const reqsShift = reqs.map((r) => (r.id === quizB.id ? toShift : r));
eq('an item turned into attendance: the save base matches the server', saveBase(dirty, reqsShift), gradingSignature(refile(before, toShift, undefined)));
eq('…and the dirty draft unfiles it', leafOf(afterItemSaved(dirty, toShift, 'F').draft, quizB.id), null);
const fresh = req({ kind: 'manual', title: 'Final exam', manual_type: 'exam' });
const withNew = { ...dirty, draft: addComponent(dirty.draft!, 'W', { id: 'X', name: 'Practical', weight: 0, items: [] }) };
eq('a new item lands in an unsaved component', leafOf(afterItemSaved(withNew, fresh, 'X').draft, fresh.id), 'X');
eq('…and discarding the draft leaves it uncounted', leafOf(startDraft(before).draft, fresh.id), null);
const cleanBefore = startDraft(before);
check('a clean draft is left for the server to file', afterItemSaved(cleanBefore, fresh, 'M') === cleanBefore);

console.log('stale ids already in the stored split');
const ghosted: GradingSplit = { parts: [{ id: 'P', name: 'Exams', weight: 100, items: [quizA.id, lab.id, 'ghost'], components: [] }] };
const renamedGhost = { ...startDraft(ghosted), draft: { parts: [{ ...ghosted.parts[0], name: 'Exams 2' }] } };
check('a save over a stored stale id is accepted', baseMatches(saveBase(renamedGhost, reqs), ghosted, reqs));
check('…and so is clearing it', baseMatches(saveBase(startDraft(ghosted), reqs), ghosted, reqs));
check('a page still sending the raw signature is accepted', baseMatches(gradingSignature(ghosted), ghosted, reqs));
check('a removal made here is accepted', baseMatches(saveBase(dirty, reqsAfter), fileItem(before, quizB.id, null), reqsAfter));
check('a change made elsewhere is refused', !baseMatches(saveBase(renamedGhost, reqs), { parts: [{ ...ghosted.parts[0], name: 'Other' }] }, reqs));
check('junk is refused', !baseMatches(undefined, ghosted, reqs) && !baseMatches(42, ghosted, reqs));

console.log('demo fixtures');
const demo = seed();
const demoSplits = demo.offerings.filter((o) => o.grading);
eq('three demo courses have a split', demoSplits.length, 3);
for (const o of demoSplits) {
  const items = demo.requirements.filter((r) => r.offering_id === o.id);
  const parsedDemo = parseGrading(o.grading, items);
  check(`demo ${o.id} split is valid`, parsedDemo.ok, parsedDemo.ok ? '' : parsedDemo.error);
  eq(`demo ${o.id} files every gradeable item`, items.filter((r) => isGradeable(r) && leafOf(o.grading ?? null, r.id) === null).length, 0);
  check(`demo ${o.id} has a Written Exam`, items.some((r) => r.manual_type === 'exam'));
}
const examIds = new Set(demo.requirements.filter((r) => r.manual_type === 'exam').map((r) => r.id));
check('demo exams have entered scores', demo.requirementScores.some((sc) => examIds.has(sc.requirement_id)));
const handScored = demo.requirements.filter((r) => r.kind === 'manual' && r.manual_type === 'lab').map((r) => r.title);
eq('no hand-scored demo item is called a return demonstration', handScored.filter((t) => /return demonstration/i.test(t)), []);
const demoComponents = demoSplits.flatMap((o) => o.grading!.parts.flatMap((p) => p.components));
const returnDemos = demoComponents.filter((c) => /return demonstration/i.test(c.name));
check('a demo component is named Return demonstrations', returnDemos.length > 0);
check(
  '…and holds only Return Demonstrations (skill items)',
  returnDemos.every((c) => c.items.length > 0 && c.items.every((id) => demo.requirements.find((r) => r.id === id)?.kind === 'skill')),
);
// The ended term is a finished semester: every student's grade is complete, not "so far".
const today = new Date().toISOString().slice(0, 10);
const ended = demo.offerings.find((o) => demo.terms.find((t) => t.id === o.term_id)!.ends_on < today && o.grading);
check('the ended demo course has a split', !!ended);
if (ended) {
  const teamIds = new Set(demo.teams.filter((t) => t.faculty_id === ended.faculty_id && ended.section_ids.includes(t.section_id)).map((t) => t.id));
  const roster = demo.users.filter((u) => u.role === 'student' && u.team_id && teamIds.has(u.team_id)).map((u) => u.id);
  const items = demo.requirements.filter((r) => r.offering_id === ended.id);
  const term = demo.terms.find((t) => t.id === ended.term_id)!;
  const progress = evaluate(items, [], term, roster, { ...NO_FACTS, scores: demo.requirementScores });
  const { invalid, grades } = computeGrades(ended.grading ?? null, items, progress);
  check('the ended demo course has students', roster.length > 0);
  eq('every student in the ended demo course has a complete grade', invalid || roster.filter((id) => grades[id]?.grade === null || grades[id]?.scored_weight !== 100).length, 0);
  check('the ended demo course grades spread out', new Set(roster.map((id) => Math.round(grades[id]?.grade ?? 0))).size > 3);
}

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
  const { id: _id, offering_id: _o, position: _p, ...input } = { ...lab, manual_type: 'exam' as const };
  void [_id, _o, _p];
  eq('write keeps manual_type once 067 is live', requirementWrite(input, false).manual_type, 'exam');
  eq('legacy write drops manual_type', 'manual_type' in requirementWrite({ ...input, manual_type: 'lab' }, true), false);
  let examError: unknown = null;
  try {
    requirementWrite(input, true);
  } catch (e) {
    examError = e;
  }
  check(
    'legacy exam write needs 067',
    examError instanceof MigrationNeeded && examError.message === 'Written Exams need database migration 067 (course grading) applied first.',
  );
  const migration = new MigrationNeeded('needs 067');
  check('MigrationNeeded is an Error with its message', migration instanceof Error && migration.message === 'needs 067');
}

console.log('item shares (a part holds items straight away)');
{
  // The old Midterm 15 / Final 15 components become item shares, and grade the same.
  const flat = flattenSplit(split());
  eq('components move up into the part', flat.parts[0].items, [quizA.id, quizB.id]);
  eq('no components left', flat.parts.map((p) => p.components.length), [0, 0]);
  eq('each item takes its component percent', flat.parts[0].item_weights, { [quizA.id]: 15, [quizB.id]: 15 });
  const progressS = { S: { [quizA.id]: item({ best_score: 76 }), [quizB.id]: item(), [lab.id]: item({ best_score: 85 }) } };
  const before = computeGrades(split(), reqs, progressS).grades.S;
  const after = computeGrades(flat, reqs, progressS).grades.S;
  check('flattening keeps the grade', Math.abs((before?.grade ?? 0) - (after?.grade ?? 1)) < 1e-9, `got ${after?.grade}`);
  eq('flattening keeps the scored weight', after?.scored_weight, before?.scored_weight);
  eq('readStoredSplit flattens', readStoredSplit(split()), flat);

  // A component with no items: the part shares its whole percent evenly.
  const empty = split();
  empty.parts[0].components[1].items = [];
  eq('empty component falls back to an even split', flattenSplit(empty).parts[0].item_weights, undefined);

  eq('even shares add up', evenShares(['a', 'b', 'c'], 30), { a: 10, b: 10, c: 10 });
  eq('even shares carry the rounding', evenShares(['a', 'b', 'c'], 10), { a: 3.33, b: 3.33, c: 3.34 });
  eq('itemShares without set shares is even', itemShares({ id: 'P', name: 'P', weight: 30, items: ['a', 'b'], components: [] }), { a: 15, b: 15 });

  // Set shares must cover every item and add up to the part.
  const set = (weights: Record<string, number>): GradingSplit => ({
    parts: [
      withItemWeights({ id: 'W', name: 'Written Exams', weight: 30, items: [quizA.id, quizB.id], components: [] }, weights),
      { id: 'L', name: 'Laboratory & Skills', weight: 70, items: [lab.id], components: [] },
    ],
  });
  check('shares adding up are fine', parseGrading(set({ [quizA.id]: 10, [quizB.id]: 20 }), reqs).ok);
  const short = parseGrading(set({ [quizA.id]: 10, [quizB.id]: 10 }), reqs);
  eq('shares must add up to the part', short.ok ? null : short.error, 'The items in "Written Exams" add up to 20%, not 30%');
  const missing = parseGrading(set({ [quizA.id]: 30 }), reqs);
  eq('every item needs a share', missing.ok ? null : missing.error, 'Every item in "Written Exams" needs a percent');
  const zero = parseGrading(set({ [quizA.id]: 30, [quizB.id]: 0 }), reqs);
  eq('a share must be above 0', zero.ok ? null : zero.error, 'Each item in "Written Exams" needs a percent above 0');

  // Set shares weight the part grade: 10% at 50 and 20% at 80 is 70, not the plain mean 65.
  const weightedGrade = computeGrades(set({ [quizA.id]: 10, [quizB.id]: 20 }), reqs, {
    S: { [quizA.id]: item({ best_score: 50 }), [quizB.id]: item({ best_score: 80 }) },
  }).grades.S;
  eq('set shares weight the part', weightedGrade?.parts.W, 70);
  eq('scored weight counts scored items only', computeGrades(set({ [quizA.id]: 10, [quizB.id]: 20 }), reqs, {
    S: { [quizA.id]: item({ best_score: 50 }) },
  }).grades.S?.scored_weight, 10);

  // Filing or unfiling an item puts the part back on an even split.
  const moved = fileItem(set({ [quizA.id]: 10, [quizB.id]: 20 }), quizB.id, 'L');
  eq('losing an item resets the shares', moved.parts[0].item_weights, undefined);
  eq('gaining an item resets the shares', moved.parts[1].item_weights, undefined);
  const same = set({ [quizA.id]: 10, [quizB.id]: 20 });
  eq('refiling in place keeps the shares', fileItem(same, quizA.id, 'W').parts[0].item_weights, { [quizA.id]: 10, [quizB.id]: 20 });
  eq('settle resets a part that lost an item', settle(set({ [quizA.id]: 10, [quizB.id]: 20 }), [quizA, lab])?.parts[0]?.item_weights, undefined);
}

void fallbackChecks().then(() => {
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll checks passed');
});
