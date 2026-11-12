/**
 * The work a group was given, member by member: a column for each patient
 * case, return demonstration, quiz or case presentation assigned to someone
 * in the group, and each member's grade on it. Free of server-only code, so
 * the demo lays out the same table in the browser.
 */
import type { ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { TEAL, styles } from './kit-ui';

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

const MAX_COLUMNS = 10;

/** A member's mean over what they have been graded on; null when nothing. */
export function memberAverage(entries: readonly GridEntry[]): number | null {
  const scores = entries.flatMap((e) => (e.score === null ? [] : [e.score]));
  return scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function ActivityTable({
  members,
  heading,
  emptyText = 'Nothing has been assigned to this group yet.',
}: {
  members: GridMember[];
  /** Kept on the same page as the first rows, never left alone at the foot of one. */
  heading?: ReactNode;
  emptyText?: string;
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
  const font = Math.min(columns.length, MAX_COLUMNS) > 5 ? 7 : 8;
  const cell = { flex: 1, paddingHorizontal: 2, fontSize: font, textAlign: 'center' as const };

  return (
    <View>
      {sets.map((set, s) => {
        return (
          <View key={s} style={{ marginBottom: 8 }} wrap={false}>
            {s === 0 && heading}
            <View style={[styles.row, styles.headRow, { alignItems: 'flex-start' }]} wrap={false}>
              <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: font + 0.5 }}>Member</Text>
              {s === 0 && <Text style={[cell, { flex: 0.9, fontSize: font + 0.5 }]}>Average</Text>}
              {set.map((c, i) => (
                <View key={c?.key ?? `pad-${i}`} style={{ flex: 1, paddingHorizontal: 2 }}>
                  {c && (
                    <>
                      <Text style={{ fontSize: font, textAlign: 'center', maxLines: 2, textOverflow: 'ellipsis' }}>
                        {c.title}
                      </Text>
                      <Text style={{ fontSize: 6, color: TEAL, textAlign: 'center', fontFamily: 'Helvetica' }}>
                        {ACTIVITY_KIND_LABEL[c.kind]}
                      </Text>
                    </>
                  )}
                </View>
              ))}
            </View>
            {members.map((m) => {
              const byKey = new Map(m.entries.map((e) => [e.key, e]));
              return (
                <View key={m.name} style={styles.row} wrap={false}>
                  <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: font + 0.5 }}>{m.name}</Text>
                  {s === 0 && (
                    <Text style={[cell, { flex: 0.9, fontFamily: 'Helvetica-Bold', fontSize: font + 0.5 }]}>
                      {memberAverage(m.entries) === null ? '—' : `${memberAverage(m.entries)}%`}
                    </Text>
                  )}
                  {set.map((c, i) => {
                    const e = c ? byKey.get(c.key) : undefined;
                    return (
                      <Text key={c?.key ?? `pad-${i}`} style={[cell, { color: e ? (e.score === null ? '#9ca3af' : '#1f2937') : '#d1d5db' }]}>
                        {e ? (e.score === null ? '—' : `${Math.round(e.score)}%`) : ''}
                      </Text>
                    );
                  })}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
