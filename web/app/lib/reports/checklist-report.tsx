/**
 * The bodies of the Patient Case and Return Demonstration checklist reports,
 * for one student and for one group, shared by the real builder and the
 * demo's so both lay out the same page. Free of server-only code.
 */
import { PASSING_SCORE, TONE } from './bands';
import { Attention, GRID_AHEAD, Note, ScoreKey, Section, StatGrid, Table, countTile, scoreTile, type Cell } from './kit-ui';
import { ChecklistSheet, type SheetSkill } from './checklist-sheet';
import { competencyRemark, COMPETENT, NOT_YET_COMPETENT } from '../return-demo-remarks';
import { dateLabel } from './view';
import type { ScenarioKind } from '../scenario-kind';

export const CHECKLIST_NOUN: Record<ScenarioKind, string> = {
  return_demo: 'Return Demonstration',
  patient_case: 'Patient Case',
};

/** What a member's assignment says about the performance, in words. */
export const performedStatus = (status: string) => (status === 'completed' ? 'Performed' : status === 'in_progress' ? 'In progress' : 'Not yet performed');

export interface ChecklistMember {
  name: string;
  /** The assignment's own status: completed, in_progress, pending and so on. */
  status: string;
  /** Null until graded. */
  score: number | null;
  deadline: string | null;
  completedAt: string | null;
}

const mean = (values: number[]) => (values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length));

const skillNo = (i: number) => String(i + 1).padStart(2, '0');

/** The meta block of one student's checklist report. */
export function checklistStudentMeta(kind: ScenarioKind, title: string, groupLabel: string, member: ChecklistMember) {
  return [
    { label: CHECKLIST_NOUN[kind], value: title },
    { label: 'Group', value: groupLabel },
    { label: 'Date of performance', value: dateLabel(member.deadline) },
    { label: 'Performed', value: dateLabel(member.completedAt) },
  ];
}

export function ChecklistStudentBody({ kind, member, skills }: { kind: ScenarioKind; member: ChecklistMember; skills: SheetSkill[] }) {
  const noun = CHECKLIST_NOUN[kind];
  // A Return Demonstration is Competent or Not yet competent once graded; until then, and for a Patient Case, the status says where it stands.
  const result = kind === 'return_demo' && member.score !== null ? competencyRemark(member.score) : performedStatus(member.status);
  const resultColor = result === COMPETENT ? TONE.pass : result === NOT_YET_COMPETENT ? TONE.low : undefined;

  const weak = skills.flatMap((s, i) => (s.levels[0] === 'needs_practice' ? [`${skillNo(i)} ${s.title}`] : []));
  const rated = skills.some((s) => s.levels[0] !== null);

  return (
    <>
      <StatGrid items={[scoreTile('Score', member.score), countTile('Result', result, undefined, { color: resultColor })]} />
      <Attention
        items={weak.length ? [`${weak.length} ${weak.length === 1 ? 'skill' : 'skills'} rated Needs Practice (${weak.join(', ')})`] : []}
        clear={rated ? 'No skill was rated Needs Practice.' : 'No skill has been rated yet.'}
      />

      <Section title="Checklist and grades" caption={`In checklist order, with the level each step of the ${noun} was given.`} ahead={GRID_AHEAD} />
      <ChecklistSheet columns={['Grade']} skills={skills} emptyText={`This ${noun} has no checklist.`} />
      <ScoreKey />
    </>
  );
}

/** Graded members from the lowest score up, then those not graded; names break ties. */
const byScore = (a: ChecklistMember, b: ChecklistMember) => (a.score ?? 101) - (b.score ?? 101) || a.name.localeCompare(b.name);

export function ChecklistGroupBody({ kind, members, skills }: { kind: ScenarioKind; members: ChecklistMember[]; skills: SheetSkill[] }) {
  const noun = CHECKLIST_NOUN[kind];
  const scores = members.flatMap((m) => (m.score === null ? [] : [m.score]));
  const rd = kind === 'return_demo';
  const ordered = [...members].sort(byScore);

  return (
    <>
      <StatGrid
        items={[
          countTile('Performed', scores.length, `of ${members.length} members`),
          scoreTile('Group average', mean(scores)),
          rd
            ? countTile('Competent', scores.filter((s) => s >= PASSING_SCORE).length, `of ${scores.length} performed`)
            : countTile('Awaiting', members.length - scores.length, 'not graded yet'),
        ]}
      />

      <Section title="Members, lowest score first" caption="Members not graded yet come last." />
      <Table
        head={['Member', 'Date of performance', { label: rd ? 'Remarks' : 'Status', align: 'left' }, 'Score']}
        widths={[3, 1.6, 1.6, 1.8]}
        rows={ordered.map((m): Cell[] => [
          m.name,
          dateLabel(m.deadline),
          rd ? (m.score === null ? '—' : { tag: competencyRemark(m.score), tone: m.score >= PASSING_SCORE ? 'pass' : 'low' }) : performedStatus(m.status),
          { score: m.score, word: true },
        ])}
      />

      <Section title="Checklist and grades" caption="In checklist order, a column for each member with the points each earned on every step." ahead={GRID_AHEAD} />
      <ChecklistSheet columns={members.map((m) => m.name)} skills={skills} emptyText={`This ${noun} has no checklist.`} />
      <Note>The score is the checklist scaled to a grade; the points in the grid are what each member earned on each step.</Note>
      <ScoreKey />
    </>
  );
}
