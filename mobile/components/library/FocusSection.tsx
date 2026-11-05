import React from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SkeletonBlock } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { AiTip, FocusSkill, LibraryItem, LibraryKind, StudyProfile } from '@/lib/api';

/** Per skill, so one card never outgrows the screen; a student flagged at risk gets more. */
const MAX_MATERIALS = 3;
const MAX_MATERIALS_AT_RISK = 5;
/** Below this mastery a skill is new ground: demonstrations before reference material. */
const FOUNDATION_BELOW = 0.5;
const FOUNDATION_ORDER: readonly LibraryKind[] = ['video', 'slides', 'note', 'pdf', 'link'];
const REFINE_ORDER: readonly LibraryKind[] = ['note', 'pdf', 'slides', 'video', 'link'];

/**
 * A skill's materials in the order BKT suggests: on a skill the student barely
 * knows, the demonstrations first (videos, then slides); on one they are
 * close to mastering, the reference material first (notes, PDFs) to sharpen
 * the details. Within a kind, what they haven't opened yet comes first.
 */
export function orderMaterials(items: readonly LibraryItem[], mastery: number | undefined): LibraryItem[] {
  const order = (mastery ?? 0) < FOUNDATION_BELOW ? FOUNDATION_ORDER : REFINE_ORDER;
  const rank = (k: LibraryKind) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return [...items].sort((a, b) => rank(a.kind) - rank(b.kind) || Number(a.seen) - Number(b.seen));
}

type Theme = ReturnType<typeof useTheme>;

/**
 * A panel below the Library's materials: its header gives the student's
 * overall mastery and how many skills need improvement, and opening it shows
 * their overall standing, then each skill BKT says isn't mastered yet (least
 * mastered first) with its mastery, an AI study tip from its materials, and
 * those materials in the order BKT suggests (orderMaterials), or a note that
 * it has none yet. Open from the start, with more materials per skill, for a
 * student flagged at risk. Hidden when there is nothing to show.
 */
export function FocusSection({
  skills,
  overall,
  loading,
  tips,
  tipsLoading,
  tipsOff,
  atRisk,
  materialsBySkill,
  renderMaterial,
}: {
  skills: FocusSkill[];
  /** The student's whole standing; null before the server sends it. */
  overall: StudyProfile | null;
  loading: boolean;
  tips: AiTip[];
  tipsLoading: boolean;
  /** The student hasn't allowed AI features, so there are no tips and the panel says why. */
  tipsOff: boolean;
  /** Their latest at-risk prediction flags them: the panel starts open, with more to study. */
  atRisk: boolean;
  materialsBySkill: Map<string, LibraryItem[]>;
  renderMaterial: (item: LibraryItem) => React.ReactNode;
}) {
  const theme = useTheme();
  const { Palette, Accent } = theme;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  // Open for a student flagged at risk, closed otherwise, until they tap it.
  const [chosen, setChosen] = React.useState<boolean | null>(null);
  const open = chosen ?? atRisk;

  const tipBySkill = new Map(tips.filter((t) => t.skill_id).map((t) => [t.skill_id as string, t]));
  const overallTip = tipBySkill.get('overall');
  const hasOverall = !!overall && overall.skills > 0;

  const icon = (
    <View style={[styles.icon, { backgroundColor: Accent.blue.bg }]}>
      <Ionicons name="bulb" size={18} color={Accent.blue.fg} />
    </View>
  );

  if (loading && skills.length === 0) {
    return (
      <View style={styles.panel} accessibilityLabel="Loading recommendations">
        <View style={styles.header}>
          {icon}
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="60%" height={14} />
            <SkeletonBlock width="40%" height={11} style={{ marginTop: 6 }} />
          </View>
          <Ionicons name="chevron-forward" size={18} color={Palette.textFaint} />
        </View>
      </View>
    );
  }
  if (skills.length === 0 && !hasOverall) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChosen(!open);
  };
  const summary = [
    hasOverall && overall.mastery !== null ? `${Math.round(overall.mastery * 100)}% overall mastery` : null,
    skills.length > 0 ? `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'} to improve` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.panel}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Hides your recommendations' : 'Shows your recommendations and study tips'}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Recommendations & study tips</Text>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={Palette.textMuted} />
      </Pressable>

      {open && tipsOff ? (
        <View style={styles.block}>
          <Text style={styles.subheading}>AI study tips are off. You can turn them on in Profile, under Settings.</Text>
        </View>
      ) : null}

      {open && hasOverall ? (
        <OverallBlock profile={overall} tip={overallTip} tipsLoading={tipsLoading} styles={styles} theme={theme} />
      ) : null}

      {open && skills.length > 0 ? (
        <>
          <View style={styles.block}>
            <View style={styles.headingRow}>
              <Ionicons name="trending-up" size={14} color={Accent.red.fg} />
              <Text style={styles.heading}>Needs improvement</Text>
            </View>
            <Text style={styles.subheading}>
              The skills you haven&apos;t mastered yet, weakest first. Start with these materials.
            </Text>
          </View>

          {skills.map((skill) => (
            <SkillRow
              key={skill.skill_id}
              skill={skill}
              tip={tipBySkill.get(skill.skill_id)}
              tipsLoading={tipsLoading}
              materials={orderMaterials(materialsBySkill.get(skill.skill_id) ?? [], skill.mastery).slice(
                0,
                atRisk ? MAX_MATERIALS_AT_RISK : MAX_MATERIALS,
              )}
              renderMaterial={renderMaterial}
              styles={styles}
              theme={theme}
            />
          ))}
        </>
      ) : null}

    </View>
  );
}

