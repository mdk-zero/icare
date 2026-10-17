/**
 * Behavioural checks for Patient Case checklist scoring, N/A in particular:
 * an N/A row is in neither the points earned nor the points possible, and a
 * task that is N/A throughout drops out of the grade. Covers the shared
 * scoring (task-ratings) and the review page's sheet helpers (grading).
 * There is no test runner in this repo.
 *
 *   npx tsx scripts/check-checklist-ratings.ts
 *
 * Exits non-zero if any expectation fails.
 */
import {
  gradedScore,
  isChecklistRating,
  isTaskRating,
  ratingLabel,
  resolveStepRatings,
  storedRating,
  taskCredit,
  taskLevelForCredit,
  type ChecklistRating,
} from '../app/lib/task-ratings';
import { outOfGrade, taskLevel, taskPoints, withRating, withStepChanges } from '../app/faculty/scenarios/review/grading';
import type { GradingTask } from '../app/lib/api';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);
const near = (label: string, got: number | null, want: number) =>
  check(label, got !== null && Math.abs(got - want) < 1e-9, `got ${got}`);

console.log('parsing');
eq('N/A is a checklist rating', isChecklistRating('not_applicable'), true);
eq('N/A is not a case-presentation level', isTaskRating('not_applicable'), false);
eq('levels are checklist ratings', isChecklistRating('satisfactory'), true);
eq('junk is not', isChecklistRating('bogus'), false);
eq('stored N/A reads back', storedRating('not_applicable'), 'not_applicable');
eq('label', ratingLabel('not_applicable'), 'N/A');

console.log('taskCredit');
const steps = (total: number, ratings: ChecklistRating[]) => ({ total, ratings });
near('N/A step leaves the denominator', taskCredit(undefined, steps(3, ['excellent', 'excellent', 'not_applicable'])), 1);
near('N/A + needs practice', taskCredit(undefined, steps(2, ['needs_practice', 'not_applicable'])), 1 / 3);
near('unrated still counts zero beside N/A', taskCredit(undefined, steps(3, ['excellent', 'not_applicable'])), 1 / 2);
eq('every step N/A → out of the score', taskCredit(undefined, steps(2, ['not_applicable', 'not_applicable'])), null);
eq('whole task N/A → out of the score', taskCredit({ rating: 'not_applicable' }, undefined), null);
near('no N/A unchanged', taskCredit(undefined, steps(2, ['excellent', 'satisfactory'])), (1 + 2 / 3) / 2);
eq('no completion still 0', taskCredit(undefined, undefined), 0);
eq('unrated completion still full', taskCredit({ rating: null }, undefined), 1);
eq('level of an N/A task', taskLevelForCredit(null), 'not_applicable');
eq('level of a scored task', taskLevelForCredit(1), 'excellent');

console.log('gradedScore');
const tasks = [
  { id: 'a', points: 10 },
  { id: 'b', points: 30 },
];
eq(
  'N/A task drops out, the rest fill its weight',
  gradedScore(tasks, new Map([['a', { rating: 'excellent' as const }], ['b', { rating: 'not_applicable' as const }]])),
  100,
);
eq(
  'partly N/A task keeps its weight',
  gradedScore(
    tasks,
    new Map([['a', { rating: 'excellent' as const }]]),
    new Map([['b', steps(2, ['needs_practice', 'not_applicable'])]]),
  ),
  Math.round(((10 + 30 / 3) / 40) * 100),
);
eq(
  'everything N/A scores 0, not NaN',
  gradedScore(tasks, new Map([['a', { rating: 'not_applicable' as const }], ['b', { rating: 'not_applicable' as const }]])),
  0,
);

console.log('resolveStepRatings');
eq(
  'a whole-task N/A writes the other rows down as N/A',
  resolveStepRatings(['x', 'y'], new Map(), 'not_applicable', new Map([['x', 'excellent' as const]])),
  ['excellent', 'not_applicable'],
);

console.log('review sheet');
const task = (over: Partial<GradingTask>): GradingTask => ({
  id: 't',
  title: 'T',
  description: '',
  category: 'assessment',
  points: 10,
  verification: 'faculty',
  system_trigger: null,
  sort_order: 0,
  is_completed: false,
  completed_via: null,
  completed_at: null,
  rating: null,
  remarks: null,
  steps: [],
  ...over,
});
const withSteps = task({
  steps: ['s1', 's2', 's3'].map((id) => ({ id, title: id, source: '', rating: null })),
});
const graded = withStepChanges(
  withSteps,
  new Map<string, ChecklistRating>([
    ['s1', 'excellent'],
    ['s2', 'not_applicable'],
    ['s3', 'needs_practice'],
  ]),
);
// (3 + 1) of 6 points, 67%: Satisfactory. Counting the N/A row as zero would make it 44%.
eq('points skip the N/A row', taskPoints(graded), { earned: 4, max: 6 });
eq('task level ignores the N/A row', taskLevel(graded).level, 'satisfactory');
eq('task stored level', graded.rating, 'satisfactory');
eq('partly N/A is still graded', outOfGrade(graded), false);

const allNa = withStepChanges(
  withSteps,
  new Map<string, ChecklistRating>([
    ['s1', 'not_applicable'],
    ['s2', 'not_applicable'],
    ['s3', 'not_applicable'],
  ]),
);
eq('all N/A: out of the grade', outOfGrade(allNa), true);
eq('all N/A: no points either way', taskPoints(allNa), { earned: 0, max: 0 });
eq('all N/A: stored level is N/A', allNa.rating, 'not_applicable');
eq('all N/A: still counts as graded', allNa.is_completed, true);

const wholeNa = withRating(task({}), 'not_applicable');
eq('step-less task N/A: out of the grade', outOfGrade(wholeNa), true);
eq('step-less task N/A: no points', taskPoints(wholeNa), { earned: 0, max: 0 });
const cleared = withRating(wholeNa, null);
eq('clearing N/A returns it to unrated', [cleared.rating, outOfGrade(cleared)], [null, false]);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
