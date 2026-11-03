/**
 * A quiz criterion's weight is its share of the quiz's questions: 4 of 10 is
 * 40%. The database keeps the stored weights to this rule (migration 089,
 * recompute_criteria_weights); the editor uses it to show the weights as
 * questions are added, before the next load. Keep the two in step.
 *
 * In hundredths, always totalling exactly 100: each share is rounded down
 * and the hundredths left over go to the largest remainders, ties to the
 * earlier criterion. A criterion with no questions weighs 0; with no
 * questions anywhere the criteria share 100 equally.
 */
export function criteriaWeights(pools: readonly number[]): number[] {
  const n = pools.length;
  if (n === 0) return [];
  const total = pools.reduce((sum, p) => sum + p, 0);
  const exact = pools.map((p) => (total === 0 ? 10000 / n : (p * 10000) / total));
  const base = exact.map(Math.floor);
  let leftOver = 10000 - base.reduce((sum, b) => sum + b, 0);
  const byRemainder = exact
    .map((e, i) => ({ i, remainder: e - base[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of byRemainder) {
    if (leftOver <= 0) break;
    base[i] += 1;
    leftOver -= 1;
  }
  return base.map((b) => b / 100);
}

/**
 * Provisional weight for a criterion being created: positive, so it passes
 * the pre-089 check too; the 089 trigger replaces it straight after insert.
 */
export const PROVISIONAL_CRITERION_WEIGHT = 1;
