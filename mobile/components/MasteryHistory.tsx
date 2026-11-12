import React from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionHeader, SkeletonBlock } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useApiData } from '@/hooks/useApiData';
import { fetchMasteryHistory, type SkillMasteryHistory } from '@/lib/api';

/**
 * Performance history on the Profile: how the student's mastery of the
 * Taylor's skills (Bayesian Knowledge Tracing) changed over time. On top, the
 * average across every skill they have practised; below, each chapter with a
 * small trend line that opens into its own chart and its skills, each of which
 * opens into its own chart in turn. Tap a chart to read a day.
 * Keep the mastery line in step with web/app/lib/bkt.ts.
 */
const MASTERY_THRESHOLD = 0.95;
const THRESHOLD_PCT = Math.round(MASTERY_THRESHOLD * 100);
/** Chapters listed before "Show all". */
const FIRST_ROWS = 4;

/** Same rounding as the rest of the app: 94.6% is not yet mastered, and nothing is 100%. */
function masteryPercent(value: number): number {
  return Math.min(Math.round(value * 100), value < MASTERY_THRESHOLD ? THRESHOLD_PCT - 1 : 99);
}

/** "Assessing Body Temperature (Skill 1-1)" → "Assessing Body Temperature" */
const shortTitle = (title: string) => title.replace(/\s*\(Skill [\d-]+\)\s*$/, '');

