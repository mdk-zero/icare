import React from 'react';
import { View, Text, StyleSheet, Pressable, LayoutAnimation } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SkeletonBlock } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { AiTip, FocusSkill, LibraryItem, Recommendation, SkillEvidence, StudentAssessment } from '@/lib/api';

/** Skills shown before "Show more": the newest-flagged ones. */
const FIRST_SKILLS = 3;
/** Per skill, so one card never outgrows the screen. */
const MAX_MATERIALS = 3;
const MAX_STEPS = 3;
/** ML quiz picks, after the ones already listed under a skill. */
const MAX_SUGGESTIONS = 3;

const KIND_LABEL: Record<SkillEvidence['kind'], string> = {
  quiz: 'Quiz',
  patient_case: 'Patient Case',
  return_demo: 'Return Demo',
};

type Theme = ReturnType<typeof useTheme>;

/**
 * A closed panel at the top of the Library, so the materials come first: its
 * header says how many skills need improvement and how many quizzes the ML
 * suggests, and opening it shows each skill BKT says isn't mastered yet (least
 * mastered first), with its mastery, its latest results, an AI study tip and
 * its Library materials (or a note that it has none yet); then the ML
 * service's quiz picks. Hidden when nothing needs improvement and the ML has
 * nothing to suggest.
 */
export function FocusSection({
  skills,
  loading,
  tips,
  tipsLoading,
  quizzes,
  recommendations,
  materialsBySkill,
  renderMaterial,
}: {
  skills: FocusSkill[];
  loading: boolean;
  tips: AiTip[];
  tipsLoading: boolean;
  quizzes: StudentAssessment[];
  recommendations: Recommendation[];
  materialsBySkill: Map<string, LibraryItem[]>;
  renderMaterial: (item: LibraryItem) => React.ReactNode;
}) {
  const theme = useTheme();
  const { Palette, Accent } = theme;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  const quizById = new Map(quizzes.map((q) => [q.id, q]));
  const tipBySkill = new Map(tips.filter((t) => t.skill_id).map((t) => [t.skill_id as string, t]));
  // Suggestions for quizzes the student can open.
  const suggestions = recommendations
    .filter((r) => r.assessments && quizById.has(r.assessment_id))
    .slice(0, MAX_SUGGESTIONS);

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
  if (skills.length === 0 && suggestions.length === 0) return null;

  const shown = showAll ? skills : skills.slice(0, FIRST_SKILLS);
  const openQuiz = (id: string) => router.push(`/quiz-info/${id}`);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  const summary = [
    skills.length > 0 ? `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'} to improve` : null,
    suggestions.length > 0 ? `${suggestions.length} suggested ${suggestions.length === 1 ? 'quiz' : 'quizzes'}` : null,
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

      {open && skills.length > 0 ? (
        <>
          <View style={styles.block}>
            <View style={styles.headingRow}>
              <Ionicons name="trending-up" size={14} color={Accent.red.fg} />
              <Text style={styles.heading}>Needs improvement</Text>
            </View>
            <Text style={styles.subheading}>
              Your weakest skills first, estimated from your quizzes, Patient Cases and Return Demos. Study these
              materials first.
            </Text>
          </View>

          {shown.map((skill) => {
            const tip = tipBySkill.get(skill.skill_id);
            const materials = (materialsBySkill.get(skill.skill_id) ?? []).slice(0, MAX_MATERIALS);
            return (
              <View key={skill.skill_id} style={styles.block}>
                <Text style={styles.eyebrow}>
                  Chapter {skill.chapter} · {skill.area}
                </Text>
                <Text style={styles.skillTitle}>
                  <Text style={styles.skillId}>Skill {skill.skill_id} · </Text>
                  {skill.title}
                </Text>
                {skill.mastery !== undefined ? <MasteryBar mastery={skill.mastery} styles={styles} theme={theme} /> : null}

                {skill.evidence.slice(0, 2).map((e, i) => (
                  <EvidenceLine key={`${e.kind}-${e.at}-${i}`} evidence={e} styles={styles} theme={theme} />
                ))}

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

                <Text style={styles.listLabel}>Study</Text>
                {materials.length > 0 ? (
                  materials.map((m) => <React.Fragment key={m.id}>{renderMaterial(m)}</React.Fragment>)
                ) : (
                  <Text style={styles.none}>No materials for this skill yet.</Text>
                )}
              </View>
            );
          })}

          {skills.length > FIRST_SKILLS ? (
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowAll((v) => !v);
              }}
              style={[styles.block, styles.more]}
              accessibilityRole="button"
            >
              <Text style={styles.moreText}>
                {showAll ? 'Show fewer' : `Show ${skills.length - FIRST_SKILLS} more`}
              </Text>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={Palette.primary} />
            </Pressable>
          ) : null}
        </>
      ) : null}

      {open && suggestions.length > 0 ? (
        <View style={styles.block}>
          <View style={styles.headingRow}>
            <Ionicons name="sparkles" size={14} color={Accent.violet.fg} />
            <Text style={styles.heading}>Suggested quizzes</Text>
          </View>
          <Text style={styles.subheading}>Picked by the iCARE AI from your quiz scores and checklist ratings.</Text>
          {suggestions.map((r) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => openQuiz(r.assessment_id)}
              accessibilityRole="button"
            >
              <View style={[styles.rowIcon, { backgroundColor: Accent.violet.bg }]}>
                <Ionicons name="help-circle" size={18} color={Accent.violet.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {r.assessments?.title}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={2}>
                  {r.reason}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Palette.textFaint} />
            </Pressable>
          ))}
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

function EvidenceLine({
  evidence: e,
  styles,
  theme,
}: {
  evidence: SkillEvidence;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const { Accent } = theme;
  const when = new Date(e.at).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const verdict =
    e.kind === 'quiz'
      ? `${Math.round(e.score ?? 0)}% on this skill`
      : e.weak
        ? `Needs Practice on ${e.needs_practice.length} ${e.needs_practice.length === 1 ? 'step' : 'steps'}`
        : 'Satisfactory or better';
  return (
    <View style={styles.evidence}>
      <Text style={styles.evidenceLine} numberOfLines={2}>
        <Text style={styles.evidenceKind}>{KIND_LABEL[e.kind]} · </Text>
        {e.title}
        <Text style={{ color: e.weak ? Accent.red.fg : Accent.green.fg, fontWeight: '700' }}> · {verdict}</Text>
        <Text style={styles.evidenceWhen}> · {when}</Text>
      </Text>
      {e.needs_practice.slice(0, MAX_STEPS).map((step) => (
        <Text key={step} style={styles.step} numberOfLines={2}>
          • {step}
        </Text>
      ))}
      {e.needs_practice.length > MAX_STEPS ? (
        <Text style={styles.step}>+ {e.needs_practice.length - MAX_STEPS} more</Text>
      ) : null}
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
    masteryTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
    masteryFill: { height: '100%', borderRadius: 3 },
    masteryText: { ...Type.micro, fontWeight: '700' },
    evidence: { marginTop: 6 },
    evidenceLine: { ...Type.caption, lineHeight: 17 },
    evidenceKind: { fontWeight: '700', color: Palette.text },
    evidenceWhen: { color: Palette.textMuted },
    step: { ...Type.micro, marginLeft: 8, marginTop: 2, lineHeight: 15 },
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
