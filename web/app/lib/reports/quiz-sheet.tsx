/**
 * The question tables of a quiz report: what one student answered on each
 * question, or a column per group member showing who got it right. Free of
 * server-only code, so the demo lays out the same tables in the browser.
 */
import { Text, View } from '@react-pdf/renderer';
import { TEAL, styles } from './kit-ui';

export interface QuizAnswerRow {
  n: number;
  question: string;
  /** The criterion the question is scored under; null for none. */
  criterion: string | null;
  /** The option the student picked; null when they left it blank. */
  chosen: string | null;
  /** Null when the question was served but not answered. */
  ok: boolean | null;
}

const CRITERION = { fontSize: 6.5, color: '#9ca3af', marginTop: 1 } as const;

const GREEN = '#047857';
const RED = '#b91c1c';
const GRAY = '#9ca3af';

const verdict = (ok: boolean | null) => (ok === null ? 'Blank' : ok ? 'Correct' : 'Wrong');
const verdictColor = (ok: boolean | null) => (ok === null ? GRAY : ok ? GREEN : RED);

/** One try, question by question. */
export function QuizAnswers({ rows, emptyText = 'No answers were recorded for this try.' }: { rows: QuizAnswerRow[]; emptyText?: string }) {
  if (rows.length === 0) return <Text style={styles.empty}>{emptyText}</Text>;
  const cell = { paddingHorizontal: 4, fontSize: 8.5 };
  return (
    <View>
      <View style={[styles.row, styles.headRow]} fixed>
        <Text style={[cell, { flex: 0.4 }]}>#</Text>
        <Text style={[cell, { flex: 4 }]}>Question</Text>
        <Text style={[cell, { flex: 2.6 }]}>Answer given</Text>
        <Text style={[cell, { flex: 0.9, textAlign: 'center' }]}>Result</Text>
      </View>
      {rows.map((r) => (
        <View key={r.n} style={styles.row} wrap={false}>
          <Text style={[cell, { flex: 0.4, color: '#6b7280' }]}>{r.n}</Text>
          <View style={{ flex: 4, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 8.5 }}>{r.question}</Text>
            {r.criterion ? <Text style={CRITERION}>{r.criterion}</Text> : null}
          </View>
          <Text style={[cell, { flex: 2.6, color: r.ok === false ? RED : '#1f2937' }]}>{r.chosen ?? '—'}</Text>
          <Text style={[cell, { flex: 0.9, textAlign: 'center', fontFamily: 'Helvetica-Bold', color: verdictColor(r.ok) }]}>
            {verdict(r.ok)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export interface QuizMatrixColumn {
  name: string;
  /** Their latest graded try's grade, e.g. "85%"; "—" when they have none. */
  score: string;
  /** Questions right out of those they were served, e.g. "17/20". */
  correct: string;
}

export interface QuizMatrixRow {
  n: number;
  question: string;
  criterion: string | null;
  /** One per column: right, wrong, blank, or null when the question wasn't served to them. */
  marks: ('right' | 'wrong' | 'blank' | null)[];
}

const MARK_TEXT = { right: 'Correct', wrong: 'Wrong', blank: 'Blank' } as const;
const MARK_COLOR = { right: GREEN, wrong: RED, blank: GRAY } as const;

/** A group on one quiz: every question down the side, a column per member. */
export function QuizMatrix({ columns, rows }: { columns: QuizMatrixColumn[]; rows: QuizMatrixRow[] }) {
  if (rows.length === 0) return <Text style={styles.empty}>This quiz has no questions.</Text>;
  const font = columns.length > 7 ? 6.5 : columns.length > 4 ? 7.5 : 8;
  const text = { fontSize: font, textAlign: 'center' as const };
  const cell = { ...text, flex: 1, paddingHorizontal: 2 };
  const questionFlex = columns.length > 7 ? 3.4 : columns.length > 4 ? 3.8 : 4.5;

  return (
    <View>
      <View style={[styles.row, styles.headRow]} fixed>
        <Text style={{ flex: questionFlex, paddingHorizontal: 4, fontSize: font + 1 }}> </Text>
        {columns.map((c, i) => (
          <Text key={i} style={cell}>
            {c.name}
          </Text>
        ))}
      </View>
      <View style={[styles.row, { backgroundColor: '#e8f1f3', borderBottomColor: TEAL }]} wrap={false}>
        <Text style={{ flex: questionFlex, paddingHorizontal: 4, fontSize: font, fontFamily: 'Helvetica-Bold', color: TEAL }}>
          Grade · correct
        </Text>
        {columns.map((c, i) => (
          <View key={i} style={{ flex: 1, paddingHorizontal: 2 }}>
            <Text style={[text, { fontFamily: 'Helvetica-Bold', color: TEAL }]}>{c.score}</Text>
            <Text style={[text, { fontSize: 6.5, color: '#6b7280' }]}>{c.correct}</Text>
          </View>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.n} style={styles.row} wrap={false}>
          <View style={{ flex: questionFlex, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={{ width: 14, fontSize: font, color: '#9ca3af' }}>{r.n}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font }}>{r.question}</Text>
              {r.criterion ? <Text style={CRITERION}>{r.criterion}</Text> : null}
            </View>
          </View>
          {r.marks.map((m, i) => (
            <Text key={i} style={[cell, { color: m ? MARK_COLOR[m] : GRAY }]}>
              {m ? MARK_TEXT[m] : '—'}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export interface CriterionRow {
  name: string;
  /** Its share of the grade, in percent. */
  weight: number;
  /** One cell per column, e.g. "5/6 · 83%". */
  cells: string[];
}

/**
 * How the quiz's scoring criteria went: the share of each criterion's
 * questions answered right. One column for a student, one per member for a group.
 */
export function CriterionTable({ columns, rows }: { columns: string[]; rows: CriterionRow[] }) {
  if (rows.length === 0) return <Text style={styles.empty}>This quiz has no scoring criteria.</Text>;
  const font = columns.length > 7 ? 6.5 : 8;
  const text = { fontSize: font, textAlign: 'center' as const };
  return (
    <View>
      <View style={[styles.row, styles.headRow]} fixed>
        <Text style={{ flex: 4, paddingHorizontal: 4, fontSize: font + 0.5 }}>Criterion</Text>
        <Text style={[text, { flex: 0.8, paddingHorizontal: 2 }]}>Weight</Text>
        {columns.map((c, i) => (
          <Text key={i} style={[text, { flex: 1.3, paddingHorizontal: 2 }]}>
            {c}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.name} style={styles.row} wrap={false}>
          <Text style={{ flex: 4, paddingHorizontal: 4, fontSize: font + 0.5 }}>{r.name}</Text>
          <Text style={[text, { flex: 0.8, paddingHorizontal: 2, color: '#6b7280' }]}>{`${r.weight}%`}</Text>
          {r.cells.map((c, i) => (
            <Text key={i} style={[text, { flex: 1.3, paddingHorizontal: 2 }]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