const dayLabel = (day: string, withYear = false) =>
  new Date(`${day}T00:00:00+08:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'Asia/Manila',
  });

const dayTime = (day: string) => Date.parse(`${day}T00:00:00+08:00`);

/** SVG text falls back to a serif in browsers; match the app's sans there. */
const SVG_FONT = Platform.select({ web: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', default: undefined });
const PAD = { left: 36, right: 14, top: 18, bottom: 28 };

/** One point on a chart: a day, its mastery, and what the readout says about it. */
type ChartPoint = { day: string; value: number; detail: string };

/**
 * The average mastery across the skills practised by each day. A skill joins
 * the average on its first day and keeps its last value until it changes.
 */
function averageSeries(skills: SkillMasteryHistory[]): ChartPoint[] {
  const days = [...new Set(skills.flatMap((s) => s.points.map((p) => p.day)))].sort();
  const cursor = skills.map(() => -1);
  return days.map((day) => {
    let sum = 0;
    let started = 0;
    let mastered = 0;
    skills.forEach((s, k) => {
      while (cursor[k] + 1 < s.points.length && s.points[cursor[k] + 1].day <= day) cursor[k]++;
      if (cursor[k] < 0) return;
      const m = s.points[cursor[k]].mastery;
      sum += m;
      started++;
      if (m >= MASTERY_THRESHOLD) mastered++;
    });
    return {
      day,
      value: sum / started,
      detail: `${mastered} of ${started} skill${started === 1 ? '' : 's'} mastered`,
    };
  });
}

function skillSeries(skill: SkillMasteryHistory): ChartPoint[] {
  return skill.points.map((p) => ({ day: p.day, value: p.mastery, detail: `${p.correct} of ${p.answers} right that day` }));
}

/** A chapter of the book and the skills in it the student has practised, skills in book order. */
type ChapterGroup = { chapter: number; area: string; skills: SkillMasteryHistory[] };

const skillNumber = (id: string) => Number(id.split('-')[1]) || 0;

function byChapter(skills: SkillMasteryHistory[]): ChapterGroup[] {
  const groups = new Map<number, ChapterGroup>();
  for (const s of skills) {
    // Older servers don't send the chapter; it's the skill number's first part.
    const chapter = s.chapter ?? (Number(s.skill_id.split('-')[0]) || 0);
    const group = groups.get(chapter) ?? { chapter, area: s.area ?? `Chapter ${chapter}`, skills: [] };
    group.skills.push(s);
    groups.set(chapter, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, skills: g.skills.sort((a, b) => skillNumber(a.skill_id) - skillNumber(b.skill_id)) }))
    .sort((a, b) => a.chapter - b.chapter);
}

export function MasteryHistory() {
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow, Type), [Palette, Shadow, Type]);
  const { data, loading, error } = useApiData(fetchMasteryHistory);
  const skills = React.useMemo(() => data ?? [], [data]);
  const average = React.useMemo(() => averageSeries(skills), [skills]);
  const chapters = React.useMemo(() => byChapter(skills), [skills]);
  const [openChapter, setOpenChapter] = React.useState<number | null>(null);
  const [openSkill, setOpenSkill] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  const animate = () => {
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };
  const toggleChapter = (chapter: number) => {
    animate();
    setOpenChapter((cur) => (cur === chapter ? null : chapter));
    setOpenSkill(null);
  };
  const toggleSkill = (id: string) => {
    animate();
    setOpenSkill((cur) => (cur === id ? null : id));
  };

  const shown = showAll ? chapters : chapters.slice(0, FIRST_ROWS);

  return (
    <View style={styles.section}>
      <SectionHeader title="Performance history" subtitle="How your mastery of each chapter's skills has changed" />

      {loading && !data ? (
        <Card style={styles.card}>
          <SkeletonBlock width="55%" height={16} />
          <SkeletonBlock width="100%" height={160} radius={12} style={{ marginTop: Spacing.md }} />
        </Card>
      ) : skills.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={[styles.emptyIcon, { backgroundColor: Accent.teal.bg }]}>
            <Ionicons name="analytics-outline" size={22} color={Accent.teal.fg} />
          </View>
          <Text style={styles.emptyTitle}>{error ? 'Your history could not load' : 'No history yet'}</Text>
          <Text style={styles.emptyText}>
            {error
              ? 'Pull down to try again.'
              : 'Finish a quiz or get graded on a Patient Case or Return Demonstration, and your mastery of each skill starts showing here.'}
          </Text>
        </Card>
      ) : (
        <>
          <Card style={styles.card}>
            <View style={styles.headRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headTitle}>Average mastery</Text>
                <Text style={styles.headSub}>
                  Across the {skills.length} skill{skills.length === 1 ? '' : 's'} you have practised
                </Text>
              </View>
              <Now value={average[average.length - 1].value} first={average[0].value} count={average.length} big />
            </View>
            <MasteryChart
              points={average}
              height={172}
              label={`Average mastery across ${skills.length} skill${skills.length === 1 ? '' : 's'}`}
              styles={styles}
            />
          </Card>

          <Card style={styles.listCard}>
            {shown.map((g, i) => (
              <ChapterRow
                key={g.chapter}
                group={g}
                open={openChapter === g.chapter}
                first={i === 0}
                onToggle={() => toggleChapter(g.chapter)}
                openSkill={openSkill}
                onToggleSkill={toggleSkill}
                styles={styles}
              />
            ))}
            {chapters.length > FIRST_ROWS ? (
              <Pressable
                onPress={() => {
                  animate();
                  setShowAll((v) => !v);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.more, pressed && { backgroundColor: Palette.surfaceMuted }]}
              >
                <Text style={styles.moreText}>{showAll ? 'Show fewer chapters' : `Show all ${chapters.length} chapters`}</Text>
                <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={Palette.primary} />
              </Pressable>
            ) : null}
          </Card>
        </>
      )}
    </View>
  );
}

/** Mastery now, with its change since the first day. */
function Now({ value, first, count, big }: { value: number; first: number; count: number; big?: boolean }) {
  const { Palette, Accent } = useTheme();
  const now = masteryPercent(value);
  const change = now - masteryPercent(first);
  const color = change > 0 ? Accent.green.fg : change < 0 ? Accent.red.fg : Palette.textMuted;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text
        style={{
          fontSize: big ? 28 : 17,
          fontWeight: '800',
          letterSpacing: big ? -0.5 : 0,
          color: value >= MASTERY_THRESHOLD ? Accent.green.fg : Palette.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {now}%
      </Text>
      {count > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: big ? -2 : 0 }}>
          <Ionicons name={change > 0 ? 'caret-up' : change < 0 ? 'caret-down' : 'remove'} size={10} color={color} />
          <Text style={{ fontSize: 12, fontWeight: '600', color, fontVariant: ['tabular-nums'] }}>
            {change > 0 ? '+' : ''}
            {change}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A tappable line in the list: a name, its trend, its mastery now, and what opens below it. */
function TrendRow({
  label,
  title,
  points,
  mastered,
  open,
  first,
  nested,
  onToggle,
  children,
  styles,
}: {
  label: string;
  title: string;
  points: ChartPoint[];
  mastered: boolean;
  open: boolean;
  first: boolean;
  nested?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  const { Palette, Accent } = useTheme();
  const last = points[points.length - 1].value;
  return (
    <View style={[!first && styles.rowDivider]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${title}, ${masteryPercent(last)}%${mastered ? ', mastered' : ''}`}
        accessibilityHint={open ? 'Hides its chart' : 'Shows its chart'}
        style={({ pressed }) => [styles.row, nested && styles.rowNested, pressed && { backgroundColor: Palette.surfaceMuted }]}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.rowNoLine}>
            <Text style={styles.rowNo}>{label}</Text>
            {mastered ? <Ionicons name="checkmark-circle" size={13} color={Accent.green.fg} /> : null}
          </View>
          <Text style={[styles.rowTitle, nested && styles.rowTitleNested]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <Sparkline points={points} color={mastered ? Accent.green.fg : Palette.primary} />
        <View style={styles.rowNow}>
          <Now value={last} first={points[0].value} count={points.length} />
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Palette.textMuted} />
      </Pressable>
      {open ? <View style={[styles.rowOpen, nested && styles.rowOpenNested]}>{children}</View> : null}
    </View>
  );
}

