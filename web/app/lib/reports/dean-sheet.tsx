/**
 * The bodies of the four Dean reports (Instructors, Rooms, Users, Summary),
 * shared by the real builders and the demo's so both lay out the same page.
 * The callers read their own data into the plain rows below; nothing here
 * queries, and nothing is server-only. `now` is passed in so a wait of "5 days"
 * is worked out against the moment the report is made.
 */
import { Text } from '@react-pdf/renderer';
import { PASSING_SCORE, TONE } from './bands';
import { belowPass, overallOf } from './cohort-sheet';
import { Note, Attention, ScoreKey, Section, StatGrid, Table, countTile, scoreTile, styles, type Cell, type Tile } from './kit-ui';
import {
  DORMANT_DAYS,
  averageOf,
  dateLabel,
  daysSince,
  orderByOverall,
  poolTotals,
  totalOf,
  waitLabel,
  workTiles,
  type KindTotals,
} from './view';
import { WORK_KINDS } from '../work-kinds';

const counted = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A date set in muted type, for a column that is read last. */
const mutedDate = (value: string | null): Cell => ({ tag: dateLabel(value), tone: 'muted' });

/** What an "Awaiting grade" tile says under its figure. */
function awaitingCaption(awaiting: number, oldest: string | null, now: Date): string | undefined {
  if (awaiting === 0) return 'Nothing waiting';
  return oldest ? `Oldest: ${waitLabel(oldest, now)}` : undefined;
}

// --- Instructors -------------------------------------------------------------------------

/** One instructor's line in the All Instructors report and the Summary's workload table. */
export interface InstructorRow {
  name: string;
  groups: number;
  students: number;
  graded: number;
  awaiting: number;
  /** The earliest `submitted_at` of anything of theirs awaiting grade. */
  oldestAwaitingAt: string | null;
  lastLogin: string | null;
}

/** Across all instructors, each student and each piece of work counted once. */
export interface InstructorTotals {
  students: number;
  graded: number;
  awaiting: number;
  oldestAwaitingAt: string | null;
}

export function FacultyListBody({ rows, totals, now }: { rows: InstructorRow[]; totals: InstructorTotals; now: Date }) {
  const withoutGroup = rows.filter((r) => r.groups === 0).map((r) => r.name);
  const ordered = [...rows].sort((a, b) => b.awaiting - a.awaiting || a.name.localeCompare(b.name));
  return (
    <>
      <StatGrid
        items={[
          countTile('Awaiting grade', totals.awaiting, awaitingCaption(totals.awaiting, totals.oldestAwaitingAt, now), { emphasis: true }),
          countTile('No group yet', withoutGroup.length, 'instructors without a group', { color: withoutGroup.length > 0 ? TONE.practice : undefined }),
          countTile('Instructors', rows.length),
          countTile('Students', totals.students, 'supervised, each counted once'),
          countTile('Grades given', totals.graded),
        ]}
      />
      {rows.length > 0 && <Attention items={withoutGroup.length > 0 ? [`No group yet: ${withoutGroup.join(', ')}`] : []} clear="Every instructor has a group." />}

      <Section title="Instructors, most awaiting grade first" caption="Ties by name. Instructors with no group are shaded." />
      <Table
        head={['Instructor', 'Groups', 'Students', 'Graded', 'Awaiting', { label: 'Oldest waiting', align: 'left' }, { label: 'Last login', align: 'left' }]}
        widths={[3, 0.9, 1, 0.9, 1, 1.3, 1.4]}
        rows={ordered.map((r) => ({
          cells: [r.name, r.groups, r.students, r.graded, r.awaiting, waitLabel(r.oldestAwaitingAt, now), mutedDate(r.lastLogin)],
          tone: r.groups === 0 ? ('attention' as const) : undefined,
        }))}
        emptyText="No instructor accounts yet."
      />
      <Note>
        Students are each instructor&apos;s roster: their group members, plus whole sections and students added by hand on this semester&apos;s
        courses. Graded counts the Patient Cases, Return Demonstrations and Case Presentations they graded. Awaiting is work their students
        handed in that is not graded yet, and Oldest waiting is the longest any of it has waited. A shared student or piece of work is counted
        once in the tiles.
      </Note>
    </>
  );
}

/** What the single-instructor page and the instructor's User report both show. */
export interface InstructorFacts {
  groups: number;
  students: number;
  patientCasesGraded: number;
  returnDemosGraded: number;
  casesGraded: number;
  awaiting: number;
  oldestAwaitingAt: string | null;
}

