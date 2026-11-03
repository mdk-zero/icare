import React from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionHeader, SkeletonBlock } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { SkillMastery } from '@/lib/api';

/**
 * Bayesian Knowledge Tracing in the app, as on the web portal: a student's
 * chance of knowing each skill, on their Progress screen and on the student
 * screen their instructor opens. Keep these in step with web/app/lib/bkt.ts.
 */
const MASTERY_THRESHOLD = 0.95;
const MIN_FIT_STUDENTS = 5;
const MIN_FIT_ANSWERS = 40;

/** Weakest skills shown before "Show more". */
const FIRST_ROWS = 5;

const THRESHOLD_PCT = Math.round(MASTERY_THRESHOLD * 100);

/**
 * P(known) as a percentage. Never rounds up to the mastery line or to a
 * certainty the model can't reach: 94.6% is not yet mastered, and 99.9% isn't 100%.
 */
function masteryPercent(value: number): number {
  return Math.min(Math.round(value * 100), value < MASTERY_THRESHOLD ? THRESHOLD_PCT - 1 : 99);
}

/** Says how far to trust the numbers: a cold-start skill is a rough estimate. */
function sourceNote(skills: SkillMastery[]): string {
  const count = (source: SkillMastery['source']) => skills.filter((s) => s.source === source).length;
  const [fitted, chapter, cold] = [count('fitted'), count('chapter'), count('default')];
  const fit = `A skill gets its own fit at ${MIN_FIT_STUDENTS} students and ${MIN_FIT_ANSWERS} results.`;
  if (cold === skills.length) return `Rough estimates for now: every skill here is on the starting parameters. ${fit}`;
  const parts = [
    fitted > 0 && `${fitted} ${fitted === 1 ? 'skill' : 'skills'} fitted on ${fitted === 1 ? 'its' : 'their'} own results`,
    chapter > 0 && `${chapter} on a chapter's fit`,
    cold > 0 && `${cold} on the starting parameters`,
  ].filter(Boolean);
  return `${parts.join(' · ')}.${cold > 0 || chapter > 0 ? ` ${fit}` : ''}`;
}

export function SkillMasterySection({
  skills,
  loading,
  error,
  intro,
  empty,
  style,
}: {
  skills: SkillMastery[] | null;
  loading: boolean;
  error: string | null;
  intro: string;
  empty: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette), [Palette]);
  const [showAll, setShowAll] = React.useState(false);

  const all = skills ?? [];
  const shown = showAll ? all : all.slice(0, FIRST_ROWS);
  const hasRows = all.length > 0;

  return (
    <View style={style}>
      <SectionHeader title="Skill Mastery (BKT)" count={hasRows ? all.length : undefined} />
      <Text style={styles.intro}>{intro}</Text>
      <Card>
        {loading && !skills ? (
          [0, 1, 2].map((index) => (
            <View key={index} style={[styles.row, index > 0 && styles.rowBorder]} accessibilityLabel="Loading skill mastery">
              <SkeletonBlock width={['65%', '50%', '60%'][index] as `${number}%`} height={14} />
              <View style={[styles.track, styles.skeletonTrack]} />
            </View>
          ))
        ) : !hasRows ? (
          <Text style={styles.empty}>{error ? "Skill mastery couldn't be loaded. Pull down to try again." : empty}</Text>
        ) : (
          <>
            <View style={styles.key}>
              <View style={styles.keyTick} />
              <Text style={styles.keyText}>{THRESHOLD_PCT}% = mastered</Text>
            </View>
            {shown.map((skill, index) => {
              const pct = masteryPercent(skill.mastery);
              const mastered = skill.mastery >= MASTERY_THRESHOLD;
              const detail = `${skill.correct} of ${skill.answers} ${skill.answers === 1 ? 'result' : 'results'} good`;
              return (
                <View
                  key={skill.skill_id}
                  style={[styles.row, index > 0 && styles.rowBorder]}
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel={`Skill ${skill.skill_id}, ${skill.title}. ${detail}${mastered ? '. Mastered' : ''}`}
                  accessibilityValue={{ min: 0, max: 100, now: pct }}
                >
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>
                      <Text style={styles.skillId}>{skill.skill_id} </Text>
                      {skill.title}
                    </Text>
                    <Text style={styles.percent}>{pct}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${pct}%` }]} />
                    <View style={[styles.tick, { left: `${THRESHOLD_PCT}%` }]} />
                  </View>
                  <View style={styles.detailRow}>
                    {mastered && (
                      <View style={styles.mastered}>
                        <Ionicons name="checkmark-circle" size={13} color={Accent.green.fg} />
                        <Text style={[styles.masteredText, { color: Accent.green.fg }]}>Mastered</Text>
                      </View>
                    )}
                    <Text style={styles.detail}>{detail}</Text>
                  </View>
                </View>
              );
            })}
            {all.length > FIRST_ROWS && (
              <Pressable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setShowAll((v) => !v);
                }}
                style={styles.more}
                accessibilityRole="button"
              >
                <Text style={styles.moreText}>{showAll ? 'Show fewer' : `Show ${all.length - FIRST_ROWS} more`}</Text>
                <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={Palette.primary} />
              </Pressable>
            )}
            <Text style={styles.note}>{sourceNote(all)}</Text>
          </>
        )}
      </Card>
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    intro: {
      fontSize: 12,
      lineHeight: 17,
      color: Palette.textSecondary,
      marginBottom: Spacing.sm,
    },
    key: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
      paddingTop: Spacing.xs,
    },
    keyTick: {
      width: 1,
      height: 11,
      backgroundColor: Palette.textSecondary,
    },
    keyText: {
      fontSize: 11,
      color: Palette.textMuted,
    },
    row: {
      paddingVertical: Spacing.md,
    },
    rowBorder: {
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      marginBottom: Spacing.sm,
    },
    title: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: Palette.ink,
    },
    skillId: {
      fontWeight: '400',
      color: Palette.textMuted,
      fontVariant: ['tabular-nums'],
    },
    percent: {
      fontSize: 14,
      fontWeight: '700',
      color: Palette.ink,
      fontVariant: ['tabular-nums'],
    },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: Palette.border,
    },
    skeletonTrack: {
      marginTop: Spacing.sm,
    },
    fill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: Palette.primary,
    },
    tick: {
      position: 'absolute',
      top: -2,
      bottom: -2,
      width: 1,
      backgroundColor: Palette.textSecondary,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: 6,
    },
    mastered: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    masteredText: {
      fontSize: 11,
      fontWeight: '700',
    },
    detail: {
      fontSize: 11,
      color: Palette.textMuted,
    },
    more: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    moreText: {
      fontSize: 13,
      fontWeight: '700',
      color: Palette.primary,
    },
    note: {
      fontSize: 11,
      lineHeight: 15,
      color: Palette.textMuted,
      paddingVertical: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: Palette.borderLight,
    },
    empty: {
      fontSize: 13,
      color: Palette.textMuted,
      textAlign: 'center',
      paddingVertical: Spacing.md,
    },
  });
}