function StatusPill({ done, text, styles }: { done: boolean; text: string; styles: ReturnType<typeof createStyles> }) {
  const { Accent } = useTheme();
  const tone = done ? Accent.green : Accent.teal;
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Ionicons name={done ? 'checkmark-circle' : 'flag-outline'} size={13} color={tone.fg} />
      <Text style={[styles.pillText, { color: tone.fg }]}>{text}</Text>
    </View>
  );
}

function ChapterRow({
  group,
  open,
  first,
  onToggle,
  openSkill,
  onToggleSkill,
  styles,
}: {
  group: ChapterGroup;
  open: boolean;
  first: boolean;
  onToggle: () => void;
  openSkill: string | null;
  onToggleSkill: (id: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const points = React.useMemo(() => averageSeries(group.skills), [group.skills]);
  const mastered = group.skills.filter((s) => s.mastery >= MASTERY_THRESHOLD).length;
  const all = mastered === group.skills.length;
  const count = `${group.skills.length} skill${group.skills.length === 1 ? '' : 's'}`;

  return (
    <TrendRow
      label={`Chapter ${group.chapter}`}
      title={group.area}
      points={points}
      mastered={all}
      open={open}
      first={first}
      onToggle={onToggle}
      styles={styles}
    >
      <StatusPill done={all} text={`${mastered} of ${count} mastered`} styles={styles} />
      <MasteryChart points={points} height={168} label={`Average mastery of Chapter ${group.chapter}, ${group.area}`} styles={styles} />
      <Text style={styles.groupLabel}>Skills you have practised in this chapter</Text>
      <View style={styles.nestedList}>
        {group.skills.map((s, i) => (
          <SkillRow
            key={s.skill_id}
            skill={s}
            open={openSkill === s.skill_id}
            first={i === 0}
            onToggle={() => onToggleSkill(s.skill_id)}
            styles={styles}
          />
        ))}
      </View>
    </TrendRow>
  );
}

function SkillRow({
  skill,
  open,
  first,
  onToggle,
  styles,
}: {
  skill: SkillMasteryHistory;
  open: boolean;
  first: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const points = React.useMemo(() => skillSeries(skill), [skill]);
  const mastered = skill.mastery >= MASTERY_THRESHOLD;
  const title = shortTitle(skill.title);

  return (
    <TrendRow
      label={`Skill ${skill.skill_id}`}
      title={title}
      points={points}
      mastered={mastered}
      open={open}
      first={first}
      nested
      onToggle={onToggle}
      styles={styles}
    >
      <StatusPill
        done={mastered}
        text={mastered ? 'Mastered' : `${THRESHOLD_PCT - masteryPercent(skill.mastery)} points to mastered`}
        styles={styles}
      />
      <MasteryChart points={points} height={160} label={`Mastery of ${title}`} styles={styles} />
      <Text style={styles.foot}>
        Based on {skill.answers} answer{skill.answers === 1 ? '' : 's'} from your quizzes and skill checklists.
      </Text>
    </TrendRow>
  );
}

const SPARK_W = 56;
const SPARK_H = 28;

/**
 * The skill's trend at a glance. Scaled to its own range, at least 25 points
 * tall, so a small change stays small but the shape still shows.
 */
function Sparkline({ points, color }: { points: ChartPoint[]; color: string }) {
  const values = points.map((p) => p.value);
  const mid = (Math.min(...values) + Math.max(...values)) / 2;
  const span = Math.max(0.25, Math.max(...values) - Math.min(...values));
  const lo = mid - span / 2;
  const times = points.map((p) => dayTime(p.day));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const x = (i: number) => (t1 === t0 ? SPARK_W / 2 : 2 + ((times[i] - t0) / (t1 - t0)) * (SPARK_W - 6));
  const y = (v: number) => 3 + (1 - (v - lo) / span) * (SPARK_H - 6);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <Svg width={SPARK_W} height={SPARK_H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {points.length > 1 ? <Path d={d} stroke={color} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
      <Circle cx={x(points.length - 1)} cy={y(last.value)} r={2.5} fill={color} />
    </Svg>
  );
}

function MasteryChart({
  points,
  height,
  label,
  styles,
}: {
  points: ChartPoint[];
  height: number;
  label: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const { Palette, Accent } = useTheme();
  const [width, setWidth] = React.useState(0);
  const [selected, setSelected] = React.useState(points.length - 1);
  const gradientId = React.useId().replace(/:/g, '');

  // Days placed by date, so a week's gap looks like a week.
  const times = points.map((p) => dayTime(p.day));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => (points.length === 1 || t1 === t0 ? PAD.left + plotW / 2 : PAD.left + ((times[i] - t0) / (t1 - t0)) * plotW);
  const y = (m: number) => PAD.top + (1 - m) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  const chartRef = React.useRef<React.ComponentRef<typeof View>>(null);
  const nearest = (tapX: number) => {
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - tapX) < Math.abs(x(best) - tapX)) best = i;
    });
    setSelected(best);
  };
  // The tap's page position less the chart's own: the same on phones and in browsers.
  const pick = (e: GestureResponderEvent) => {
    const pageX = e.nativeEvent.pageX;
    chartRef.current?.measureInWindow((left: number) => nearest(pageX - left));
  };

  const at = Math.min(selected, points.length - 1);
  const sel = points[at];
  const selX = x(at);
  const selY = y(sel.value);

  // A middle date only when there's room for three labels.
  const xLabels =
    points.length === 1 ? [0] : width > 300 && points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0, points.length - 1];

  return (
    <View>
      {/* The day the chart is showing: the latest until another is tapped. */}
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <Text style={styles.readoutDay}>{dayLabel(sel.day, true)}</Text>
        <Text style={styles.readoutValue}>{masteryPercent(sel.value)}%</Text>
        <Text style={styles.readoutDetail}>{sel.detail}</Text>
      </View>

      <View
        ref={chartRef}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, marginTop: Spacing.xs }}
        accessibilityRole="image"
        accessibilityLabel={`${label} over ${points.length} day${points.length === 1 ? '' : 's'}: ${masteryPercent(points[0].value)}% on ${dayLabel(points[0].day, true)}, ${masteryPercent(points[points.length - 1].value)}% now.`}
        accessibilityHint="Tap a day on the chart to read its mastery"
      >
        {width > 0 ? (
          <>
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={Palette.primary} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={Palette.primary} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {[0, 0.5, 1].map((v) => (
                <React.Fragment key={v}>
                  <Line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={Palette.borderLight} strokeWidth={1} />
                  <SvgText x={PAD.left - 8} y={y(v) + 4} fontSize={10} fontFamily={SVG_FONT} fill={Palette.textMuted} textAnchor="end">
                    {`${Math.round(v * 100)}%`}
                  </SvgText>
                </React.Fragment>
              ))}

              {/* Where a skill counts as mastered. */}
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(MASTERY_THRESHOLD)}
                y2={y(MASTERY_THRESHOLD)}
                stroke={Accent.green.fg}
                strokeWidth={1.25}
                strokeDasharray="5 4"
              />
              <SvgText x={PAD.left + 4} y={y(MASTERY_THRESHOLD) - 5} fontSize={10} fontFamily={SVG_FONT} fontWeight="600" fill={Accent.green.fg}>
                Mastered at {THRESHOLD_PCT}%
              </SvgText>

              {points.length > 1 ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
              {points.length > 1 ? (
                <Path d={line} stroke={Palette.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ) : null}

              {/* The selected day's guide. */}
              <Line x1={selX} x2={selX} y1={PAD.top} y2={y(0)} stroke={Palette.primary} strokeOpacity={0.25} strokeWidth={1} />

              {points.map((p, i) => (
                <Circle key={p.day} cx={x(i)} cy={y(p.value)} r={points.length > 24 ? 2 : 3} fill={Palette.primary} />
              ))}
              <Circle cx={selX} cy={selY} r={9} fill={Palette.primary} fillOpacity={0.15} />
              <Circle cx={selX} cy={selY} r={5} fill={Palette.surface} stroke={Palette.primary} strokeWidth={2.5} />

              {xLabels.map((i, k) => (
                <SvgText
                  key={`${i}-${k}`}
                  x={x(i)}
                  y={height - 8}
                  fontSize={10}
                  fontFamily={SVG_FONT}
                  fill={Palette.textMuted}
                  textAnchor={points.length === 1 ? 'middle' : k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle'}
                >
                  {dayLabel(points[i].day)}
                </SvgText>
              ))}
            </Svg>
            {/* Takes the taps over the whole chart, so the position is measured from its edge. */}
            <Pressable onPress={pick} style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          </>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
    section: { marginTop: Spacing.lg },
    card: { gap: Spacing.sm },
    headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    headTitle: { ...Type.itemTitle },
    headSub: { fontSize: 12, color: Palette.textSecondary, marginTop: 2 },
    listCard: { marginTop: Spacing.md, paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 64,
      paddingVertical: 12,
      paddingHorizontal: Spacing.lg,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.border },
    rowNoLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    rowNo: { fontSize: 12, fontWeight: '600', color: Palette.primary, fontVariant: ['tabular-nums'] },
    rowTitle: { fontSize: 14, fontWeight: '600', color: Palette.ink, marginTop: 1, lineHeight: 19 },
    rowNow: { minWidth: 44 },
    rowOpen: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
    rowNested: { paddingHorizontal: Spacing.md, minHeight: 56, paddingVertical: 10 },
    rowTitleNested: { fontSize: 13, lineHeight: 18 },
    rowOpenNested: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
    groupLabel: { fontSize: 12, fontWeight: '600', color: Palette.textSecondary, marginTop: Spacing.xs },
    nestedList: { borderWidth: 1, borderColor: Palette.border, borderRadius: Radius.md, overflow: 'hidden' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    pillText: { fontSize: 12, fontWeight: '600' },
    more: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 48,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Palette.border,
    },
    moreText: { fontSize: 14, fontWeight: '600', color: Palette.primary },
    readout: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      columnGap: 8,
      marginTop: Spacing.xs,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: Radius.md,
      backgroundColor: Palette.surfaceMuted,
    },
    readoutDay: { fontSize: 12, fontWeight: '600', color: Palette.textSecondary },
    readoutValue: { fontSize: 16, fontWeight: '800', color: Palette.ink, fontVariant: ['tabular-nums'] },
    readoutDetail: { fontSize: 12, color: Palette.textSecondary },
    foot: { ...Type.caption, color: Palette.textMuted },
    emptyCard: { gap: Spacing.sm, alignItems: 'center', paddingVertical: Spacing.xl },
    emptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { ...Type.itemTitle, marginTop: Spacing.sm },
    emptyText: { ...Type.caption, textAlign: 'center', lineHeight: 18, maxWidth: 300 },
  });
}
