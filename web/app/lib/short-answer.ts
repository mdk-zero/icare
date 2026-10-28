/**
 * Short answer questions work like identification: the student types the
 * answer, and it is right when it matches one of the accepted answers. The
 * accepted answers are kept in the question's `options`, with `correct_index`
 * 0, so they are never sent to the student before submitting.
 */

export const SHORT_ANSWER = 'short_answer';

/** How many filled options a question of this type needs: one accepted answer, or two choices. */
export const minOptions = (questionType: unknown) => (questionType === SHORT_ANSWER ? 1 : 2);

/** Lowercase, no punctuation, single spaces: "  Hypo-thermia. " reads as "hypo thermia". */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True when the typed answer matches any of the accepted answers. */
export function matchesShortAnswer(typed: string | null | undefined, accepted: unknown): boolean {
  if (!typed || !Array.isArray(accepted)) return false;
  const answer = normalizeAnswer(typed);
  if (!answer) return false;
  return accepted.some((a) => typeof a === 'string' && normalizeAnswer(a) === answer);
}

/**
 * A short answer question's accepted answers. Questions the lesson generator
 * made before answers were kept in `options` only have "Expected answer: X"
 * in their explanation, so that is read as the fallback.
 */
export function acceptedAnswers(options: unknown, explanation: unknown): string[] {
  const listed = Array.isArray(options)
    ? options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    : [];
  if (listed.length > 0) return listed;
  if (typeof explanation !== 'string') return [];
  const m = /expected answer:\s*(.+?)(?:\s+[—–-]\s+|\n|$)/i.exec(explanation);
  return m ? [m[1].trim()] : [];
}
