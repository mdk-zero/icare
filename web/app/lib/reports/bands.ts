/**
 * The score bands every report colours by, in one place so a tile, a table
 * cell, a bar and a checklist dot can never disagree. Pure, so the demo's
 * browser-built reports use it too. The cut-offs are the ones the Analytics
 * screens use; the tones are the darker ones that stay readable on white.
 */

/** The College's passing mark for Skill Assessments (see migration 015). */
export const PASSING_SCORE = 75;

/** Scenario grades below this read "Needs Practice" (task-ratings bands). */
export const NEEDS_PRACTICE_BELOW = 50;

export type ScoreBand = 'pass' | 'practice' | 'low';

export const TONE: Record<ScoreBand, string> = {
  pass: '#047857',
  practice: '#b45309',
  low: '#b91c1c',
};

/** Faint fills for a row that needs a look: red for low, amber for practice. */
export const TINT = { low: '#fef2f2', practice: '#fffbeb' } as const;

/** 75 and up passes, 50 to 74 needs practice, anything lower is low. */
export function scoreBand(score: number): ScoreBand {
  if (score >= PASSING_SCORE) return 'pass';
  if (score >= NEEDS_PRACTICE_BELOW) return 'practice';
  return 'low';
}

export function scoreColor(score: number): string {
  return TONE[scoreBand(score)];
}

/**
 * The colour of a checklist level (the keys of task-ratings), matching the
 * bands: Excellent is the pass tone, Satisfactory the practice one and Needs
 * Practice the low one. Not applicable is a neutral gray.
 */
export const LEVEL_COLOR: Record<string, string> = {
  excellent: TONE.pass,
  satisfactory: TONE.practice,
  needs_practice: TONE.low,
  not_applicable: '#6b7280',
};
