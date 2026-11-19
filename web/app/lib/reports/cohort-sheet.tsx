/**
 * The bodies of the Section, Group and Roster reports, shared by the real
 * builders and the demo's so both lay out the same page. Each takes students
 * with their pooled totals (view.ts) and draws tiles and a need-first table.
 * Free of server-only code: the callers do the reading.
 */
import { View, Text } from '@react-pdf/renderer';
import { PASSING_SCORE } from './bands';
import { ActivityTable, activityAhead, type GridEntry, type GridMember } from './activity-sheet';
import {
  FAINT,
  Note,
  ScoreKey,
  Section,
  StatGrid,
  Table,
  TEAL,
  countTile,
  type Cell,
  type Tile,
} from './kit-ui';
import { averageOf, orderByOverall, poolTotals, totalOf, workTiles, type KindTotals } from './view';
import type { WorkKind } from '../work-kinds';

/** A student's overall average, the Analytics way; null when nothing is graded. */
const overallOf = (totals: KindTotals) => averageOf(totalOf(totals));

/** "1 student", "12 students". */
const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Students whose overall average is under the pass mark, and how many have any graded work to judge. */
function belowPass(overalls: (number | null)[]) {
  const graded = overalls.filter((o): o is number => o !== null);
  return { below: graded.filter((o) => o < PASSING_SCORE).length, graded: graded.length };
}

const kindCell = (totals: KindTotals, kind: WorkKind): Cell => ({ score: averageOf(totals[kind]) });

// --- Section ----------------------------------------------------------------------------

/** What the model says of a student, from the latest prediction; only the Section report shows it. */
export type Prediction = 'at_risk' | 'on_track' | 'none';

export interface SectionStudent {
  name: string;
  /** Null for a student in no group. */
  group: string | null;
  totals: KindTotals;
  prediction: Prediction;
}

const PREDICTION_CELL: Record<Prediction, Cell> = {
  at_risk: { tag: 'Low performing', tone: 'low' },
  on_track: { tag: 'On track', tone: 'muted' },
  none: { tag: 'Not scored yet', tone: 'muted' },
};

export function SectionReportBody({
  students,
  groups,
  areas,
}: {
  students: SectionStudent[];
  /** Each group's members with the work given to them, groups and members in the order to print. */
  groups: { name: string; members: GridMember[] }[];
  /** Left out (undefined) where the data has no skill area ratings, as in the demo. */
  areas?: { name: string; ratings: number; mean: number | null }[];
}) {
  const pooled = poolTotals(students.map((s) => s.totals));
  const rows = students
    .map((s) => ({ s, overall: overallOf(s.totals) }))
    .sort((a, b) => orderByOverall(a.overall, b.overall) || a.s.name.localeCompare(b.s.name));
  const { below, graded } = belowPass(rows.map((r) => r.overall));
  const [overall, patientCases, returnDemos, , quizzes] = workTiles(pooled);
  const tiles: Tile[] = [
    countTile('Students', students.length),
    overall,
    countTile('Below 75%', below, `of ${graded} with graded work`),
    patientCases,
    returnDemos,
    quizzes,
  ];
  const weakest = [...(areas ?? [])].sort((a, b) => (a.mean ?? 101) - (b.mean ?? 101) || a.name.localeCompare(b.name));

  return (
    <>
      <StatGrid items={tiles} />

      <Section title="Students, lowest overall average first" caption="Below 75% first, then students with nothing graded yet, then the rest." />
      <Table
        head={[
          'Student',
          'Group',
          'Overall average',
          'Patient Cases',
          'Return Demos',
          'Case Pres.',
          'Quizzes',
          { label: 'Low performing', sub: 'Prediction, not a grade', align: 'left' },
        ]}
        widths={[150, 90, 110, 62, 62, 62, 62, 110]}
        rows={rows.map(({ s, overall: o }) => ({
          cells: [
            s.name,
            s.group ?? '—',
            { score: o, word: true },
            kindCell(s.totals, 'patient_case'),
            kindCell(s.totals, 'return_demo'),
            kindCell(s.totals, 'case_presentation'),
            kindCell(s.totals, 'quiz'),
            PREDICTION_CELL[s.prediction],
          ],
          tone: o !== null && o < PASSING_SCORE ? ('attention' as const) : undefined,
        }))}
        emptyText="No students in this section yet."
        caption="Prediction, not a grade: the Low performing flag is the model's estimate from each student's work so far."
      />

      {groups.length > 0 && (
        <>
          <Section
            title="Work by group"
            caption="Members A to Z, with the work given to each group. The average is in the table above."
            ahead={activityAhead(groups[0].members)}
          />
          {groups.map((g) => (
            <ActivityTable
              key={g.name}
              members={g.members}
              showAverage={false}
              heading={
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 3 }}>
                  <Text style={{ fontWeight: 700, color: TEAL }}>{g.name}</Text>
                  <Text style={{ fontSize: 8, color: FAINT }}>{countOf(g.members.length, 'member')}</Text>
                </View>
              }
            />
          ))}
        </>
      )}

      {areas && (
        <>
          <Section title="Skill areas, weakest first" caption="The mean of every rating the section's students have been given in each area." />
          <Table
            head={['Skill area', 'Ratings', 'Mean']}
            widths={[4, 1, 1]}
            rows={weakest.map((a) => [a.name, a.ratings, { score: a.mean }])}
            emptyText="No skill area ratings recorded for this section yet."
          />
        </>
      )}

      <Note>
        Overall average counts every graded piece of work for these students, with each quiz try on its own, so it matches the Analytics page.
        Below 75% counts students with graded work whose overall average is under the pass mark. The Low performing prediction is the model&apos;s
        estimate and is not part of any grade.
      </Note>
      <ScoreKey />
    </>
  );
}

