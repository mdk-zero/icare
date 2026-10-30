import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
const MAX_QUIZZES = 2;
const MAX_STEPS = 3;

const KIND_LABEL: Record<SkillEvidence['kind'], string> = {
  quiz: 'Quiz',
  patient_case: 'Patient Case',
  return_demo: 'Return Demo',
};

type Theme = ReturnType<typeof useTheme>;

/**
 * The top of the Library: the skills whose latest quiz, Patient Case or
 * Return Demonstration result needs improvement, each with what flagged it,
 * an AI study tip, its Library materials and the quizzes that cover it; then
 * the ML service's quiz picks. Hidden when nothing needs improvement and the
 * ML has nothing to suggest.
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
  const [showAll, setShowAll] = React.useState(false);

  const quizById = new Map(quizzes.map((q) => [q.id, q]));
  const tipBySkill = new Map(tips.filter((t) => t.skill_id).map((t) => [t.skill_id as string, t]));
  // Suggestions for quizzes the student can open, and not already listed under a skill.
  const underSkills = new Set(skills.flatMap((s) => s.quiz_ids));
  const suggestions = recommendations.filter(
    (r) => r.assessments && quizById.has(r.assessment_id) && !underSkills.has(r.assessment_id),
  );

  if (loading && skills.length === 0) {
    return (
      <View style={styles.section} accessibilityLabel="Loading what needs improvement">
        <SkeletonBlock width={140} height={12} />
        <View style={[styles.card, { marginTop: Spacing.sm }]}>
          <SkeletonBlock width="70%" height={15} />
          <SkeletonBlock width="90%" height={11} style={{ marginTop: 10 }} />
          <SkeletonBlock width="60%" height={11} style={{ marginTop: 6 }} />
        </View>
      </View>
    );
  }
  if (skills.length === 0 && suggestions.length === 0) return null;

  const shown = showAll ? skills : skills.slice(0, FIRST_SKILLS);
  const openQuiz = (id: string) => router.push(`/quiz-info/${id}`);

  return (
    <View style={styles.section}>
      {skills.length > 0 ? (
        <>
          <View style={styles.headingRow}>
            <Ionicons name="trending-up" size={16} color={Accent.red.fg} />
            <Text style={styles.heading}>Needs improvement</Text>
            <View style={[styles.count, { backgroundColor: Accent.red.bg }]}>
              <Text style={[styles.countText, { color: Accent.red.fg }]}>{skills.length}</Text>
            </View>
          </View>
          <Text style={styles.subheading}>
            Skills your latest quiz, Patient Case or Return Demo results flagged. Study these first.
          </Text>

          {shown.map((skill) => {
            const tip = tipBySkill.get(skill.skill_id);
            const materials = (materialsBySkill.get(skill.skill_id) ?? []).slice(0, MAX_MATERIALS);
            const skillQuizzes = skill.quiz_ids
              .map((id) => quizById.get(id))
              .filter((q): q is StudentAssessment => !!q)
              .slice(0, MAX_QUIZZES);
            return (
              <View key={skill.skill_id} style={styles.card}>
                <Text style={styles.eyebrow}>
                  Chapter {skill.chapter} · {skill.area}
                </Text>
                <Text style={styles.skillTitle}>
                  <Text style={styles.skillId}>Skill {skill.skill_id} · </Text>
                  {skill.title}
                </Text>

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

                {skillQuizzes.length > 0 ? (
                  <>
                    <Text style={styles.listLabel}>Practise</Text>
                    {skillQuizzes.map((q) => (
                      <QuizRow key={q.id} quiz={q} onPress={() => openQuiz(q.id)} styles={styles} theme={theme} />
                    ))}
                  </>
                ) : null}
              </View>
            );
          })}

          {skills.length > FIRST_SKILLS ? (
            <Pressable onPress={() => setShowAll((v) => !v)} style={styles.more} accessibilityRole="button">
              <Text style={styles.moreText}>
                {showAll ? 'Show fewer' : `Show ${skills.length - FIRST_SKILLS} more`}
              </Text>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={Palette.primary} />
            </Pressable>
          ) : null}
        </>
      ) : null}

      {suggestions.length > 0 ? (
        <>
          <View style={[styles.headingRow, skills.length > 0 && { marginTop: Spacing.md }]}>
            <Ionicons name="sparkles" size={16} color={Accent.violet.fg} />
            <Text style={styles.heading}>Suggested quizzes</Text>
          </View>
          <Text style={styles.subheading}>Picked by the iCARE AI from your quiz scores and checklist ratings.</Text>
          <View style={styles.card}>
            {suggestions.slice(0, 3).map((r) => (
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
        </>
      ) : null}
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
      : `Needs Practice on ${e.needs_practice.length} ${e.needs_practice.length === 1 ? 'step' : 'steps'}`;
  return (
    <View style={styles.evidence}>
      <Text style={styles.evidenceLine} numberOfLines={2}>
        <Text style={styles.evidenceKind}>{KIND_LABEL[e.kind]} · </Text>
        {e.title}
        <Text style={{ color: Accent.red.fg, fontWeight: '700' }}> · {verdict}</Text>
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

function QuizRow({
  quiz,
  onPress,
  styles,
  theme,
}: {
  quiz: StudentAssessment;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const { Accent, Palette } = theme;
  // What opening it will do: the info screen decides, this only says so.
  const action =
    quiz.attempt_count === 0 && quiz.attempts_remaining !== 0
      ? 'Take quiz'
      : quiz.attempts_remaining === 0
        ? quiz.practice_available
          ? 'Practice again'
          : 'No tries left'
        : 'Take it again';
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <View style={[styles.rowIcon, { backgroundColor: Accent.teal.bg }]}>
        <Ionicons name="school" size={18} color={Accent.teal.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {quiz.title}
        </Text>
        <Text style={styles.rowMeta}>
          {quiz.best_score !== null ? `Best ${Math.round(quiz.best_score)}% · ` : ''}
          {action}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Palette.textFaint} />
    </Pressable>
  );
}

function createStyles({ Palette, Shadow, Type }: Theme) {
  return StyleSheet.create({
    section: { marginTop: Spacing.sm, marginBottom: Spacing.sm },
    headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heading: { ...Type.sectionTitle },
    count: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 },
    countText: { fontSize: 11, fontWeight: '800' },
    subheading: { ...Type.caption, marginTop: 2, marginBottom: Spacing.sm },
    card: {
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      ...Shadow.card,
    },
    eyebrow: Type.eyebrow,
    skillTitle: { ...Type.itemTitle, marginTop: 2 },
    skillId: { color: Palette.primary, fontWeight: '700' },
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
    more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm },
    moreText: { fontSize: 13, fontWeight: '700', color: Palette.primary },
  });
}