export function instructorTiles(f: InstructorFacts, now: Date): Tile[] {
  return [
    countTile('Awaiting grade', f.awaiting, f.awaiting === 0 ? 'Nothing waiting' : undefined, { emphasis: true }),
    countTile('Groups', f.groups),
    countTile('Students', f.students),
    countTile(
      'Grades given',
      f.patientCasesGraded + f.returnDemosGraded + f.casesGraded,
      `${f.patientCasesGraded} Patient Cases · ${f.returnDemosGraded} Return Demos · ${f.casesGraded} Case Presentations`,
    ),
    countTile('Oldest waiting', waitLabel(f.oldestAwaitingAt, now)),
  ];
}

export interface SupervisedGroup {
  name: string;
  members: number;
  /** Members with at least one graded piece of work. */
  withWork: number;
  /** The members' totals, pooled. */
  totals: KindTotals;
}

export function FacultyOneBody({ facts, groups, now }: { facts: InstructorFacts; groups: SupervisedGroup[]; now: Date }) {
  const rows = groups
    .map((g) => ({ g, overall: overallOf(g.totals) }))
    .sort((a, b) => orderByOverall(a.overall, b.overall, true) || a.g.name.localeCompare(b.g.name, undefined, { numeric: true }));
  return (
    <>
      <StatGrid items={instructorTiles(facts, now)} />
      <Section title="Groups supervised, lowest average first" caption="Groups with nothing graded yet come last." />
      <Table
        head={['Group', 'Members', 'With graded work', 'Overall average']}
        widths={[3, 1, 1.6, 1.4]}
        rows={rows.map(({ g, overall }) => [g.name, g.members, `${g.withWork} of ${g.members}`, { score: overall }])}
        emptyText="Not supervising any group yet."
      />
      <Note>Overall average counts every graded piece of work from the group&apos;s members, with each quiz try on its own, so it matches the Analytics page.</Note>
      <ScoreKey />
    </>
  );
}

// --- Rooms -------------------------------------------------------------------------------

export interface RoomRow {
  name: string;
  number: string;
  capacity: number;
  occupied: number;
  /** As stored: active, inactive or maintenance. */
  status: string;
}

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isFull = (r: RoomRow) => r.capacity > 0 && r.occupied >= r.capacity;
const inUse = (r: RoomRow) => r.status === 'active';

/** Whole percent of places taken; null when there are no places. */
const utilisation = (occupied: number, capacity: number) => (capacity > 0 ? Math.round((occupied / capacity) * 100) : null);

export function RoomsListBody({ rooms }: { rooms: RoomRow[] }) {
  const capacity = rooms.reduce((n, r) => n + r.capacity, 0);
  const occupied = rooms.reduce((n, r) => n + r.occupied, 0);
  const util = utilisation(occupied, capacity);
  const full = rooms.filter((r) => inUse(r) && isFull(r)).length;
  const idle = rooms.filter((r) => !inUse(r)).length;
  const ordered = [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  return (
    <>
      <StatGrid
        items={[
          countTile('Utilisation', util === null ? '—' : `${util}%`, util === null ? 'No places yet' : `${occupied} of ${capacity} places occupied`, { emphasis: true }),
          countTile('Rooms', rooms.length, `${rooms.length - idle} active`),
          countTile('Full rooms', full, 'at capacity', { color: full > 0 ? TONE.practice : undefined }),
          countTile('Not active', idle, 'inactive or in maintenance', { color: idle > 0 ? TONE.practice : undefined }),
        ]}
      />
      <Section title="Rooms, by room number" caption="Full and inactive rooms are shaded." />
      <Table
        head={['Room', { label: 'Number', align: 'left' }, 'Capacity', 'Occupied', 'Free', { label: 'Status', align: 'left' }]}
        widths={[3, 1, 1, 1, 0.8, 1.2]}
        rows={ordered.map((r) => {
          const status: Cell = !inUse(r) ? { tag: capitalised(r.status), tone: 'muted' } : isFull(r) ? { tag: 'Full', tone: 'practice' } : 'Active';
          return {
            cells: [r.name, r.number, r.capacity, r.occupied, Math.max(0, r.capacity - r.occupied), status],
            tone: isFull(r) || !inUse(r) ? ('notice' as const) : undefined,
          };
        })}
        emptyText="No rooms created yet."
      />
      <Note>Occupied counts students currently assigned to the room. Free is capacity less occupied, never below zero.</Note>
    </>
  );
}

export interface Occupant {
  name: string;
  /** When the student was assigned (an ISO date). */
  since: string | null;
}

export function RoomOneBody({ capacity, occupants }: { capacity: number; occupants: Occupant[] }) {
  const occupied = occupants.length;
  const util = utilisation(occupied, capacity);
  const sorted = [...occupants].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <StatGrid
        items={[
          countTile('Capacity', capacity),
          countTile('Occupied', occupied, util === null ? undefined : `${util}% of capacity`, { emphasis: true }),
          countTile('Available', Math.max(0, capacity - occupied)),
        ]}
      />
      <Section title="Current occupants" caption="A to Z." />
      <Table head={['Student', 'Since']} widths={[3, 1.4]} rows={sorted.map((o) => [o.name, o.since ? dateLabel(o.since) : '—'])} emptyText="No students assigned to this room." />
    </>
  );
}

