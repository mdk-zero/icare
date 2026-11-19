/**
 * How a report writes dates and times, and the figures several reports share:
 * the totals behind every "Overall average", the need-first order, the tiles
 * and the attention box. Pure, so the demo's browser-built reports read the
 * same as the server's.
 */
import { scoreDescriptor } from '../task-ratings';
import { COMPETENT_AT } from '../return-demo-remarks';
import { WORK_KINDS, type WorkKind } from '../work-kinds';
import { NEEDS_PRACTICE_BELOW, PASSING_SCORE } from './bands';
import { scoreTile, type Tile } from './kit-ui';

/**
 * The College is in the Philippines. A server's own zone is UTC on Vercel,
 * which would print the generated time eight hours behind and move a date near
 * midnight to the wrong day.
 */
export const PH_TZ = 'Asia/Manila';

/** "Nov 19, 2026", or a dash when there is no date. */
export function dateLabel(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: PH_TZ });
}

/** "November 19, 2026 at 3:56 PM": when the report was generated. */
export function generatedStamp(now: Date): string {
  return now.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: PH_TZ });
}

// ---------------------------------------------------------------------------
// Totals: how every report reaches an "Overall average"
// ---------------------------------------------------------------------------

/**
 * Scores are added up, not averaged, so a class's figure is the mean of every
 * graded piece of work and not a mean of student means. That is how the
 * Analytics screens work it out (dw.fact_student_work, migration 085), so a
 * report never disagrees with the screen the reader just looked at.
 */
export interface Totals {
  sum: number;
  n: number;
}

export type KindTotals = Record<WorkKind, Totals>;

export const emptyTotals = (): KindTotals => ({
  patient_case: { sum: 0, n: 0 },
  return_demo: { sum: 0, n: 0 },
  case_presentation: { sum: 0, n: 0 },
  quiz: { sum: 0, n: 0 },
});

/**
 * Counts one graded piece of work. A Patient Case or Return Demonstration
 * counts once it is completed with a score, a Case Presentation once graded,
 * and every submitted quiz try counts on its own (practice runs do not).
 */
export function addScore(totals: KindTotals, kind: WorkKind, score: number): void {
  totals[kind].sum += score;
  totals[kind].n += 1;
}

/** Every kind together. */
export function totalOf(totals: KindTotals): Totals {
  return WORK_KINDS.reduce((all, { kind }) => ({ sum: all.sum + totals[kind].sum, n: all.n + totals[kind].n }), { sum: 0, n: 0 });
}

/** The average as a whole percent; null when nothing is graded, never 0. */
export function averageOf(t: Totals): number | null {
  return t.n === 0 ? null : Math.round(t.sum / t.n);
}

/** Several students' totals as one, for a group, a section or a roster. */
export function poolTotals(list: readonly KindTotals[]): KindTotals {
  const pooled = emptyTotals();
  for (const t of list) {
    for (const { kind } of WORK_KINDS) {
      pooled[kind].sum += t[kind].sum;
      pooled[kind].n += t[kind].n;
    }
  }
  return pooled;
}

/**
 * Student lists put whoever needs a look first. Below the pass mark come
 * first, lowest first; then (unless `nothingLast`) those with nothing graded,
 * who may only be new; then the rest, lowest first. Ties are left to the
 * caller's own order (names), which a stable sort keeps.
 */
export function orderByOverall(a: number | null, b: number | null, nothingLast = false): number {
  const rank = (s: number | null) => (s === null ? (nothingLast ? 3 : 1) : s < PASSING_SCORE ? 0 : 2);
  const diff = rank(a) - rank(b);
  if (diff !== 0) return diff;
  return a === null || b === null ? 0 : a - b;
}

// ---------------------------------------------------------------------------
// Need-first order, tiles and the attention box
// ---------------------------------------------------------------------------

/** A row of work for the need-first order. `stage` ranks an unfinished one: 0 awaiting grade, 1 in progress, 2 not started. */
export interface Actionable {
  overdue?: boolean;
  score: number | null;
  stage?: number;
}

