/**
 * The work a group was given, member by member: a column for each patient
 * case, return demonstration, quiz or case presentation assigned to someone
 * in the group, and each member's grade on it. Free of server-only code, so
 * the demo lays out the same table in the browser.
 */
import type { ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { scoreColor } from './bands';
import { FAINT, GRID_AHEAD, HAIRLINE, MUTED, SUBTLE, reportFonts, styles } from './kit-ui';

export type ActivityKind = 'patient_case' | 'return_demo' | 'quiz' | 'case';

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  patient_case: 'Patient Case',
  return_demo: 'Return Demo',
  quiz: 'Quiz',
  case: 'Case Presentation',
};

const KIND_ORDER: ActivityKind[] = ['patient_case', 'return_demo', 'quiz', 'case'];

export interface GridEntry {
  /** "<kind>:<id>": the same activity under the same key for every member. */
  key: string;
  kind: ActivityKind;
  title: string;
  /** Null until graded. */
  score: number | null;
}

export interface GridMember {
  name: string;
  entries: GridEntry[];
  /**
   * What the Average column shows, when the caller has a figure that counts more than the
   * columns here do (every graded piece of work, say). Left out, the column is `memberAverage`
   * of the entries; null is a dash.
   */
  average?: number | null;
}

export interface GridColumn {
  key: string;
  kind: ActivityKind;
  title: string;
}

/** The activities given to anyone in the group, by kind and then name. */
export function groupColumns(members: readonly GridMember[]): GridColumn[] {
  const seen = new Map<string, GridColumn>();
  for (const m of members) for (const e of m.entries) if (!seen.has(e.key)) seen.set(e.key, { key: e.key, kind: e.kind, title: e.title });
  return [...seen.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, undefined, { numeric: true }),
  );
}

/** Activity columns in one table; a longer list continues in a second below. */
const MAX_COLUMNS = 7;