// --- Users -------------------------------------------------------------------------------

export interface AccountRow {
  name: string;
  email: string;
  /** The stored role: student, faculty, admin. */
  role: string;
  /** What the role is called on screen. */
  roleName: string;
  createdAt: string | null;
  lastLogin: string | null;
}

type AccountState = { state: 'never' } | { state: 'dormant'; idle: number } | { state: 'ok' };

function stateOf(lastLogin: string | null, now: Date): AccountState {
  const idle = daysSince(lastLogin, now);
  if (idle === null) return { state: 'never' };
  return idle >= DORMANT_DAYS ? { state: 'dormant', idle } : { state: 'ok' };
}

export function UsersListBody({ rows, now }: { rows: AccountRow[]; now: Date }) {
  const withState = rows.map((r) => ({ r, s: stateOf(r.lastLogin, now) }));
  const never = withState.filter((x) => x.s.state === 'never').length;
  const dormant = withState.filter((x) => x.s.state === 'dormant').length;
  // Never signed in first, then the longest since the last sign-in, then everyone else by name.
  const rank = (s: AccountState) => (s.state === 'never' ? 0 : s.state === 'dormant' ? 1 : 2);
  const ordered = [...withState].sort((a, b) => {
    const diff = rank(a.s) - rank(b.s);
    if (diff !== 0) return diff;
    if (a.s.state === 'dormant' && b.s.state === 'dormant' && a.s.idle !== b.s.idle) return b.s.idle - a.s.idle;
    return a.r.name.localeCompare(b.r.name);
  });
  return (
    <>
      <StatGrid
        items={[
          countTile('Students', rows.filter((r) => r.role === 'student').length),
          countTile('Instructors', rows.filter((r) => r.role === 'faculty').length),
          countTile('Never signed in', never, 'accounts', { emphasis: true, color: never > 0 ? TONE.practice : undefined }),
          countTile(`No sign-in ${DORMANT_DAYS}d+`, dormant, 'signed in before, not since'),
        ]}
      />
      <Section title="Accounts, needing a look first" caption={`Never signed in, then the longest without a sign-in over ${DORMANT_DAYS} days, then everyone else by name.`} />
      <Table
        head={['Account', { label: 'Role', align: 'left' }, { label: 'Joined', align: 'left' }, { label: 'Last login', align: 'left' }, { label: 'Flag', align: 'left' }]}
        widths={[3.4, 1.1, 1.3, 1.3, 1.5]}
        rows={ordered.map(({ r, s }) => [
          { text: r.name, sub: r.email },
          r.roleName,
          dateLabel(r.createdAt),
          mutedDate(r.lastLogin),
          s.state === 'never'
            ? { tag: 'Never signed in', tone: 'practice' as const }
            : s.state === 'dormant'
              ? { tag: `No sign-in ${s.idle}d`, tone: 'muted' as const }
              : '',
        ])}
        emptyText="No users yet."
      />
    </>
  );
}

export function UserOneBody({
  student,
  instructor,
  now,
}: {
  /** A student's graded work, pooled. */
  student?: KindTotals;
  instructor?: InstructorFacts;
  now: Date;
}) {
  if (student) {
    return (
      <>
        <StatGrid items={workTiles(student)} />
        <Note>
          This is a summary of the student&apos;s graded work. The full record, with courses, grades and skill areas, is the Student Progress Report.
        </Note>
        <ScoreKey />
      </>
    );
  }
  if (instructor) {
    return (
      <>
        <StatGrid items={instructorTiles(instructor, now)} />
        <Note>This is a summary of the instructor&apos;s load. The groups they supervise are in the Instructor Report.</Note>
      </>
    );
  }
  return <Text style={styles.empty}>This account has no grades or supervision to report.</Text>;
}

// --- Summary -----------------------------------------------------------------------------

