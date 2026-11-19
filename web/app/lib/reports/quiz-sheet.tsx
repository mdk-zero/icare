/**
 * The question tables of a quiz report: what one student answered on each
 * question, or a column per group member showing who got it right. Free of
 * server-only code, so the demo lays out the same tables in the browser.
 */
import { Text, View } from '@react-pdf/renderer';
import { TONE, scoreColor } from './bands';
import { BRAND_100, FAINT, MUTED, TEAL, TEAL_DARK, fitName, memberColumnWidth, reportFonts, styles } from './kit-ui';

export interface QuizAnswerRow {
  n: number;
  question: string;
  /** The criterion the question is scored under; null for none. */
  criterion: string | null;
  /** The option the student picked; null when they left it blank. */
  chosen: string | null;
  /** The right option, "B. …"; shown under the answer on a wrong or blank row. */
  correct: string | null;
  /** Null when the question was served but not answered. */
  ok: boolean | null;
}

const CRITERION = { fontSize: 7.5, color: FAINT, marginTop: 1 } as const;

const GREEN = TONE.pass;
const RED = TONE.low;

const verdict = (ok: boolean | null) => (ok === null ? 'Blank' : ok ? 'Correct' : 'Wrong');
const verdictColor = (ok: boolean | null) => (ok === null ? FAINT : ok ? GREEN : RED);
const headLabel = () => ({ fontSize: 8, fontWeight: reportFonts.semibold, color: MUTED, textAlign: 'center' as const });

/** One try, question by question. */
export function QuizAnswers({ rows, emptyText = 'No answers were recorded for this try.' }: { rows: QuizAnswerRow[]; emptyText?: string }) {
  if (rows.length === 0) return <Text style={styles.empty}>{emptyText}</Text>;
  const cell = { paddingHorizontal: 4, fontSize: 9 };
  const head = { ...cell, fontSize: 8.5, fontWeight: reportFonts.semibold, color: MUTED };
  return (
    <View>
      <View style={styles.gridHead} fixed>
        <Text style={[head, { flex: 0.4 }]}>#</Text>
        <Text style={[head, { flex: 4 }]}>Question</Text>
        <Text style={[head, { flex: 2.6 }]}>Answer given</Text>
        <Text style={[head, { flex: 0.9, textAlign: 'center' }]}>Result</Text>
      </View>
      {rows.map((r) => (
        <View key={r.n} style={[styles.row, { alignItems: 'flex-start' }]} wrap={false}>
          <Text style={[cell, { flex: 0.4, color: FAINT }]}>{r.n}</Text>
          <View style={{ flex: 4, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 9 }}>{r.question}</Text>
            {r.criterion ? <Text style={CRITERION}>{r.criterion}</Text> : null}
          </View>
          <View style={{ flex: 2.6, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 9, color: r.ok === false ? RED : r.chosen === null ? FAINT : '#1f2937' }}>{r.chosen ?? '—'}</Text>
            {r.ok !== true && r.correct ? <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 2 }}>Correct: {r.correct}</Text> : null}
          </View>
          <Text style={[cell, { flex: 0.9, textAlign: 'center', fontWeight: 700, color: verdictColor(r.ok) }]}>
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
const MARK_COLOR = { right: GREEN, wrong: RED, blank: FAINT } as const;

/** A group on one quiz: every question down the side, a column per member. */
export function QuizMatrix({ columns, rows }: { columns: QuizMatrixColumn[]; rows: QuizMatrixRow[] }) {
  if (rows.length === 0) return <Text style={styles.empty}>This quiz has no questions.</Text>;
  // Landscape, fixed member columns as in the checklist grid; the type stays 8 pt at any count.
  const text = { fontSize: 8, textAlign: 'center' as const };
  const width = memberColumnWidth(columns.length);
  const cell = { width, paddingHorizontal: 1 };

  return (
    <View>
      <View style={styles.gridHead} fixed>
        <Text style={{ flex: 1, paddingHorizontal: 4, fontSize: 8.5 }}> </Text>
        {columns.map((c, i) => (
          <View key={i} style={cell}>
            <Text style={headLabel()}>{fitName(c.name, width)}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.row, { backgroundColor: BRAND_100, borderBottomColor: TEAL }]} wrap={false}>
        <Text style={{ flex: 1, paddingHorizontal: 4, fontSize: 8, fontWeight: 700, color: TEAL_DARK }}>Grade · correct</Text>
        {columns.map((c, i) => (
          <View key={i} style={cell}>
            <Text style={[text, { fontWeight: 700, color: TEAL_DARK }]}>{c.score}</Text>
            <Text style={[text, { color: MUTED }]}>{c.correct}</Text>
          </View>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.n} style={styles.row} wrap={false}>
          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
            <Text style={{ width: 14, fontSize: 8, color: FAINT }}>{r.n}.</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8 }}>{r.question}</Text>
              {r.criterion ? <Text style={CRITERION}>{r.criterion}</Text> : null}
            </View>
          </View>
          {r.marks.map((m, i) => (
            <View key={i} style={cell}>
              <Text style={[text, { fontWeight: m ? 700 : 400, color: m ? MARK_COLOR[m] : FAINT }]}>{m ? MARK_TEXT[m] : '—'}</Text>
            </View>
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
  /** One cell per column: "5/6 · 83%" for one student, "5/6" over "83%" (two lines) for a member of a group. */
  cells: string[];
}

/** A cell's last line is its percent, so it takes the percent's band colour. */
function CriterionCell({ value, size }: { value: string; size: number }) {
  const lines = value.split('\n');
  const m = /(\d+)%$/.exec(lines[lines.length - 1]);
  return (
    <>
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontSize: size,
            textAlign: 'center',
            ...(i === lines.length - 1 && m ? { fontWeight: 700, color: scoreColor(Number(m[1])) } : value === '—' ? { color: FAINT } : {}),
          }}
        >
          {line}
        </Text>
      ))}
    </>
  );
}

/**
 * How the quiz's scoring criteria went: the share of each criterion's
 * questions answered right. One column for a student, one per member for a group.
 */
export function CriterionTable({ columns, rows }: { columns: string[]; rows: CriterionRow[] }) {
  if (rows.length === 0) return <Text style={styles.empty}>This quiz has no scoring criteria.</Text>;
  // A group's members take the matrix's fixed columns, so the two tables line up.
  const group = columns.length > 1;
  const width = memberColumnWidth(columns.length);
  const col = group ? { width, paddingHorizontal: 1 } : { flex: 1.3, paddingHorizontal: 2 };
  const weight = group ? { width: 44, paddingHorizontal: 2 } : { flex: 0.8, paddingHorizontal: 2 };
  return (
    <View>
      <View style={styles.gridHead} fixed>
        <Text style={[headLabel(), { flex: group ? 1 : 4, paddingHorizontal: 4, textAlign: 'left', fontSize: 8.5 }]}>Criterion</Text>
        <Text style={[headLabel(), weight]}>Weight</Text>
        {columns.map((c, i) => (
          <View key={i} style={col}>
            <Text style={headLabel()}>{group ? fitName(c, width) : c}</Text>
          </View>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.name} style={styles.row} wrap={false}>
          <Text style={{ flex: group ? 1 : 4, paddingHorizontal: 4, fontSize: 8.5 }}>{r.name}</Text>
          <Text style={[{ fontSize: 8, textAlign: 'center', color: MUTED }, weight]}>{`${r.weight}%`}</Text>
          {r.cells.map((c, i) => (
            <View key={i} style={col}>
              <CriterionCell value={c} size={group ? 8 : 9} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
