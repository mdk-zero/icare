/**
 * The bodies of the two class reports, the Patient Case's and the Quiz's,
 * shared by the real builders and the demo's so both lay out the same page.
 * Each opens with tiles, shows how the class did, then lists the students.
 * Free of server-only code: the callers do the reading.
 */
import { Text, View } from '@react-pdf/renderer';
import { LEVEL_COLOR, PASSING_SCORE, TONE, scoreColor } from './bands';
import {
  Distribution,
  FAINT,
  HAIRLINE,
  MUTED,
  Note,
  ScoreKey,
  Section,
  StatGrid,
  Table,
  TEAL,
  countTile,
  scoreTile,
  styles,
  type Cell,
} from './kit-ui';
import { scaledGrade, scoreDescriptor } from '../task-ratings';
import { dateLabel } from './view';
import { remarkCell } from './quiz-model';
import type { SheetSkill } from './checklist-sheet';

const mean = (values: number[]) => (values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length));

const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// --- Bars ---------------------------------------------------------------------------------

export interface BarRow {
  name: string;
  /** Its share of the grade, in percent; left out where the rows have no weights. */
  weight?: number;
  /** A percent; null draws no bar and a dash. */
  score: number | null;
}

/**
 * Rows with a bar for each score, band-coloured, the shortest bar first when
 * the caller orders them so. A criterion or skill with no score yet is a dash.
 */
