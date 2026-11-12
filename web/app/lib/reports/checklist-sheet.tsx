/**
 * The checklist sheet of a Return Demonstration report, laid out as the
 * instructor sees it while grading: skills numbered 01, 02…, each step lettered
 * a, b, c… with where Taylor's has it, and the grade beside it. One student gets
 * the grading grid itself (a mark under Excellent, Satisfactory or Needs
 * Practice, and the points); a group gets a column per member. Free of
 * server-only code, so the demo lays out the same sheet in the browser.
 */
import { Text, View } from '@react-pdf/renderer';
import { MAX_RATING_POINTS, NOT_APPLICABLE, TASK_RATINGS, ratingLabel, ratingPoints, type ChecklistRating } from '../task-ratings';
import { TEAL, styles } from './kit-ui';

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

const GRADE_COLOR: Record<string, string> = {
  excellent: '#047857',
  satisfactory: '#b45309',
  needs_practice: '#b91c1c',
  [NOT_APPLICABLE]: '#6b7280',
};

const gradeColor = (grade: SheetGrade) => (grade === null ? '#9ca3af' : (GRADE_COLOR[grade] ?? '#1f2937'));
const pointsText = (p: { earned: number; max: number } | null) => (p ? `${p.earned}/${p.max}` : '—');
const percent = (p: { earned: number; max: number } | null) => (p ? `${Math.round((p.earned / p.max) * 100)}%` : '');

const SOURCE = { fontSize: 6.5, color: '#9ca3af', marginTop: 1 } as const;

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
  const head = { fontSize: 8, textAlign: 'center' as const };
  const level = { flex: 1.1, paddingHorizontal: 2 };
  const mark = (key: string, on: boolean, color: string) => (
    <View key={key} style={[level, { alignItems: 'center' }]}>
      {on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
    </View>
  );

  return (
    <View>
      <View style={[styles.row, styles.headRow]} fixed>
        <Text style={{ flex: 5, paddingHorizontal: 4, fontSize: 9 }}> </Text>
        {TASK_RATINGS.map((l) => (
          <View key={l.key} style={level}>
            <Text style={head}>{l.label}</Text>
            <Text style={[head, { fontSize: 6.5, color: '#6b7280', fontFamily: 'Helvetica' }]}>{l.points} pts</Text>
          </View>
        ))}
        <Text style={[head, { flex: 0.9, paddingHorizontal: 2 }]}>Points</Text>
      </View>

      {skills.map((skill, s) => (
        <View key={s}>
          <View style={[styles.row, { backgroundColor: '#e8f1f3', borderBottomColor: TEAL }]} wrap={false} minPresenceAhead={40}>
            <View style={{ flex: 5, flexDirection: 'row', paddingHorizontal: 4 }}>
              <Text style={{ width: 16, fontSize: 8, color: '#6b7280' }}>{skillNo(s)}</Text>
              <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold', color: TEAL, fontSize: 9 }}>{skill.title}</Text>
            </View>
            <View style={{ flex: TASK_RATINGS.length * 1.1 + 0.9, paddingHorizontal: 2 }}>
              <Text style={{ textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 9, color: gradeColor(skill.levels[0]) }}>
                {pointsText(skill.points[0])}
                {skill.points[0] ? `  ${percent(skill.points[0])}` : ''}
              </Text>
            </View>
          </View>

          {skill.steps.map((step, r) => {
            const grade = step.grades[0];
            return (
              <View key={r} style={styles.row} wrap={false}>
                <View style={{ flex: 5, flexDirection: 'row', paddingHorizontal: 4, paddingLeft: 14 }}>
                  <Text style={{ width: 12, fontSize: 8, color: '#9ca3af' }}>{stepLetter(r)}.</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 8.5 }}>{step.title}</Text>
                    {step.source ? <Text style={SOURCE}>Taylor&apos;s {step.source}</Text> : null}
                  </View>
                </View>
                {TASK_RATINGS.map((l) => mark(l.key, grade === l.key, gradeColor(l.key)))}
                <Text style={{ flex: 0.9, paddingHorizontal: 2, textAlign: 'center', fontSize: 9, color: gradeColor(grade) }}>
                  {grade === null ? '—' : grade === NOT_APPLICABLE ? 'N/A' : ratingPoints(grade)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A group: the same lettered steps, a column per member with the grade each earned. */
function MemberGrid({ columns, skills }: { columns: string[]; skills: SheetSkill[] }) {
  // Landscape, up to ten members: the more columns, the smaller the type.
  const font = columns.length > 7 ? 6.5 : columns.length > 4 ? 7.5 : 8;
  const text = { fontSize: font, textAlign: 'center' as const };
  const cell = { ...text, flex: 1, paddingHorizontal: 2 };
  const stepFlex = columns.length > 7 ? 3.2 : columns.length > 4 ? 3.6 : 4.5;

  return (
    <View>
      <View style={[styles.row, styles.headRow]} fixed>
        <Text style={{ flex: stepFlex, paddingHorizontal: 4, fontSize: font + 1 }}> </Text>
        {columns.map((name, i) => (
          <Text key={i} style={cell}>
            {name}
          </Text>
        ))}
      </View>

      {skills.map((skill, s) => (
        <View key={s}>
          <View style={[styles.row, { backgroundColor: '#e8f1f3', borderBottomColor: TEAL }]} wrap={false} minPresenceAhead={40}>
            <View style={{ flex: stepFlex, flexDirection: 'row', paddingHorizontal: 4 }}>
              <Text style={{ width: 14, fontSize: font, color: '#6b7280' }}>{skillNo(s)}</Text>
              <Text style={{ flex: 1, fontFamily: 'Helvetica-Bold', color: TEAL, fontSize: font + 0.5 }}>{skill.title}</Text>
            </View>
            {skill.levels.map((lv, i) => (
              <View key={i} style={{ flex: 1, paddingHorizontal: 2 }}>
                <Text style={[text, { fontFamily: 'Helvetica-Bold', color: gradeColor(lv) }]}>
                  {lv === null ? '—' : ratingLabel(lv)}
                </Text>
                {skill.points[i] ? (
                  <Text style={[text, { fontSize: 6.5, color: '#6b7280' }]}>
                    {pointsText(skill.points[i])} · {percent(skill.points[i])}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          {skill.steps.map((step, r) => (
            <View key={r} style={styles.row} wrap={false}>
              <View style={{ flex: stepFlex, flexDirection: 'row', paddingHorizontal: 4, paddingLeft: 12 }}>
                <Text style={{ width: 11, fontSize: font, color: '#9ca3af' }}>{stepLetter(r)}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font }}>{step.title}</Text>
                  {step.source ? <Text style={SOURCE}>Taylor&apos;s {step.source}</Text> : null}
                </View>
              </View>
              {step.grades.map((grade, i) => (
                <Text key={i} style={[cell, { color: gradeColor(grade) }]}>
                  {grade === null ? '—' : ratingLabel(grade)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
