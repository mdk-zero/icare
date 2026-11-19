/**
 * The body of a Student Progress Report, shared by the real builder and the
 * demo's so both lay out the same page: tiles, what needs attention, then one
 * block per course (its grade, its criteria, its work), work outside any
 * course, and the skill areas. Free of server-only code. The callers read
 * their own data into `StudentWorkItem`s and totals; nothing here queries.
 */
import { Text } from '@react-pdf/renderer';
import { Fragment } from 'react';
import { PASSING_SCORE } from './bands';
import {
  Attention,
  CourseBlock,
  CourseCriteriaNote,
  Note,
  ScoreKey,
  Section,
  StatGrid,
  Table,
  TableTitle,
  styles,
  type Cell,
  type Col,
  type CourseCriteriaEntry,
} from './kit-ui';
import { attentionItems, dateLabel, orderForAction, workTiles, type KindTotals } from './view';
import { competencyRemark, NOT_YET_COMPETENT } from '../return-demo-remarks';
import type { WorkKind } from '../work-kinds';

/** One piece of work given to the student, as a row of one of the work tables. */
export interface StudentWorkItem {
  kind: WorkKind;
  /** The course offering it was made for; null, or one the student is not in, files it under "outside their courses". */
  offering: string | null;
  title: string;
  /** "Performed", "Awaiting grade", "Overdue", "Not started" and so on. */
  status: string;
  /** When it was performed, presented or last submitted (an ISO date); null is a dash. */
  at: string | null;
  late: boolean;
  /** Its own grade: a quiz's is the average of its tries. Null until graded. */
  score: number | null;
  /** Submitted tries, for a quiz. */
  tries: number;
  overdue: boolean;
  awaiting: boolean;
  /** Ranks an unfinished row for orderForAction: 0 awaiting grade, 1 in progress, 2 not started. */
  stage: number;
}

export interface SkillAreaRating {
  name: string;
  /** The latest rating, as a percent. */
  latest: number;
  /** When it was given (an ISO date). */
  ratedAt: string | null;
}

interface TableSpec {
  kind: WorkKind;
  title: string;
  head: (string | Col)[];
  widths: number[];
  cells: (i: StudentWorkItem) => Cell[];
}

const when = (i: StudentWorkItem): Cell => (i.at ? { date: dateLabel(i.at), late: i.late } : '—');
const status = (i: StudentWorkItem): Cell => (i.overdue ? { tag: i.status, tone: 'low' } : i.status);

/** The work tables of a course, in the order the plan lists them. */
const TABLES: TableSpec[] = [
  {
    kind: 'patient_case',
    title: 'Patient Cases',
    head: ['Patient Case', 'Status', 'Performed', 'Grade'],
    widths: [3, 1.3, 1.7, 2],
    cells: (i) => [i.title, status(i), when(i), { score: i.score, word: true }],
  },
  {
    kind: 'return_demo',
    title: 'Return Demonstrations',
    head: ['Return Demonstration', 'Performed', 'Grade', 'Result'],
    widths: [3, 1.5, 2, 1.5],
    cells: (i) => [
      i.title,
      when(i),
      { score: i.score, word: true },
      i.score === null ? '—' : competencyRemark(i.score) === NOT_YET_COMPETENT ? { tag: NOT_YET_COMPETENT, tone: 'low' } : competencyRemark(i.score),
    ],
  },
  {
    kind: 'case_presentation',
    title: 'Case Presentations',
    head: ['Presentation', 'Status', 'Presented', 'Grade'],
    widths: [3, 1.3, 1.7, 2],
    cells: (i) => [i.title, status(i), when(i), { score: i.score, word: true }],
  },
  {
    kind: 'quiz',
    title: 'Quizzes',
    head: ['Quiz', 'Status', 'Last submitted', { label: 'Tries', align: 'center' }, 'Grade'],
    widths: [3, 1.2, 1.7, 0.7, 2],
    cells: (i) => [i.title, status(i), when(i), i.tries, { score: i.score, word: true }],
  },
];

/** The tables a set of work fills, each only if it has rows, with the rows need first. */
function WorkTables({ items }: { items: StudentWorkItem[] }) {
  return (
    <>
      {TABLES.map((t) => {
        const rows = items.filter((i) => i.kind === t.kind).sort(orderForAction);
        if (rows.length === 0) return null;
        return (
          <Fragment key={t.kind}>
            <TableTitle title={t.title} />
            <Table head={t.head} widths={t.widths} rows={rows.map((i) => ({ cells: t.cells(i), tone: i.overdue ? ('attention' as const) : undefined }))} />
          </Fragment>
        );
      })}
    </>
  );
}

export function StudentReportBody({
  totals,
  items,
  courses,
  areas,
}: {
  /** Every graded piece of work, pooled (view.ts). */
  totals: KindTotals;
  items: StudentWorkItem[];
  courses: CourseCriteriaEntry[];
  /** Left out (undefined) where the data has no skill area ratings, as in the demo. */
  areas?: SkillAreaRating[];
}) {
  const given = (kind: WorkKind) => items.filter((i) => i.kind === kind).length;
  const known = new Set(courses.map((c) => c.id));
  const outside = items.filter((i) => !i.offering || !known.has(i.offering));
  const weakestFirst = [...(areas ?? [])].sort((a, b) => a.latest - b.latest || a.name.localeCompare(b.name));

  return (
    <>
      <StatGrid
        items={workTiles(totals, {
          assigned: { patient_case: given('patient_case'), return_demo: given('return_demo'), case_presentation: given('case_presentation') },
        })}
      />
      <Attention items={attentionItems(items)} clear="Nothing outstanding." />

      <Section title="Courses and grades" caption="Work in each course is listed need first: overdue, then lowest grade, then unfinished." />
      {courses.length === 0 && <Text style={styles.empty}>Not on the roster of any course yet.</Text>}
      {courses.map((c) => {
        const own = items.filter((i) => i.offering === c.id);
        return (
          <CourseBlock key={c.id} entry={c}>
            {own.length === 0 ? (
              <Text style={styles.empty}>Nothing assigned to this student in this course yet.</Text>
            ) : (
              <WorkTables items={own} />
            )}
          </CourseBlock>
        );
      })}
      <CourseCriteriaNote courses={courses} />
      {outside.length > 0 && (
        <>
          <Section title="Work outside their courses" caption="Assigned to the student but made for no course they are on." />
          <WorkTables items={outside} />
        </>
      )}
      {items.length === 0 && courses.length === 0 && <Text style={styles.empty}>Nothing has been assigned to this student yet.</Text>}

      {areas && (
        <>
          <Section title="Skill areas, weakest first" caption="The student's latest rating in each area." />
          <Table
            head={['Skill area', 'Latest rating', 'Last rated']}
            widths={[3.4, 2, 1.6]}
            rows={weakestFirst.map((a) => [a.name, { score: a.latest, word: true }, a.ratedAt ? dateLabel(a.ratedAt) : '—'])}
            emptyText="No skill area ratings recorded yet."
          />
        </>
      )}

      <Note>
        Overall average counts every graded piece of work, with each quiz try on its own; review quizzes past the try limit are not counted. A
        quiz&apos;s own grade is the average of the student&apos;s graded tries. The pass mark is {PASSING_SCORE}%. Only work assigned to the
        student is listed.
      </Note>
      <ScoreKey />
    </>
  );
}
