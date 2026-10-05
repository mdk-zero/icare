import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SkeletonBlock, EmptyState, PrimaryButton } from '@/components/ui';
import { useApiData } from '@/hooks/useApiData';
import { fetchFlashcards, Flashcard } from '@/lib/api';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { ScoreRing } from '@/components/ScoreRing';

/** Teal ramp sampled from the pill logo's cap (same as the app header and profile). */
const Teal = { deepest: '#082E38', deep: '#0D4550', primary: '#1B6B7B' };

const FLIP = { duration: 420, easing: Easing.inOut(Easing.cubic) };

/**
 * Study cards for a finished quiz: the question on the front, the answer on
 * the back. Tap to flip, then sort the card into "Still learning" or "Got it";
 * at the end the ones still being learned can be gone through again.
 */
export default function FlashcardsScreen() {
  const { id } = useLocalSearchParams();
  const quizId = id as string;
  const router = useRouter();
  const { Palette, Accent, Shadow } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow), [Palette, Accent, Shadow]);
  const { data, loading, error } = useApiData(() => fetchFlashcards(quizId));

  // The round being studied: every card at first, then only the ones still being learned.
  const [deck, setDeck] = React.useState<Flashcard[] | null>(null);
  const [index, setIndex] = React.useState(0);
  const [learning, setLearning] = React.useState<string[]>([]);
  const [known, setKnown] = React.useState<string[]>([]);
  const [flipped, setFlipped] = React.useState(false);

  const rotation = useSharedValue(0);
  const cards = data?.cards ?? null;
  const round = deck ?? cards ?? [];

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(rotation.value, [0, 1], [180, 360])}deg` }],
  }));

  const flip = () => {
    const next = !flipped;
    setFlipped(next);
    rotation.set(withTiming(next ? 1 : 0, FLIP));
  };

  const sort = (gotIt: boolean) => {
    const card = round[index];
    if (!card) return;
    if (gotIt) setKnown((k) => [...k, card.id]);
    else setLearning((l) => [...l, card.id]);
    // The next card starts face up, without spinning back into view.
    rotation.set(0);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const restart = (only: Flashcard[]) => {
    setDeck(only);
    setIndex(0);
    setLearning([]);
    setKnown([]);
    setFlipped(false);
    rotation.set(0);
  };

  if (loading && !data) {
    const light = { backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center' as const };
    return (
      <View style={[styles.container, styles.content]} accessibilityLabel="Loading flashcards">
        <SkeletonBlock width="70%" height={20} style={{ marginBottom: Spacing.md }} />
        <View style={styles.progressHead}>
          <SkeletonBlock width={90} height={13} />
          <SkeletonBlock width={60} height={13} />
        </View>
        <View style={styles.progressTrack} />
        <View style={styles.cardWrap}>
          <View style={styles.face}>
            <LinearGradient
              colors={[Teal.deepest, Teal.deep, Teal.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.faceFill}
            >
              <View style={styles.faceHead}>
                <Ionicons name="help-circle" size={16} color="#9FC8D2" />
                <Text style={[styles.faceEyebrow, { color: '#9FC8D2' }]}>Question</Text>
              </View>
              <View style={[styles.faceBody, { gap: 10 }]}>
                <SkeletonBlock width="85%" height={20} radius={5} style={light} />
                <SkeletonBlock width="70%" height={20} radius={5} style={light} />
                <SkeletonBlock width="45%" height={20} radius={5} style={light} />
              </View>
              <SkeletonBlock width={150} height={12} style={light} />
            </LinearGradient>
          </View>
        </View>
      </View>
    );
  }

  if (!cards || cards.length === 0) {
    // A server without this feature yet answers 404: say so plainly.
    const message =
      error === 'Request failed (404)'
        ? 'Flashcards aren’t available on the server yet. They’ll appear once the latest update is live.'
        : (error ?? 'This quiz has no flashcards yet.');
    return (
      <View style={styles.center}>
        <EmptyState icon={error ? 'cloud-offline-outline' : 'copy-outline'} message={message} />
      </View>
    );
  }

  const finished = index >= round.length;
  const card = round[index];
  const progress = round.length ? Math.min(index, round.length) / round.length : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data?.title ? (
        <Text style={styles.deckTitle} numberOfLines={2}>
          {data.title}
        </Text>
      ) : null}

      {/* Progress through the round */}
      <View style={styles.progressHead}>
        <Text style={styles.progressText}>
          {finished ? 'Round complete' : `Card ${index + 1} of ${round.length}`}
        </Text>
        <View style={styles.tally}>
          <Ionicons name="checkmark-circle" size={14} color={Accent.green.fg} />
          <Text style={styles.tallyText}>{known.length}</Text>
          <Ionicons name="refresh-circle" size={14} color={Accent.amber.fg} style={{ marginLeft: 8 }} />
          <Text style={styles.tallyText}>{learning.length}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(finished ? 1 : progress) * 100}%` }]} />
      </View>

      {finished ? (
        <View style={styles.summary}>
          <ScoreRing
            score={Math.round((known.length / Math.max(1, round.length)) * 100)}
            size={96}
            stroke={9}
            color={learning.length === 0 ? Accent.green.fg : Palette.primary}
            label="got it"
          />
          <Text style={styles.summaryTitle}>
            {learning.length === 0 ? 'You got every card!' : `${known.length} of ${round.length} down`}
          </Text>
          <Text style={styles.summaryText}>
            {learning.length === 0
              ? 'Nothing left to review in this round.'
              : `${learning.length} ${learning.length === 1 ? 'card is' : 'cards are'} worth another pass.`}
          </Text>
          {learning.length > 0 ? (
            <PrimaryButton
              title={`Review the ${learning.length} still learning`}
              onPress={() => restart(round.filter((c) => learning.includes(c.id)))}
              size="lg"
              style={styles.fullWidth}
            />
          ) : null}
          <PrimaryButton
            title={`Restart all ${cards.length} cards`}
            onPress={() => restart(cards)}
            variant="outline"
            style={styles.fullWidth}
          />
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.doneText}>Back to the quiz</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            onPress={flip}
            accessibilityRole="button"
            accessibilityLabel={flipped ? `Answer: ${card.answer}. Tap to see the question.` : `Question: ${card.question}. Tap to see the answer.`}
            style={styles.cardWrap}
          >
            <Animated.View style={[styles.face, frontStyle]}>
              <LinearGradient
                colors={[Teal.deepest, Teal.deep, Teal.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.faceFill}
              >
                <View style={styles.faceHead}>
                  <Ionicons name="help-circle" size={16} color="#9FC8D2" />
                  <Text style={[styles.faceEyebrow, { color: '#9FC8D2' }]}>Question</Text>
                </View>
                <View style={styles.faceBody}>
                  <Text style={styles.question}>{card.question}</Text>
                </View>
                <Text style={[styles.hint, { color: 'rgba(255,255,255,0.6)' }]}>Tap to reveal the answer</Text>
              </LinearGradient>
            </Animated.View>
            <Animated.View style={[styles.face, styles.back, backStyle]}>
              <View style={styles.faceFill}>
                <View style={styles.faceHead}>
                  <Ionicons name="checkmark-circle" size={16} color={Accent.green.fg} />
                  <Text style={[styles.faceEyebrow, { color: Accent.green.fg }]}>Answer</Text>
                </View>
                <View style={styles.faceBody}>
                  <Text style={styles.answer}>{card.answer}</Text>
                  {card.explanation ? <Text style={styles.explanation}>{card.explanation}</Text> : null}
                </View>
                <Text style={styles.hint}>Tap to see the question again</Text>
              </View>
            </Animated.View>
          </Pressable>

          <View style={[styles.sortRow, !flipped && styles.sortRowHidden]} pointerEvents={flipped ? 'auto' : 'none'}>
            <Pressable
              style={({ pressed }) => [styles.sortButton, styles.sortLearning, pressed && styles.pressed]}
              onPress={() => sort(false)}
              accessibilityRole="button"
            >
              <Ionicons name="refresh" size={16} color={Accent.amber.fg} />
              <Text style={[styles.sortText, { color: Accent.amber.fg }]}>Still learning</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.sortButton, styles.sortGotIt, pressed && styles.pressed]}
              onPress={() => sort(true)}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={[styles.sortText, { color: '#fff' }]}>Got it</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.lg, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    fullWidth: { alignSelf: 'stretch' },
    deckTitle: { fontSize: 16, fontWeight: '800', color: Palette.ink, marginBottom: Spacing.md },
    progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    progressText: { fontSize: 12, fontWeight: '700', color: Palette.textSecondary },
    tally: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    tallyText: { fontSize: 12, fontWeight: '800', color: Palette.ink, fontVariant: ['tabular-nums'] },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: Palette.borderLight,
      overflow: 'hidden',
      marginTop: 6,
      marginBottom: Spacing.lg,
    },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: Palette.primary },
    cardWrap: { height: 380 },
    face: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backfaceVisibility: 'hidden',
      borderRadius: Radius.lg,
      overflow: 'hidden',
      ...Shadow.card,
    },
    back: { backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.border },
    faceFill: { flex: 1, padding: Spacing.xl },
    faceHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    faceEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
    faceBody: { flex: 1, justifyContent: 'center' },
    question: { fontSize: 21, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 29 },
    answer: { fontSize: 20, fontWeight: '800', color: Palette.ink, textAlign: 'center', lineHeight: 28 },
    explanation: {
      fontSize: 13,
      color: Palette.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginTop: Spacing.md,
    },
    hint: { fontSize: 11, color: Palette.textMuted, textAlign: 'center' },
    sortRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
    sortRowHidden: { opacity: 0 },
    sortButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 48,
      borderRadius: Radius.pill,
    },
    sortLearning: { backgroundColor: Accent.amber.bg, borderWidth: 1, borderColor: Accent.amber.border },
    sortGotIt: { backgroundColor: Palette.primary },
    sortText: { fontSize: 14, fontWeight: '800' },
    summary: {
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: Palette.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      padding: Spacing.xl,
      ...Shadow.card,
    },
    summaryTitle: { fontSize: 20, fontWeight: '800', color: Palette.ink, textAlign: 'center' },
    summaryText: { fontSize: 13, color: Palette.textSecondary, textAlign: 'center' },
    doneText: { fontSize: 14, fontWeight: '700', color: Palette.primary, marginTop: Spacing.xs },
  });
}