/** A member's mean over what they have been graded on; null when nothing. */
export function memberAverage(entries: readonly GridEntry[]): number | null {
  const scores = entries.flatMap((e) => (e.score === null ? [] : [e.score]));
  return scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/** A table of this many members or fewer is kept whole on a page; a longer one splits between rows. */
const WHOLE_TABLE_MAX = 12;

/**
 * The room a heading above this table asks to have after it: the whole table when it is kept
 * whole (a header of four lines of titles, a row each, the legend), else the header and first
 * rows. An estimate, a little generous, because react-pdf keeps a heading with what follows only
 * by a figure given up front.
 */
export function activityAhead(members: readonly GridMember[]): number {
  return members.length > WHOLE_TABLE_MAX ? GRID_AHEAD : 100 + 26 * members.length;
}

/** Entries given to the member but not graded yet. */
const openCount = (entries: readonly GridEntry[]) => entries.filter((e) => e.score === null).length;

export function ActivityTable({
  members,
  heading,
  emptyText = 'Nothing has been assigned to this group yet.',
  showAverage = true,
  showOpen = false,
}: {
  members: GridMember[];
  /** Kept on the same page as the first rows, never left alone at the foot of one. */
  heading?: ReactNode;
  emptyText?: string;
  /** The Average column, in the first table. */
  showAverage?: boolean;
  /** An Open column, in the first table: how many of the member's entries are given but not graded. */
  showOpen?: boolean;
}) {
  const columns = groupColumns(members);
  if (members.length === 0 || columns.length === 0) {
    return (
      <View>
        {heading}
        <Text style={styles.empty}>{emptyText}</Text>
      </View>
    );
  }

  // A long list of activities continues in a second table below, with the names again.
  // Split evenly, and pad the short one, so the columns line up from one table to the next.
  const count = Math.ceil(columns.length / MAX_COLUMNS);
  const per = Math.ceil(columns.length / count);
  const sets: (GridColumn | null)[][] = [];
  for (let i = 0; i < columns.length; i += per) {
    const set: (GridColumn | null)[] = columns.slice(i, i + per);
    while (set.length < per) set.push(null);
    sets.push(set);
  }
  const splits = members.length > WHOLE_TABLE_MAX;
  const head = { fontSize: 8, fontWeight: reportFonts.semibold, color: MUTED, textAlign: 'center' as const };
  // The tail columns sit in the first table only; the continuation holds their place so the
  // activity columns stay under each other.
  const tail = [showAverage ? { key: 'average', flex: 0.9 } : null, showOpen ? { key: 'open', flex: 0.7 } : null].filter(
    (t): t is { key: string; flex: number } => t !== null,
  );

  const legend = (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
      <Text style={{ fontSize: 8, color: MUTED }}>— given, not graded yet</Text>
      <Text style={{ fontSize: 8, color: MUTED, marginHorizontal: 6 }}>·</Text>
      <View style={{ width: 14, height: 9, backgroundColor: SUBTLE, borderWidth: 0.75, borderColor: HAIRLINE, marginRight: 4 }} />
      <Text style={{ fontSize: 8, color: MUTED }}>shaded: not given to that member</Text>
    </View>
  );

  // The heading and the tables are siblings (a fragment, not a wrapping View) so the heading is
  // kept with the table that follows it. A small group stays whole on a page; a big one splits
  // between rows and repeats its header row on the next page.
  return (
    <>
      {heading && <View minPresenceAhead={activityAhead(members)}>{heading}</View>}
      {sets.map((set, s) => (
        <View key={s} style={{ marginBottom: 8 }} wrap={splits}>
          <View style={[styles.gridHead, { alignItems: 'flex-start' }]} wrap={false} fixed={splits}>
            <Text style={[head, { flex: 2.2, paddingHorizontal: 4, textAlign: 'left', fontSize: 8.5 }]}>Member</Text>
            {tail.map((t) => (
              <Text key={t.key} style={[head, { flex: t.flex, paddingHorizontal: 2 }]}>
                {s === 0 ? (t.key === 'average' ? 'Average' : 'Open') : ''}
              </Text>
            ))}
            {set.map((c, i) => (
              <View key={c?.key ?? `pad-${i}`} style={{ flex: 1, paddingHorizontal: 2 }}>
                {c && (
                  <>
                    {/* Wraps in full rather than truncating: textkit squeezes the spaces out of a
                        bold line it cuts with an ellipsis ("AFullSetofVital…"). */}
                    <Text style={head}>{c.title}</Text>
                    <Text style={{ fontSize: 7, color: MUTED, textAlign: 'center', marginTop: 1 }}>{ACTIVITY_KIND_LABEL[c.kind]}</Text>
                  </>
                )}
              </View>
            ))}
          </View>
          {members.map((m, mi) => {
            const byKey = new Map(m.entries.map((e) => [e.key, e]));
            const average = m.average !== undefined ? m.average : memberAverage(m.entries);
            const open = openCount(m.entries);
            const body = { paddingVertical: 4, paddingHorizontal: 2, justifyContent: 'center' as const };
            const row = (
              <View style={[styles.row, { paddingVertical: 0, alignItems: 'stretch' }]}>
                <View style={[body, { flex: 2.2, paddingHorizontal: 4 }]}>
                  <Text style={{ fontSize: 8.5 }}>{m.name}</Text>
                </View>
                {tail.map((t) => (
                  <View key={t.key} style={[body, { flex: t.flex }]}>
                    {s === 0 && t.key === 'average' && (
                      <Text style={{ textAlign: 'center', fontSize: 8.5, fontWeight: 700, color: average === null ? FAINT : scoreColor(average) }}>
                        {average === null ? '—' : `${Math.round(average)}%`}
                      </Text>
                    )}
                    {s === 0 && t.key === 'open' && (
                      <Text style={{ textAlign: 'center', fontSize: 8.5, color: open === 0 ? FAINT : '#1f2937' }}>{open}</Text>
                    )}
                  </View>
                ))}
                {set.map((c, i) => {
                  const e = c ? byKey.get(c.key) : undefined;
                  // A cell nobody gave the member is shaded and bare: a blank is not a dash (a pad column is neither). The
                  // hairline edges keep two shaded cells from running into one strip.
                  const shade = e || !c ? {} : { backgroundColor: SUBTLE, borderLeftWidth: 1, borderRightWidth: 1, borderColor: HAIRLINE };
                  return (
                    <View key={c?.key ?? `pad-${i}`} style={[body, { flex: 1 }, shade]}>
                      {e &&
                        (e.score === null ? (
                          <Text style={{ textAlign: 'center', fontSize: 8, color: FAINT }}>—</Text>
                        ) : (
                          <Text style={{ textAlign: 'center', fontSize: 8, fontWeight: 700, color: scoreColor(e.score) }}>
                            {`${Math.round(e.score)}%`}
                          </Text>
                        ))}
                    </View>
                  );
                })}
              </View>
            );
            // The last row travels with the legend, so the legend never opens a page of its own.
            return (
              <View key={mi} wrap={false}>
                {row}
                {s === sets.length - 1 && mi === members.length - 1 && legend}
              </View>
            );
          })}
        </View>
      ))}
    </>
  );
}