// --- Group ------------------------------------------------------------------------------

export interface GroupMember {
  name: string;
  entries: GridEntry[];
  totals: KindTotals;
}

export function GroupReportBody({ members }: { members: GroupMember[] }) {
  const pooled = poolTotals(members.map((m) => m.totals));
  const ordered: (GridMember & { overall: number | null })[] = members
    .map((m) => ({ name: m.name, entries: m.entries, overall: overallOf(m.totals) }))
    .sort((a, b) => orderByOverall(a.overall, b.overall, true) || a.name.localeCompare(b.name))
    .map((m) => ({ ...m, average: m.overall, attention: m.overall !== null && m.overall < PASSING_SCORE }));
  const { below, graded } = belowPass(ordered.map((m) => m.overall));
  const [overall, patientCases, returnDemos, , quizzes] = workTiles(pooled);
  const tiles: Tile[] = [overall, countTile('Below 75%', below, `of ${graded} with graded work`), patientCases, returnDemos, quizzes];

  return (
    <>
      <StatGrid items={tiles} />
      <Section
        title="Work given to this group"
        caption="Members lowest overall average first, with nothing graded last. Rows below 75% are shaded."
        ahead={activityAhead(ordered)}
      />
      <ActivityTable members={ordered} showAverage showOpen />
      <Note>
        Average counts every graded piece of work for the member, with each quiz try on its own, so it can differ from the columns shown, where a
        quiz is its average grade. Open is how many of the member&apos;s activities are given but not graded yet. Only the work assigned to the
        group&apos;s members is listed.
      </Note>
      <ScoreKey />
    </>
  );
}

// --- Roster -----------------------------------------------------------------------------

export interface RosterStudent {
  name: string;
  section: string;
  group: string | null;
  totals: KindTotals;
}

export function RosterReportBody({ students }: { students: RosterStudent[] }) {
  const pooled = poolTotals(students.map((s) => s.totals));
  const rows = students
    .map((s) => ({ s, overall: overallOf(s.totals) }))
    .sort((a, b) => orderByOverall(a.overall, b.overall) || a.s.name.localeCompare(b.s.name));
  const { below } = belowPass(rows.map((r) => r.overall));
  const nothing = rows.filter((r) => r.overall === null).length;
  const [overall] = workTiles(pooled, { kinds: [] });

  return (
    <>
      <StatGrid items={[countTile('Students', students.length), overall, countTile('Below 75%', below), countTile('Nothing graded yet', nothing)]} />

      <Section title="Students, lowest overall average first" caption="Below 75% first, then students with nothing graded yet, then the rest." />
      <Table
        head={['Student', 'Section / Group', 'Overall', 'Patient Cases', 'Return Demos', 'Case Pres.', 'Quizzes', { label: 'Flag', align: 'left' }]}
        widths={[120, 100, 48, 46, 46, 46, 46, 80]}
        rows={rows.map(({ s, overall: o }) => [
          s.name,
          `${s.section} · ${s.group ?? 'No group'}`,
          { score: o },
          kindCell(s.totals, 'patient_case'),
          kindCell(s.totals, 'return_demo'),
          kindCell(s.totals, 'case_presentation'),
          kindCell(s.totals, 'quiz'),
          o === null ? { tag: 'Nothing graded', tone: 'muted' } : o < PASSING_SCORE ? { tag: 'Below 75%', tone: 'low' } : '',
        ])}
        emptyText="No students on your roster yet."
      />
      <Note>
        Overall average counts every graded piece of work, with each quiz try on its own, so it matches the Analytics page. Each kind is
        averaged the same way. A dash means nothing of that kind is graded yet.
      </Note>
      <ScoreKey />
    </>
  );
}
