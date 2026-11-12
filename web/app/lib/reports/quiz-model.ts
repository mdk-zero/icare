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
        ok: a ? a.ok : null,
      },
    ];
  });
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

const cell = ({ right, total }: { right: number; total: number }) =>
  total === 0 ? '—' : `${right}/${total} · ${Math.round((right / total) * 100)}%`;

/** A student's results per criterion, over every graded try. */
export function criterionForStudent(
  questions: readonly QuizQuestion[],
  criteria: readonly QuizCriterion[],
  tries: readonly QuizTry[],
): CriterionRow[] {
  return criteria.map((c) => ({ name: c.name, weight: c.weight, cells: [cell(tally(questions, c, tries))] }));
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
    cells: members.map((m) => (m.latest ? cell(tally(questions, c, [m.latest])) : '—')),
  }));
}
