/**
 * The bodies of the Quiz Answers reports, for one student and for one group,
 * shared by the real builder and the demo's so both lay out the same page.
 * Free of server-only code.
 */
import { Text } from '@react-pdf/renderer';
import { Fragment } from 'react';
import { PASSING_SCORE } from './bands';
import { GRID_AHEAD, Note, ScoreKey, Section, StatGrid, Table, countTile, scoreTile, styles, type Cell } from './kit-ui';
import { CriterionTable, QuizAnswers, QuizMatrix } from './quiz-sheet';
import {
  answerRows,
  criterionForGroup,
  criterionForStudent,
  matrix,
  quizRemark,
  remarkCell,
  weakestFirst,
  wrongFirst,
  type QuizCriterion,
  type QuizQuestion,
  type QuizTry,
} from './quiz-model';
import { dateLabel } from './view';

const mean = (values: number[]) => (values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length));

/** The meta block of one student's quiz report. */
export const quizStudentMeta = (title: string, groupLabel: string) => [
  { label: 'Quiz', value: title },
  { label: 'Group', value: groupLabel },
];

export function QuizStudentBody({
  name,
  grade,
  taken,
  questions,
  criteria,
}: {
  name: string;
  /** The average of the graded tries; null until one is graded. */
  grade: number | null;
  taken: QuizTry[];
  questions: QuizQuestion[];
  criteria: QuizCriterion[];
}) {
  return (
    <>
      <StatGrid items={[scoreTile('Grade', grade, quizRemark(grade)), countTile('Tries', taken.length)]} />

      <Section title="Results by criterion, weakest first" caption="The share of each criterion's questions answered right, over every graded try." />
      <CriterionTable columns={['Correct']} rows={weakestFirst(criterionForStudent(questions, criteria, taken))} />

      {taken.length === 0 ? (
        <Text style={styles.empty}>{name} has not submitted a try yet.</Text>
      ) : (
        taken.map((t) => {
          const rows = answerRows(questions, criteria, t);
          const right = rows.filter((r) => r.ok === true).length;
          const missed = rows.length - right;
          const score = t.score === null ? '—' : `${Math.round(t.score)}%`;
          return (
            <Fragment key={t.number}>
              <Section
                title={`Try ${t.number} · ${score}${t.submittedAt ? ` · ${dateLabel(t.submittedAt)}` : ''}`}
                caption={`Correct ${right} of ${rows.length}.${missed > 0 ? ' Wrong and blank questions come first, then the right ones; each keeps its number from the quiz.' : ''}`}
              />
              <QuizAnswers rows={wrongFirst(rows)} />
            </Fragment>
          );
        })
      )}
      <Note>
        The grade is the average of the graded tries. Review tries past the limit are not graded and are not shown. Each question is shown as the
        student was served it.
      </Note>
      <ScoreKey />
    </>
  );
}

export interface QuizGroupMember {
  name: string;
  tries: number;
  /** The average of the graded tries; null until one is graded. */
  grade: number | null;
  /** Their latest graded try, for the question grid. */
  latest: QuizTry | null;
}

/** Graded members from the lowest grade up, then those who have not taken it. */
const byGrade = (a: QuizGroupMember, b: QuizGroupMember) => (a.grade ?? 101) - (b.grade ?? 101) || a.name.localeCompare(b.name);

export function QuizGroupBody({ members, questions, criteria }: { members: QuizGroupMember[]; questions: QuizQuestion[]; criteria: QuizCriterion[] }) {
  const grades = members.flatMap((m) => (m.grade === null ? [] : [m.grade]));
  const passed = grades.filter((g) => g >= PASSING_SCORE).length;
  const { columns, rows } = matrix(questions, criteria, members);
  const ordered = [...members].sort(byGrade);

  return (
    <>
      <StatGrid
        items={[
          countTile('Completed', grades.length, `of ${members.length} members`),
          scoreTile('Group average', mean(grades)),
          countTile('Passed', passed, `of ${grades.length} completed`),
        ]}
      />

      <Section title="Members, lowest grade first" caption="Members who have not taken the quiz come last." />
      <Table
        head={['Member', { label: 'Tries', align: 'center' }, 'Grade', { label: 'Remarks', align: 'left' }]}
        widths={[3, 1, 1.2, 1.6]}
        rows={ordered.map((m): Cell[] => [m.name, m.tries || '—', { score: m.grade }, remarkCell(m.grade)])}
      />

      <Section title="Results by criterion" ahead={GRID_AHEAD} />
      <CriterionTable columns={members.map((m) => m.name)} rows={criterionForGroup(questions, criteria, members)} />
      <Section title="Questions" ahead={GRID_AHEAD} />
      <QuizMatrix columns={columns} rows={rows} />
      <Note>Each member&apos;s latest graded try. A dash means the question was not served to that member.</Note>
      <ScoreKey />
    </>
  );
}
