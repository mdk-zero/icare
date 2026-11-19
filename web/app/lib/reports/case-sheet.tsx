/**
 * The body of a Case Presentation report, shared by the real builder and the
 * demo's so both lay out the same page: the group score, the instructor's
 * remarks, the rubric with its total, and the members. Free of server-only
 * code. The report names no grader: it shows when the grade was given.
 */
import { Text, View } from '@react-pdf/renderer';
import { CASE_CRITERIA, caseLevelLabel } from '../case-rubric';
import { BRAND_100, BRAND_50, INK, Section, StatGrid, Table, TEAL_DARK, scoreTile, type Cell, type MetaRow } from './kit-ui';
import { dateLabel } from './view';

export interface CaseMember {
  name: string;
  leader: boolean;
}

export interface CaseRating {
  criterion: string;
  level: number;
  remarks: string;
}

/** The meta block of a Case Presentation report. */
export function caseMeta(g: {
  team: string;
  section: string;
  leader: string | null;
  presentedAt: string | null;
  late: boolean;
  gradedAt: string | null;
}): MetaRow[] {
  return [
    { label: 'Group', value: [g.team, g.section].filter(Boolean).join(' · ') },
    { label: 'Leader', value: g.leader ?? '—' },
    { label: 'Presented', value: { date: dateLabel(g.presentedAt), late: g.late } },
    { label: 'Graded', value: dateLabel(g.gradedAt) },
  ];
}

/** The instructor's remarks, set apart in a Brand-50 box. */
function RemarksBox({ text }: { text: string }) {
  return (
    <View
      wrap={false}
      style={{ marginTop: 2, marginBottom: 4, padding: 9, backgroundColor: BRAND_50, borderWidth: 1, borderColor: BRAND_100, borderRadius: 4 }}
    >
      <Text style={{ fontSize: 7.5, fontWeight: 700, color: TEAL_DARK, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>
        Instructor remarks
      </Text>
      <Text style={{ color: INK }}>{text}</Text>
    </View>
  );
}

export function CaseReportBody({
  score,
  remarks,
  ratings,
  members,
}: {
  score: number | null;
  remarks: string;
  ratings: readonly CaseRating[];
  /** Leader first, then A to Z. */
  members: CaseMember[];
}) {
  const byKey = new Map(ratings.map((r) => [r.criterion, r]));
  const earnedOf = (key: string, weight: number) => {
    const r = byKey.get(key);
    return r ? Math.round(((weight * r.level) / 4) * 100) / 100 : null;
  };
  const rubric = CASE_CRITERIA.map((cr): Cell[] => {
    const r = byKey.get(cr.key);
    const earned = earnedOf(cr.key, cr.weight);
    return [cr.label, `${cr.weight}%`, r ? `${caseLevelLabel(r.level)} (${r.level})` : '—', earned === null ? '—' : String(earned), r?.remarks || ''];
  });
  const total = CASE_CRITERIA.reduce((n, cr) => n + (earnedOf(cr.key, cr.weight) ?? 0), 0);
  const weight = CASE_CRITERIA.reduce((n, c) => n + c.weight, 0);

  return (
    <>
      <StatGrid items={[scoreTile('Group score', score, undefined, { emphasis: true })]} />
      {remarks ? <RemarksBox text={remarks} /> : null}

      <Section title="Rubric" caption="A criterion earns its weight times its level, out of 4." />
      <Table
        head={['Criterion', 'Weight', { label: 'Level', align: 'left' }, 'Points', { label: 'Remarks', align: 'left' }]}
        widths={[3, 0.8, 1.5, 0.8, 2]}
        rows={[...rubric.map((cells) => ({ cells })), { cells: ['Total points', `${weight}%`, '', String(Math.round(total * 100) / 100), ''], tone: 'total' as const }]}
      />

      {/* A short member list stays whole, under its heading; a long one may run on. */}
      <View wrap={members.length > 8}>
        <Section title="Members" caption="Graded as a group: every member receives the group score. The leader is listed first." />
        <Table
          head={['Member', 'Role']}
          widths={[3, 1]}
          rows={members.map((m) => [m.name, m.leader ? 'Group leader' : 'Member'])}
          emptyText="No members are recorded for this group."
        />
      </View>
    </>
  );
}
