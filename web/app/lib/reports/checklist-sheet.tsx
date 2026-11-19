/**
 * The checklist sheet of a Return Demonstration report, laid out as the
 * instructor sees it while grading: skills numbered 01, 02…, each step lettered
 * a, b, c… with where Taylor's has it, and the grade beside it. One student gets
 * the grading grid itself (a mark under Excellent, Satisfactory or Needs
 * Practice, and the points); a group gets a column per member, each cell the
 * points that member earned. Free of server-only code, so the demo lays out the same sheet in the browser.
 */
import { Text, View } from '@react-pdf/renderer';
import { MAX_RATING_POINTS, NOT_APPLICABLE, TASK_RATINGS, ratingPoints, scaledGrade, type ChecklistRating } from '../task-ratings';
import { LEVEL_COLOR } from './bands';
import { BRAND_100, FAINT, MUTED, TEAL, TEAL_DARK, fitName, memberColumnWidth, reportFonts, styles } from './kit-ui';

export type SheetGrade = ChecklistRating | null;

export interface SheetStep {
  title: string;
  /** Where the book has it: "Skill 1-1, step 3"; may be empty. */
  source: string;
  /** One grade per column; null where the step wasn't rated. */
  grades: SheetGrade[];
}

export interface SheetSkill {
  title: string;
  /** What the skill sums up to, per column. */
  levels: SheetGrade[];
  /** Points earned out of those on offer, per column; null when the skill isn't in the grade. */
  points: ({ earned: number; max: number } | null)[];
  steps: SheetStep[];
}

/** The points a skill earned from its rows' grades: N/A rows are on offer to no one. */
export function skillPoints(grades: readonly SheetGrade[]): { earned: number; max: number } | null {
  let earned = 0;
  let max = 0;
  for (const g of grades) {
    if (g === NOT_APPLICABLE) continue;
    max += MAX_RATING_POINTS;
    if (g) earned += ratingPoints(g);
  }
  return max > 0 ? { earned, max } : null;
}

/** a, b, … z, aa, ab: the letter the grading sheet gives a step. */
export const stepLetter = (i: number): string =>
  (i >= 26 ? stepLetter(Math.floor(i / 26) - 1) : '') + String.fromCharCode(97 + (i % 26));

const gradeColor = (grade: SheetGrade) => (grade === null ? FAINT : (LEVEL_COLOR[grade] ?? '#1f2937'));
const pointsText = (p: { earned: number; max: number } | null) => (p ? `${p.earned}/${p.max}` : '—');
// The skill's grade as the grading screen shows it (scaledGrade), not the raw share of points.
const percent = (p: { earned: number; max: number } | null) => (p ? `${scaledGrade(p.earned, p.max)}%` : '');
/** What a step's cell shows: the points, "N/A" where the step wasn't on offer, a dash where it wasn't rated. */
const gradeText = (grade: SheetGrade) => (grade === null ? '—' : grade === NOT_APPLICABLE ? 'N/A' : String(ratingPoints(grade)));

const SOURCE = { fontSize: 7, color: FAINT, marginTop: 1 } as const;
const headLabel = () => ({ fontSize: 8, fontWeight: reportFonts.semibold, color: MUTED, textAlign: 'center' as const });

export function ChecklistSheet({
  columns,
  skills,
  emptyText = 'This Return Demonstration has no checklist.',
}: {
  /** The members' names for a group; a single column is one student's grading grid. */
  columns: string[];
  skills: SheetSkill[];
  emptyText?: string;
}) {
  if (skills.length === 0) return <Text style={styles.empty}>{emptyText}</Text>;
  return columns.length === 1 ? <GradingGrid skills={skills} /> : <MemberGrid columns={columns} skills={skills} />;
}

const skillNo = (i: number) => String(i + 1).padStart(2, '0');