/**
 * One weak skill as a dropdown: closed, its name and mastery; open, a blue
 * Study tip button that shows the AI's tip, then the skill's materials.
 */
function SkillRow({
  skill,
  tip,
  tipsLoading,
  materials,
  renderMaterial,
  styles,
  theme,
}: {
  skill: FocusSkill;
  tip: AiTip | undefined;
  tipsLoading: boolean;
  materials: LibraryItem[];
  renderMaterial: (item: LibraryItem) => React.ReactNode;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const { Accent, Palette } = theme;
  const [open, setOpen] = React.useState(false);
  const [showTip, setShowTip] = React.useState(false);
  const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  return (
    <View style={styles.block}>
      <Pressable
        onPress={() => {
          animate();
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Skill ${skill.skill_id}, ${skill.title}`}
        style={({ pressed }) => [styles.skillHeader, pressed && styles.pressed]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.skillTitle} numberOfLines={open ? undefined : 2}>
            <Text style={styles.skillId}>Skill {skill.skill_id} · </Text>
            {skill.title}
          </Text>
          {skill.mastery !== undefined ? <MasteryBar mastery={skill.mastery} styles={styles} theme={theme} /> : null}
        </View>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={Palette.textMuted} />
      </Pressable>

      {open ? (
        <>
          {tip || tipsLoading ? (
            <Pressable
              onPress={() => {
                animate();
                setShowTip((v) => !v);
              }}
              disabled={!tip}
              accessibilityRole="button"
              accessibilityState={{ expanded: showTip, disabled: !tip }}
              style={({ pressed }) => [
                styles.tipButton,
                { backgroundColor: Accent.blue.fg, opacity: tip ? 1 : 0.6 },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="bulb" size={14} color="#fff" />
              <Text style={styles.tipButtonText}>{tip ? (showTip ? 'Hide study tip' : 'Study tip') : 'Writing your study tip…'}</Text>
            </Pressable>
          ) : null}
          {tip && showTip ? (
            <View style={[styles.tip, { backgroundColor: Accent.blue.bg, borderColor: Accent.blue.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tipTitle, { color: Accent.blue.fg }]}>{tip.title}</Text>
                <Text style={styles.tipText}>{tip.tip}</Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.listLabel}>Study</Text>
          {materials.length > 0 ? (
            materials.map((m) => <React.Fragment key={m.id}>{renderMaterial(m)}</React.Fragment>)
          ) : (
            <Text style={styles.none}>No materials for this skill yet.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

/**
 * The student's whole standing, so what follows reads against it: overall
 * mastery across every skill, the weakest chapter, and the AI's overall
 * study tip.
 */
function OverallBlock({
  profile,
  tip,
  tipsLoading,
  styles,
  theme,
}: {
  profile: StudyProfile;
  tip: AiTip | undefined;
  tipsLoading: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const { Accent, Palette } = theme;
  const weakest = profile.chapters[0];
  return (
    <View style={styles.block}>
      <View style={styles.headingRow}>
        <Ionicons name="analytics" size={14} color={Accent.teal.fg} />
        <Text style={styles.heading}>Your overall standing</Text>
      </View>
      <Text style={styles.subheading}>
        {`${profile.mastered} of ${profile.skills} skills mastered so far.`}
      </Text>
      {profile.mastery !== null ? <MasteryBar mastery={profile.mastery} styles={styles} theme={theme} /> : null}
      {weakest ? (
        <Text style={styles.weakest}>
          {`Weakest area: Chapter ${weakest.chapter} ${weakest.area}, ${Math.round(weakest.mastery * 100)}% mastered`}
        </Text>
      ) : null}
      {tip ? (
        <View style={[styles.tip, { backgroundColor: Accent.blue.bg, borderColor: Accent.blue.border }]}>
          <Ionicons name="bulb" size={14} color={Accent.blue.fg} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.tipTitle, { color: Accent.blue.fg }]}>{tip.title}</Text>
            <Text style={styles.tipText}>{tip.tip}</Text>
          </View>
        </View>
      ) : tipsLoading ? (
        <View style={[styles.tip, { borderColor: Palette.border }]}>
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="45%" height={11} />
            <SkeletonBlock width="95%" height={10} style={{ marginTop: 6 }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * How well the student knows the skill, as BKT estimates it: red under 50%,
 * amber up to the 95% that counts as mastered.
 */
function MasteryBar({
  mastery,
  styles,
  theme,
}: {
  mastery: number;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const { Accent, Palette } = theme;
  const percent = Math.round(mastery * 100);
  const tone = mastery < 0.5 ? Accent.red : Accent.amber;
  return (
    <View
      style={styles.mastery}
      accessible
      accessibilityLabel={`Mastery ${percent} percent. 95 percent counts as mastered.`}
    >
      <View style={[styles.masteryTrack, { backgroundColor: Palette.border }]}>
        <View style={[styles.masteryFill, { width: `${Math.max(percent, 3)}%`, backgroundColor: tone.fg }]} />
      </View>
      <Text style={[styles.masteryText, { color: tone.fg }]}>{percent}% mastered</Text>
    </View>
  );
}

function createStyles({ Palette, Shadow, Type }: Theme) {
  return StyleSheet.create({
    panel: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      marginTop: Spacing.sm,
      overflow: 'hidden',
      ...Shadow.card,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md },
    headerPressed: { backgroundColor: Palette.surfaceMuted },
    icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    title: Type.itemTitle,
    summary: { ...Type.caption, marginTop: 2 },
    block: {
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heading: { ...Type.itemTitle },
    subheading: { ...Type.caption, marginTop: 2 },
    eyebrow: Type.eyebrow,
    skillTitle: { ...Type.itemTitle, marginTop: 2 },
    skillId: { color: Palette.primary, fontWeight: '700' },
    mastery: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    skillHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8 },
    tipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      minHeight: 44,
    },
    tipButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    weakest: { ...Type.caption, marginTop: 10 },
    masteryTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
    masteryFill: { height: '100%', borderRadius: 3 },
    masteryText: { ...Type.micro, fontWeight: '700' },
    tip: {
      flexDirection: 'row',
      gap: 8,
      marginTop: Spacing.sm,
      padding: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    tipTitle: { fontSize: 13, fontWeight: '700' },
    tipText: { fontSize: 13, color: Palette.text, lineHeight: 18, marginTop: 2 },
    listLabel: { ...Type.eyebrow, marginTop: Spacing.sm },
    none: { ...Type.micro, marginTop: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowTitle: Type.itemTitle,
    rowMeta: { ...Type.micro, marginTop: 2 },
    more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    moreText: { fontSize: 13, fontWeight: '700', color: Palette.primary },
  });
}
