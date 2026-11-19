import { PASSING_SCORE } from './bands';
import type { TagCell } from './kit-ui';
import type { CriterionRow, QuizAnswerRow, QuizMatrixColumn, QuizMatrixRow } from './quiz-sheet';

/**
 * A quiz laid out for its question reports. Pure, so the server's report and
 * the demo's read the same rules.
 */
export interface QuizCriterion {
  id: string;
  name: string;
  /** Its share of the grade, in percent. */
  weight: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  /** The criterion the question is under now; a try keeps its own record of it. */
  criteriaId: string | null;
}

export interface QuizTry {
  /** 1 for the first graded try. */
  number: number;
  submittedAt: string | null;
  score: number | null;
  /** Questions served, in the order served. */
  served: string[];
  /** The criterion each served question was scored under on this try. */
  criteria: ReadonlyMap<string, string | null>;
  answers: ReadonlyMap<string, { selected: number | null; ok: boolean }>;
}

const optionText = (q: QuizQuestion, index: number | null) =>
  index === null || index === undefined || q.options[index] === undefined
    ? null
    : `${String.fromCharCode(65 + index)}. ${q.options[index]}`;

const criterionOf = (q: QuizQuestion, t: QuizTry | null) => (t?.criteria.has(q.id) ? t.criteria.get(q.id)! : q.criteriaId);

/** One try question by question, in the order the student saw them. */
export function answerRows(
  questions: readonly QuizQuestion[],
  criteria: readonly QuizCriterion[],
  tried: QuizTry,
): QuizAnswerRow[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const nameOf = new Map(criteria.map((c) => [c.id, c.name]));
  // A try with no record of what was served shows the questions answered.
  const ids = tried.served.length > 0 ? tried.served : [...tried.answers.keys()];
  return ids.flatMap((id, i) => {
    const q = byId.get(id);
    if (!q) return [];
    const a = tried.answers.get(id);
    const criterion = criterionOf(q, tried);
    return [
      {
        n: i + 1,
        question: q.text,
        criterion: criterion ? (nameOf.get(criterion) ?? null) : null,
        chosen: a ? optionText(q, a.selected) : null,
        correct: optionText(q, q.correctIndex),
        ok: a ? a.ok : null,
      },
    ];
  });
}

/** Where a quiz grade stands: Passed at the pass mark, Below passing under it, Not taken until a try is graded. */
export const quizRemark = (grade: number | null) => (grade === null ? 'Not taken' : grade >= PASSING_SCORE ? 'Passed' : 'Below passing');

/** The remark as a table cell: Passed green, Below passing red, Not taken muted. */
export function remarkCell(grade: number | null): TagCell {
  return { tag: quizRemark(grade), tone: grade === null ? 'muted' : grade >= PASSING_SCORE ? 'pass' : 'low' };
}

/**
 * A try's answers with the wrong and blank ones first, then the right ones,
 * each keeping the number it had when the student was served the questions.
 */
export function wrongFirst(rows: readonly QuizAnswerRow[]): QuizAnswerRow[] {
  return [...rows].sort((a, b) => Number(a.ok === true) - Number(b.ok === true) || a.n - b.n);
}

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);

/** Each member's latest graded try against every question of the quiz. */
export function matrix(
  questions: readonly QuizQuestion[],
  criteria: readonly QuizCriterion[],
  members: readonly { name: string; latest: QuizTry | null }[],
): { columns: QuizMatrixColumn[]; rows: QuizMatrixRow[] } {
  const nameOf = new Map(criteria.map((c) => [c.id, c.name]));
  const columns = members.map((m) => {
    const t = m.latest;
    const right = t ? [...t.answers.values()].filter((a) => a.ok).length : 0;
    const total = t ? (t.served.length > 0 ? t.served.length : t.answers.size) : 0;
    return { name: m.name, score: pct(t?.score ?? null), correct: t ? `${right}/${total}` : 'not taken' };
  });
  const rows = questions.map((q, i) => {
    const criterion = q.criteriaId ? (nameOf.get(q.criteriaId) ?? null) : null;
    return {
      n: i + 1,
      question: q.text,
      criterion,
      marks: members.map(({ latest }): QuizMatrixRow['marks'][number] => {
        if (!latest) return null;
        const a = latest.answers.get(q.id);
        if (a) return a.ok ? 'right' : 'wrong';
        return latest.served.includes(q.id) ? 'blank' : null;
      }),
    };
  });
  return { columns, rows };
}

/**
 * Questions answered right out of those asked, per criterion, over the given
 * tries (a student's graded tries, or one try per member for a group).
 */
function tally(questions: readonly QuizQuestion[], criterion: QuizCriterion, tries: readonly QuizTry[]) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  let right = 0;
  let total = 0;
  for (const t of tries) {
    for (const [id, a] of t.answers) {
      const q = byId.get(id);
      if (q && criterionOf(q, t) === criterion.id) {
        total += 1;
        if (a.ok) right += 1;
      }
    }
  }
  return { right, total };
}

const share = ({ right, total }: { right: number; total: number }) => Math.round((right / total) * 100);

/** One line for a student's wide column; a member's narrow one stacks the count over the percent. */
const cell = (t: { right: number; total: number }, stacked = false) =>
  t.total === 0 ? '—' : `${t.right}/${t.total}${stacked ? '\n' : ' · '}${share(t)}%`;

/** A student's results per criterion, over every graded try. */
export function criterionForStudent(
  questions: readonly QuizQuestion[],
  criteria: readonly QuizCriterion[],
  tries: readonly QuizTry[],
): CriterionRow[] {
  return criteria.map((c) => {
    const t = tally(questions, c, tries);
    return { name: c.name, weight: c.weight, cells: [cell(t)], share: t.total === 0 ? null : share(t) };
  });
}

/** Criteria with the lowest share first, those with no questions served last; the quiz's own order breaks ties. */
export function weakestFirst<T extends { share?: number | null }>(rows: readonly T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (a.row.share ?? 101) - (b.row.share ?? 101) || a.i - b.i)
    .map(({ row }) => row);
}

/** The whole class on each criterion, over every given try: questions right out of those served. Null when none were served. */
export function criterionForClass(
  questions: readonly QuizQuestion[],
  criteria: readonly QuizCriterion[],
  tries: readonly QuizTry[],
): { name: string; weight: number; score: number | null }[] {
  return criteria.map((c) => {
    const t = tally(questions, c, tries);
    return { name: c.name, weight: c.weight, score: t.total === 0 ? null : share(t) };
  });
}

/** A group's results per criterion: one column per member, from their latest try. */
export function criterionForGroup(
  questions: readonly QuizQuestion[],
  criteria: readonly QuizCriterion[],
  members: readonly { latest: QuizTry | null }[],
): CriterionRow[] {
  return criteria.map((c) => ({
    name: c.name,
    weight: c.weight,
    cells: members.map((m) => (m.latest ? cell(tally(questions, c, [m.latest]), true) : '—')),
  }));
}