/**
 * A comparator for a table of work: overdue first, then what is graded from
 * the lowest score up, then what is unfinished (awaiting a grade, in
 * progress, not started).
 */
export function orderForAction(a: Actionable, b: Actionable): number {
  const rank = (r: Actionable) => (r.overdue ? 0 : r.score !== null ? 1 : 2);
  const diff = rank(a) - rank(b);
  if (diff !== 0) return diff;
  if (a.score !== null && b.score !== null) return a.score - b.score;
  return (a.stage ?? 0) - (b.stage ?? 0);
}

const KIND_TILE: Record<WorkKind, string> = {
  patient_case: 'Patient Cases',
  return_demo: 'Return Demos',
  case_presentation: 'Case Presentations',
  quiz: 'Quizzes',
};

/** "4 of 5 graded", "6 tries": what a kind's tile says under its figure. */
function kindCaption(kind: WorkKind, graded: number, given: number | undefined): string {
  if (kind === 'quiz') return graded === 0 ? 'No tries yet' : `${graded} ${graded === 1 ? 'try' : 'tries'}`;
  if (given === 0) return 'None assigned';
  if (given !== undefined) return `${graded} of ${given} graded`;
  return graded === 0 ? 'Nothing graded yet' : `${graded} graded`;
}

export interface WorkTileOptions {
  /** How many of each kind were given, so a caption reads "4 of 5 graded". */
  assigned?: Partial<Record<WorkKind, number>>;
  /** Which kinds get a tile after the overall one; every kind by default. */
  kinds?: readonly WorkKind[];
}

/**
 * The overall average, then one tile per kind, all pooled from the totals.
 * The Student report and the Section, Group and Roster reports build their
 * tiles here, in the browser's demo too, so their figures cannot drift.
 */
export function workTiles(totals: KindTotals, opts: WorkTileOptions = {}): Tile[] {
  const all = totalOf(totals);
  const overall = averageOf(all);
  const tiles: Tile[] = [
    scoreTile('Overall average', overall, overall === null ? 'Nothing graded yet' : `${scoreDescriptor(overall)}, ${all.n} graded`, { emphasis: true }),
  ];
  for (const kind of opts.kinds ?? (['patient_case', 'return_demo', 'case_presentation', 'quiz'] as const)) {
    const { n } = totals[kind];
    tiles.push(scoreTile(KIND_TILE[kind], averageOf(totals[kind]), kindCaption(kind, n, opts.assigned?.[kind])));
  }
  return tiles;
}

/** What the attention box reads from one row of a student's work. */
export interface WorkFacts {
  kind: WorkKind;
  /** The row's own grade: a quiz's is the average of its tries. Null until graded. */
  score: number | null;
  overdue?: boolean;
  awaiting?: boolean;
  late?: boolean;
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The items for the "Needs attention" box, nonzero ones only: Patient Cases
 * and Case Presentations below 50%, Return Demonstrations not yet competent,
 * quizzes below the pass mark, then what is overdue, awaiting a grade or late.
 */
export function attentionItems(rows: readonly WorkFacts[]): string[] {
  const graded = (kind: WorkKind, test: (score: number) => boolean) =>
    rows.filter((r) => r.kind === kind && r.score !== null && test(r.score)).length;
  const low = (score: number) => score < NEEDS_PRACTICE_BELOW;
  const out: [number, string, string][] = [
    [graded('patient_case', low), 'Patient Case below 50%', 'Patient Cases below 50%'],
    [graded('case_presentation', low), 'Case Presentation below 50%', 'Case Presentations below 50%'],
    [graded('return_demo', (s) => s < COMPETENT_AT), 'Return Demonstration not yet competent', 'Return Demonstrations not yet competent'],
    [graded('quiz', (s) => s < PASSING_SCORE), 'quiz below 75%', 'quizzes below 75%'],
    [rows.filter((r) => r.overdue).length, 'overdue', 'overdue'],
    [rows.filter((r) => r.awaiting).length, 'awaiting grade', 'awaiting grade'],
    [rows.filter((r) => r.late).length, 'late', 'late'],
  ];
  return out.filter(([n]) => n > 0).map(([n, one, many]) => counted(n, one, many));
}