export function ScoreBars({ rows, nameLabel, weighted = false }: { rows: BarRow[]; nameLabel: string; weighted?: boolean }) {
  const label = [styles.tableHeadLabel];
  return (
    <View>
      <View style={styles.tableHead} fixed>
        <View style={[styles.tableCell, { flex: 3 }]}>
          <Text style={label}>{nameLabel}</Text>
        </View>
        {weighted && (
          <View style={[styles.tableCell, { flex: 0.8 }]}>
            <Text style={[styles.tableHeadLabel, { textAlign: 'right' }]}>Weight</Text>
          </View>
        )}
        <View style={[styles.tableCell, { flex: 3.4 }]}>
          <Text style={label}>Class score</Text>
        </View>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[styles.tableRow, { alignItems: 'center' }]} wrap={false}>
          <View style={[styles.tableCell, { flex: 3 }]}>
            <Text style={styles.tableText}>{r.name}</Text>
          </View>
          {weighted && (
            <View style={[styles.tableCell, { flex: 0.8 }]}>
              <Text style={[styles.tableText, { textAlign: 'right', color: MUTED }]}>{r.weight === undefined ? '—' : `${r.weight}%`}</Text>
            </View>
          )}
          <View style={[styles.tableCell, { flex: 3.4, flexDirection: 'row', alignItems: 'center' }]}>
            <View style={{ flex: 1, height: 6, backgroundColor: HAIRLINE, borderRadius: 3 }}>
              {r.score !== null && (
                <View style={{ width: `${Math.min(100, Math.max(r.score, 2))}%`, height: 6, borderRadius: 3, backgroundColor: scoreColor(r.score) }} />
              )}
            </View>
            <Text style={{ width: 38, textAlign: 'right', fontSize: 9.5, fontWeight: 700, color: r.score === null ? FAINT : scoreColor(r.score) }}>
              {r.score === null ? '—' : `${r.score}%`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Lowest score first; rows with no score last. The rows' own order breaks ties. */
function weakestRows<T extends { score: number | null }>(rows: readonly T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (a.row.score ?? 101) - (b.row.score ?? 101) || a.i - b.i)
    .map(({ row }) => row);
}

// --- Patient Case class ---------------------------------------------------------------------

export interface ScenarioStudent {
  name: string;
  group: string | null;
  /** As scenarioStatus words it: Performed, Awaiting grade, In progress, Overdue, Not started. */
  status: string;
  /** When it was handed in (an ISO date); null is a dash. */
  submitted: string | null;
  late: boolean;
  /** Null until graded. */
  score: number | null;
}

export interface ClassSkill {
  title: string;
  /** The skill's checklist grade (scaledGrade) over every graded checklist pooled; null when none were rated. */
  score: number | null;
}

/** Each checklist skill pooled across every graded checklist the sheet holds (a column each). */
export function classSkillScores(skills: readonly SheetSkill[]): ClassSkill[] {
  return skills.map((s) => {
    let earned = 0;
    let max = 0;
    for (const p of s.points) {
      if (p) {
        earned += p.earned;
        max += p.max;
      }
    }
    return { title: s.title, score: max > 0 ? scaledGrade(earned, max) : null };
  });
}

/** How many of the weakest skills the report names. */
const SKILLS_SHOWN = 5;

const STATUS_RANK: Record<string, number> = { 'Awaiting grade': 0, Performed: 1, Overdue: 2, 'In progress': 3, 'Not started': 4 };

/** Awaiting a grade first, then graded work from the lowest score up, then what is unfinished. */
function byNeed(a: ScenarioStudent, b: ScenarioStudent): number {
  const rank = (s: ScenarioStudent) => (s.score !== null ? 1 : (STATUS_RANK[s.status] ?? 4) === 0 ? 0 : 2);
  const diff = rank(a) - rank(b);
  if (diff !== 0) return diff;
  if (a.score !== null && b.score !== null) return a.score - b.score;
  return (STATUS_RANK[a.status] ?? 4) - (STATUS_RANK[b.status] ?? 4);
}

export function ScenarioReportBody({ students, skills }: { students: ScenarioStudent[]; skills: ClassSkill[] | null }) {
  const graded = students.flatMap((s) => (s.score === null ? [] : [s.score]));
  const awaiting = students.filter((s) => s.status === 'Awaiting grade').length;
  const levels = [
    { label: 'Excellent', color: LEVEL_COLOR.excellent },
    { label: 'Satisfactory', color: LEVEL_COLOR.satisfactory },
    { label: 'Needs Practice', color: LEVEL_COLOR.needs_practice },
  ].map((l) => ({ ...l, count: graded.filter((s) => scoreDescriptor(s) === l.label).length }));
  const rows = [...students].sort((a, b) => byNeed(a, b) || a.name.localeCompare(b.name));

  const scored = skills ? skills.filter((s) => s.score !== null) : [];
  const weakest = weakestRows(scored).slice(0, SKILLS_SHOWN);

  return (
    <>
      <StatGrid
        items={[
          countTile('Awaiting grade', awaiting, awaiting > 0 ? 'handed in, not graded' : undefined, { emphasis: awaiting > 0 }),
          countTile('Performed', graded.length, students.length ? `of ${students.length} assigned` : undefined),
          countTile('Assigned', students.length),
          scoreTile('Average grade', mean(graded)),
        ]}
      />

      <Section title="Grade levels" />
      {graded.length === 0 ? <Text style={styles.empty}>Nothing performed yet.</Text> : <Distribution segments={levels} />}

      <Section title="Students, awaiting grade first" caption="Then graded from the lowest score up, then what is unfinished." />
      <Table
        head={['Student', 'Group', 'Status', 'Performed', 'Grade']}
        widths={[2.4, 1.3, 1.3, 1.5, 1.9]}
        rows={rows.map((s): { cells: Cell[]; tone?: 'attention' } => ({
          cells: [
            s.name,
            s.group ?? '—',
            s.status === 'Overdue' ? { tag: s.status, tone: 'low' } : s.status,
            s.submitted ? { date: dateLabel(s.submitted), late: s.late } : '—',
            { score: s.score, word: true },
          ],
          tone: s.status === 'Overdue' ? 'attention' : undefined,
        }))}
        emptyText="This Patient Case has not been assigned yet."
      />

      {skills && students.length > 0 && (
        <>
          <Section
            title="Skills to review with the class"
            caption={
              scored.length > SKILLS_SHOWN
                ? `Showing the ${SKILLS_SHOWN} weakest of ${scored.length} skills, graded as the checklist grades them, over every graded checklist.`
                : 'Each skill graded as the checklist grades it, over every graded checklist, weakest first.'
            }
          />
          {weakest.length === 0 ? (
            <Text style={styles.empty}>No graded checklists yet.</Text>
          ) : (
            <ScoreBars rows={weakest.map((s) => ({ name: s.title, score: s.score }))} nameLabel="Skill" />
          )}
        </>
      )}

      <Note>
        Average grade is the mean of the graded Patient Cases. Grade levels use the same bands as the Excellent, Satisfactory and Needs Practice
        ratings on the grading sheet.
      </Note>
      <ScoreKey />
    </>
  );
}

// --- Quiz class -----------------------------------------------------------------------------

export interface AssessmentStudent {
  name: string;
  /** "No section" for a student in none. */
  section: string;
  /** Null for a student in no group. */
  group: string | null;
  /** Graded tries handed in. */
  tries: number;
  /** The average of the graded tries; null until one is graded. */
  grade: number | null;
  /** The latest graded try's date (an ISO date). */
  latest: string | null;
  late: boolean;
}

export interface AssessmentCriterion {
  name: string;
  weight: number;
  /** Questions right out of those served over every graded try; null when none were served. */
  score: number | null;
}

const NO_GROUP = 'Students not in a group';

/** The rows of the report's meta block, from the quiz's own settings. */
export function assessmentMeta(quiz: { timeLimitSeconds: number | null; maxAttempts: number | null }): { label: string; value: string }[] {
  return [
    { label: 'Passing grade', value: `${PASSING_SCORE}%` },
    { label: 'Time limit', value: quiz.timeLimitSeconds ? `${Math.round(quiz.timeLimitSeconds / 60)} min` : 'None' },
    { label: 'Tries allowed', value: String(quiz.maxAttempts ?? 1) },
  ];
}

/** Lowest grade first; a student who has not taken it last. Names break ties. */
const byGrade = (a: AssessmentStudent, b: AssessmentStudent) => (a.grade ?? 101) - (b.grade ?? 101) || a.name.localeCompare(b.name);

function summaryLine(list: readonly AssessmentStudent[]): string {
  const g = list.flatMap((r) => (r.grade === null ? [] : [r.grade]));
  const average = mean(g);
  return `${g.length} of ${list.length} completed, average ${average === null ? '—' : `${average}%`}, ${g.filter((x) => x >= PASSING_SCORE).length} passed`;
}

export function AssessmentReportBody({ students, criteria }: { students: AssessmentStudent[]; criteria: AssessmentCriterion[] }) {
  const grades = students.flatMap((r) => (r.grade === null ? [] : [r.grade]));
  const passed = grades.filter((g) => g >= PASSING_SCORE).length;
  const passRate = grades.length ? Math.round((passed / grades.length) * 100) : null;
  const bands = [
    { label: '75% and up', color: TONE.pass, count: passed },
    { label: '50 to 74%', color: TONE.practice, count: grades.filter((g) => g >= 50 && g < PASSING_SCORE).length },
    { label: 'below 50%', color: TONE.low, count: grades.filter((g) => g < 50).length },
  ];

  // Section, then group, in order; the students not in a group close their section.
  const bySection = new Map<string, AssessmentStudent[]>();
  for (const r of students) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
  const sections = [...bySection.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([section, list]) => {
      const byGroup = new Map<string, AssessmentStudent[]>();
      for (const r of list) byGroup.set(r.group ?? '', [...(byGroup.get(r.group ?? '') ?? []), r]);
      const groups = [...byGroup.entries()]
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })))
        .map(([group, members]) => ({ group, members: [...members].sort(byGrade) }));
      return { section, list, groups };
    });

  return (
    <>
      <StatGrid
        items={[
          scoreTile('Class average', mean(grades), undefined, { emphasis: true }),
          countTile('Pass rate', passRate === null ? '—' : `${passRate}%`, grades.length ? `${passed} of ${grades.length} at 75% and up` : 'No one has completed it'),
          countTile('Completed', grades.length, `of ${students.length} given the quiz`),
          countTile('Not started', students.length - grades.length),
        ]}
      />

      <Section title="Results by criterion, weakest first" caption="The shortest bars are the skills to review with the class." />
      {criteria.length === 0 ? (
        <Text style={styles.empty}>This quiz has no scoring criteria.</Text>
      ) : (
        <>
          <ScoreBars rows={weakestRows(criteria)} nameLabel="Criterion" weighted />
          <Note>The share of each criterion&apos;s questions the class answered right, over every graded try.</Note>
        </>
      )}

      <Section title="Grade distribution" />
      {grades.length === 0 ? <Text style={styles.empty}>No one has completed the quiz yet.</Text> : <Distribution segments={bands} />}

      {sections.length === 0 ? (
        <>
          <Section title="Students" />
          <Text style={styles.empty}>This quiz has not been given to anyone yet.</Text>
        </>
      ) : (
        sections.map((sec) => (
          <View key={sec.section}>
            {sec.groups.map(({ group, members }, gi) => (
              // A short group stays on one page, its heading with its students (the section's heading with its first group); a long one may run on.
              <View key={group || 'none'} style={{ marginBottom: 8 }} wrap={members.length > 20}>
                {gi === 0 && (
                  <Section title={`Section ${sec.section}`} caption={`${summaryLine(sec.list)}. Each group lists its lowest grade first, then those who have not taken it.`} />
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 3 }} wrap={false} minPresenceAhead={60}>
                  <Text style={{ fontWeight: 700, color: TEAL }}>{group || NO_GROUP}</Text>
                  <Text style={{ fontSize: 8, color: MUTED }}>{countOf(members.length, 'student')}</Text>
                </View>
                <Table
                  head={['Student', { label: 'Tries', align: 'center' }, 'Last submitted', 'Grade', { label: 'Remarks', align: 'left' }]}
                  widths={[2.6, 0.6, 1.8, 0.8, 1.2]}
                  rows={members.map((r): Cell[] => [
                    r.name,
                    r.tries || '—',
                    r.latest ? { date: dateLabel(r.latest), late: r.late } : '—',
                    { score: r.grade },
                    remarkCell(r.grade),
                  ])}
                />
              </View>
            ))}
          </View>
        ))
      )}
      <Note>
        A grade is the average of the student&apos;s graded tries; review quizzes don&apos;t count. Late marks a try handed in more than a minute past the
        time limit; it is still graded and counted.
      </Note>
      <ScoreKey />
    </>
  );
}