export interface SummaryStudent {
  section: string;
  totals: KindTotals;
}

export interface SummaryInput {
  /** One entry per student in scope. Nothing here names a student. */
  students: SummaryStudent[];
  /** Section names to list even when they have no students. */
  sections: string[];
  instructors: InstructorRow[];
  awaiting: number;
  oldestAwaitingAt: string | null;
  /** Students on no instructor's roster; null where the scope has no limit. */
  notOnRoster: number | null;
  rooms: { count: number; capacity: number; occupied: number };
  now: Date;
}

export function SummaryBody({ students, sections, instructors, awaiting, oldestAwaitingAt, notOnRoster, rooms, now }: SummaryInput) {
  const pooled = poolTotals(students.map((s) => s.totals));
  const all = totalOf(pooled);
  const overall = averageOf(all);
  const { below, graded } = belowPass(students.map((s) => overallOf(s.totals)));

  const bySection = new Map<string, SummaryStudent[]>(sections.map((name) => [name, []]));
  for (const s of students) bySection.set(s.section, [...(bySection.get(s.section) ?? []), s]);
  const sectionRows = [...bySection.entries()]
    .map(([name, members]) => {
      const overalls = members.map((m) => overallOf(m.totals));
      return {
        name,
        count: members.length,
        overall: averageOf(totalOf(poolTotals(members.map((m) => m.totals)))),
        below: belowPass(overalls).below,
        none: overalls.filter((o) => o === null).length,
      };
    })
    .sort((a, b) => orderByOverall(a.overall, b.overall, true) || a.name.localeCompare(b.name, undefined, { numeric: true }));

  const workload = [...instructors].sort((a, b) => b.awaiting - a.awaiting || a.name.localeCompare(b.name));
  const util = utilisation(rooms.occupied, rooms.capacity);

  return (
    <>
      <StatGrid
        items={[
          scoreTile('Overall average', overall, overall === null ? 'Nothing graded yet' : `${counted(all.n, 'graded piece')}, ${counted(students.length, 'student')}`, { emphasis: true }),
          countTile('Below 75%', below, `of ${counted(graded, 'student')} with graded work`),
          countTile('Awaiting grade', awaiting, awaiting === 0 ? 'Nothing waiting' : 'handed in, not graded'),
          countTile('Oldest waiting', waitLabel(oldestAwaitingAt, now)),
          countTile('Not on a roster', notOnRoster ?? '—', notOnRoster === null ? undefined : 'students with no instructor'),
        ]}
      />

      <Section title="By kind" caption="Every graded piece of work, with each quiz try on its own." />
      <Table
        head={['Kind', 'Average', 'Graded', 'Students']}
        widths={[3, 2.2, 1, 1]}
        rows={WORK_KINDS.map(({ kind, label }) => [
          label,
          { score: averageOf(pooled[kind]), word: true },
          pooled[kind].n,
          students.filter((s) => s.totals[kind].n > 0).length,
        ])}
      />

      <Section title="By section, lowest average first" caption="Sections with nothing graded yet come last. Sections below 75% are shaded." />
      <Table
        head={['Section', 'Students', 'Overall average', 'Below 75%', 'No graded work']}
        widths={[3, 1, 1.5, 1.2, 1.4]}
        rows={sectionRows.map((r) => ({
          cells: [r.name, r.count, { score: r.overall }, r.below, r.none],
          tone: r.overall !== null && r.overall < PASSING_SCORE ? ('attention' as const) : undefined,
        }))}
        emptyText="No sections yet."
      />

      <Section title="Instructor workload" caption="Most awaiting grade first." />
      <Table
        head={['Instructor', 'Students', 'Awaiting grade', { label: 'Oldest waiting', align: 'left' }]}
        widths={[3, 1, 1.3, 1.4]}
        rows={workload.map((r) => [r.name, r.students, r.awaiting, waitLabel(r.oldestAwaitingAt, now)])}
        emptyText="No instructor accounts yet."
      />

      <Section title="Rooms" />
      <Table
        head={['Rooms', 'Capacity', 'Occupied', 'Utilisation']}
        widths={[3, 1, 1, 1.2]}
        rows={rooms.count === 0 ? [] : [[rooms.count, rooms.capacity, rooms.occupied, util === null ? '—' : `${util}%`]]}
        emptyText="No rooms created yet."
      />

      <Note>
        Averages count every graded piece of work for these students, with each quiz try on its own, so they match the Analytics page. Below 75% counts
        students with graded work whose overall average is under the pass mark. No student is named in this report.
      </Note>
      <ScoreKey />
    </>
  );
}