/** One student: the grading sheet, a mark under the level each step was given. */
function GradingGrid({ skills }: { skills: SheetSkill[] }) {
  const level = { flex: 1.1, paddingHorizontal: 2 };
  const mark = (key: string, on: boolean, color: string) => (
    <View key={key} style={[level, { alignItems: 'center' }]}>
      {on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
    </View>
  );
  const stepRow = (step: SheetStep, r: number) => {
    const grade = step.grades[0];
    return (
      <View key={r} style={styles.row} wrap={false}>
        <View style={{ flex: 5, flexDirection: 'row', paddingHorizontal: 4, paddingLeft: 14 }}>
          <Text style={{ width: 12, fontSize: 8, color: FAINT }}>{stepLetter(r)}.</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9 }}>{step.title}</Text>
            {step.source ? <Text style={SOURCE}>Taylor&apos;s {step.source}</Text> : null}
          </View>
        </View>
        {TASK_RATINGS.map((l) => mark(l.key, grade === l.key, gradeColor(l.key)))}
        <Text style={{ flex: 0.9, paddingHorizontal: 2, textAlign: 'center', fontSize: 9, color: gradeColor(grade) }}>
          {gradeText(grade)}
        </Text>
      </View>
    );
  };

  return (
    <View>
      <View style={styles.gridHead} fixed>
        <Text style={{ flex: 5, paddingHorizontal: 4, fontSize: 9 }}> </Text>
        {TASK_RATINGS.map((l) => (
          <View key={l.key} style={level}>
            <Text style={headLabel()}>{l.label}</Text>
            <Text style={{ fontSize: 7.5, color: FAINT, textAlign: 'center' }}>{l.points} pts</Text>
          </View>
        ))}
        <Text style={[headLabel(), { flex: 0.9, paddingHorizontal: 2 }]}>Points</Text>
      </View>

      {skills.map((skill, s) => (
        <View key={s}>
          {/* A skill's row travels with its first step, so it never ends a page alone. */}
          <View wrap={false}>
            <View style={[styles.row, { backgroundColor: BRAND_100, borderBottomColor: TEAL }]}>
              <View style={{ flex: 5, flexDirection: 'row', paddingHorizontal: 4 }}>
                <Text style={{ width: 16, fontSize: 8, color: FAINT }}>{skillNo(s)}</Text>
                <Text style={{ flex: 1, fontWeight: 700, color: TEAL_DARK, fontSize: 9.5 }}>{skill.title}</Text>
              </View>
              <View style={{ flex: TASK_RATINGS.length * 1.1 + 0.9, paddingHorizontal: 2 }}>
                <Text style={{ textAlign: 'right', fontWeight: 700, fontSize: 9, color: gradeColor(skill.levels[0]) }}>
                  {pointsText(skill.points[0])}
                  {skill.points[0] ? `  ${percent(skill.points[0])}` : ''}
                </Text>
              </View>
            </View>
            {skill.steps.slice(0, 1).map((step, r) => stepRow(step, r))}
          </View>
          {skill.steps.slice(1).map((step, r) => stepRow(step, r + 1))}
        </View>
      ))}
    </View>
  );
}

/** What the points in the member grid stand for, in the colours the cells use. */
function PointsLegend() {
  const part = (text: string, color: string) => (
    <Text key={text} style={{ fontWeight: 700, color }}>
      {text}
    </Text>
  );
  return (
    <Text style={{ fontSize: 8, color: MUTED, marginBottom: 5 }}>
      Points per step: {part('3', LEVEL_COLOR.excellent)} Excellent · {part('2', LEVEL_COLOR.satisfactory)} Satisfactory ·{' '}
      {part('1', LEVEL_COLOR.needs_practice)} Needs Practice · {part('N/A', LEVEL_COLOR.not_applicable)} not applicable ·{' '}
      {part('—', FAINT)} not rated
    </Text>
  );
}

/** A group: the same lettered steps, a column per member with the points each earned. */
function MemberGrid({ columns, skills }: { columns: string[]; skills: SheetSkill[] }) {
  // Landscape. Fixed member columns, so the step column takes whatever is left and a name wraps
  // inside its column rather than squeezing the others (the type stays 8 pt at any count).
  const width = memberColumnWidth(columns.length);
  const cell = { width, paddingHorizontal: 1 };
  const text = { fontSize: 8, textAlign: 'center' as const };
  const stepRow = (step: SheetStep, r: number) => (
    <View key={r} style={styles.row} wrap={false}>
      <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4, paddingLeft: 12 }}>
        <Text style={{ width: 11, fontSize: 8, color: FAINT }}>{stepLetter(r)}.</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8 }}>{step.title}</Text>
          {step.source ? <Text style={SOURCE}>Taylor&apos;s {step.source}</Text> : null}
        </View>
      </View>
      {step.grades.map((grade, i) => (
        <View key={i} style={cell}>
          <Text style={[text, { fontWeight: grade === null ? 400 : 700, color: gradeColor(grade) }]}>{gradeText(grade)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View>
      <PointsLegend />
      <View style={styles.gridHead} fixed>
        <Text style={{ flex: 1, paddingHorizontal: 4, fontSize: 8.5 }}> </Text>
        {columns.map((name, i) => (
          <View key={i} style={cell}>
            <Text style={headLabel()}>{fitName(name, width)}</Text>
          </View>
        ))}
      </View>

      {skills.map((skill, s) => (
        <View key={s}>
          {/* A skill's row travels with its first step, so it never ends a page alone. */}
          <View wrap={false}>
            <View style={[styles.row, { backgroundColor: BRAND_100, borderBottomColor: TEAL }]}>
              <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 4 }}>
                <Text style={{ width: 14, fontSize: 8, color: FAINT }}>{skillNo(s)}</Text>
                <Text style={{ flex: 1, fontWeight: 700, color: TEAL_DARK, fontSize: 8.5 }}>{skill.title}</Text>
              </View>
              {skill.points.map((p, i) => (
                <View key={i} style={cell}>
                  {p ? (
                    <>
                      <Text style={[text, { fontWeight: 700, color: gradeColor(skill.levels[i]) }]}>{pointsText(p)}</Text>
                      <Text style={[text, { fontWeight: 700, color: gradeColor(skill.levels[i]) }]}>{percent(p)}</Text>
                    </>
                  ) : (
                    <Text style={[text, { color: FAINT }]}>—</Text>
                  )}
                </View>
              ))}
            </View>
            {skill.steps.slice(0, 1).map((step, r) => stepRow(step, r))}
          </View>
          {skill.steps.slice(1).map((step, r) => stepRow(step, r + 1))}
        </View>
      ))}
    </View>
  );
}
