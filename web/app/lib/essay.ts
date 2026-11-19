/**
 * Essay questions (097): the student writes the answer and the instructor
 * grades it, in points out of the question's own `points`.
 *
 * On a paper every other question is worth 1, as it always was, and an essay
 * is worth its points. So a quiz without essays scores exactly as before, and
 * a 10-point essay weighs as much as ten multiple-choice questions.
 *
 * Pure: shared by the student's submit, the instructor's grading and the UI.
 */

export const ESSAY = 'essay';

/** Points a new essay is worth until the instructor changes it. */
export const ESSAY_DEFAULT_POINTS = 10;

/** The longest essay a student can hand in, in characters. */
export const ESSAY_MAX_LENGTH = 5000;

/** The longest feedback an instructor can leave on one essay. */
export const ESSAY_FEEDBACK_MAX_LENGTH = 2000;

/**
 * The share of an essay's points that counts it as right wherever a quiz
 * answer is only right or wrong (mastery, the ML features, item analysis).
 * The same 75% that passes a quiz.
 */
export const ESSAY_PASS_SHARE = 0.75;

export const isEssay = (questionType: unknown) => questionType === ESSAY;

/** What a question is worth on a paper: an essay its own points, anything else 1. */
export function paperPoints(question: { question_type: string | null; points?: number | null }): number {
  if (!isEssay(question.question_type)) return 1;
  const points = Number(question.points);
  return Number.isInteger(points) && points >= 1 ? points : ESSAY_DEFAULT_POINTS;
}

/** One question on a graded paper: what it is worth and what it earned. */
export interface PaperItem {
  question_id: string;
  criteria_id: string | null;
  max: number;
  earned: number;
}

/** The paper's score out of 100, to two decimals. */
export function scorePaper(items: readonly PaperItem[]): number {
  const max = items.reduce((sum, i) => sum + i.max, 0);
  if (max <= 0) return 0;
  const earned = items.reduce((sum, i) => sum + i.earned, 0);
  return Math.round((earned / max) * 10000) / 100;
}

export interface CriterionRef {
  id: string;
  name: string;
  weight: number;
  competency_id: string | null;
}

export interface CriterionScore {
  criteria_id: string;
  criteria_name: string;
  weight: number;
  /** Points earned on the criterion's questions (a question each, without essays). */
  correct: number;
  /** Points those questions were worth. */
  total: number;
  score: number;
  weighted_score: number;
}

/**
 * Each criterion's share of the paper. A criterion owns its questions
 * outright; a review leaves out the criteria it didn't ask about, since a
 * skill left out of it isn't a 0%.
 */
export function scoreCriteria(
  items: readonly PaperItem[],
  criteria: readonly CriterionRef[],
  { practice = false }: { practice?: boolean } = {},
): CriterionScore[] {
  return criteria
    .map((c) => {
      const mine = items.filter((i) => i.criteria_id === c.id);
      const total = mine.reduce((sum, i) => sum + i.max, 0);
      const correct = mine.reduce((sum, i) => sum + i.earned, 0);
      const pct = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
      return {
        criteria_id: c.id,
        criteria_name: c.name,
        weight: c.weight,
        correct,
        total,
        score: pct,
        weighted_score: Math.round(pct * (c.weight / 100) * 100) / 100,
      };
    })
    .filter((c) => !practice || c.total > 0);
}

/** Whether a graded essay counts as right where answers are only right or wrong. */
export const essayCountsCorrect = (pointsAwarded: number, maxPoints: number) =>
  maxPoints > 0 && pointsAwarded / maxPoints >= ESSAY_PASS_SHARE;

/** An essay grade the instructor sent, checked: whole points from 0 to the essay's worth. */
export function validEssayPoints(value: unknown, maxPoints: number): number | null {
  const points = Number(value);
  return Number.isInteger(points) && points >= 0 && points <= maxPoints ? points : null;
}
