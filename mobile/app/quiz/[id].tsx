import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton, SkeletonScreen, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { startAttempt, submitAttempt, StartedAttempt, AttemptResult } from '@/lib/api';
import { ReflectionCard } from '@/components/ReflectionCard';
import { ApiError, isNetworkError } from '@/lib/client';
import { useAuth } from '@/hooks/useAuth';

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** The College's passing mark for Skill Assessments, as a percentage. */
const PASSING_SCORE = 75;

type Palette = ReturnType<typeof useTheme>['Palette'];

/** A point on a circle, 0° pointing right and turning clockwise (SVG's y runs down). */
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, sweep: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, from + sweep);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

/**
 * The result dial: a 240° arc open at the bottom, filled to the score, with
 * the verdict and the score inside, like an exam scorecard.
 */
function ScoreGauge({
  score,
  passed,
  detail,
  Palette,
  color,
}: {
  score: number;
  passed: boolean;
  detail: string;
  Palette: Palette;
  color: string;
}) {
  const size = 220;
  const c = size / 2;
  const r = 92;
  const START = 150;
  const SWEEP = 240;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * SWEEP;
  return (
    <View style={{ width: size, height: 178, alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0 }}>
        <Path d={arcPath(c, c, r, START, SWEEP)} stroke={Palette.border} strokeWidth={14} strokeLinecap="round" fill="none" />
        {filled > 0 && (
          <Path d={arcPath(c, c, r, START, filled)} stroke={color} strokeWidth={14} strokeLinecap="round" fill="none" />
        )}
      </Svg>
      <View style={{ position: 'absolute', top: 58, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color }}>{passed ? 'Passed' : 'Not passed'}</Text>
        <Text style={{ fontSize: 38, fontWeight: '800', color: Palette.ink, marginTop: 2, fontVariant: ['tabular-nums'] }}>
          {score}%
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: Palette.textSecondary }}>{detail}</Text>
      </View>
      <Text style={{ position: 'absolute', bottom: 0, left: 22, fontSize: 11, fontWeight: '700', color: Palette.textMuted }}>0</Text>
      <Text style={{ position: 'absolute', bottom: 0, right: 16, fontSize: 11, fontWeight: '700', color: Palette.textMuted }}>100</Text>
    </View>
  );
}

/** One control in the exam toolbar: an icon and a label, outlined or filled. */
function ToolbarButton({
  label,
  icon,
  iconAfter = false,
  onPress,
  disabled = false,
  filled = false,
  Palette,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconAfter?: boolean;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
  Palette: Palette;
}) {
  const fg = disabled ? Palette.textMuted : filled ? '#fff' : Palette.primary;
  const glyph = <Ionicons name={icon} size={15} color={fg} />;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 38,
        paddingHorizontal: 12,
        borderRadius: Radius.md,
        borderWidth: 1.5,
        borderColor: disabled ? Palette.border : Palette.primary,
        backgroundColor: disabled ? (filled ? Palette.border : Palette.surface) : filled ? Palette.primary : Palette.surface,
      }}
    >
      {!iconAfter && glyph}
      <Text style={{ fontSize: 13, fontWeight: '700', color: fg }}>{label}</Text>
      {iconAfter && glyph}
    </TouchableOpacity>
  );
}

export default function QuizInterfaceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const assessmentId = id as string;
  const { Palette, Accent, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Accent, Type), [Palette, Accent, Type]);

  const [started, setStarted] = useState<StartedAttempt | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The quiz was refused rather than broken — out of attempts, not offline. */
  const [loadBlocked, setLoadBlocked] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  // question_id -> selected option index (null = unanswered)
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  // Questions passed over with Skip and not answered since.
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [showReview, setShowReview] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const reviewY = useRef(0);
  const { user } = useAuth();
  const [remaining, setRemaining] = useState<number | null>(null);
  // When time runs out, as a wall-clock instant: JS timers pause while the app
  // is in the background, so counting ticks would fall behind the server,
  // which times the attempt from started_at.
  const deadlineRef = useRef<number | null>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    startAttempt(assessmentId)
      .then((attempt) => {
        if (cancelled) return;
        setStarted(attempt);
        if (attempt.previous_expired) {
          Alert.alert(
            'New attempt',
            'Your last attempt was left open past its time limit, so it was closed. This is a fresh one.',
          );
        }
        const limit = attempt.assessment.time_limit_seconds;
        if (limit) {
          // A resumed attempt keeps its original clock. A fresh one starts
          // now, which avoids trusting the device's clock against the server's.
          const elapsedMs = attempt.resumed
            ? Math.max(0, Date.now() - new Date(attempt.attempt.started_at).getTime())
            : 0;
          deadlineRef.current = Date.now() + limit * 1000 - elapsedMs;
          setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // A 409 carries the server's own sentence about why there are no
        // attempts left; showing it verbatim beats a generic failure.
        setLoadError(
          isNetworkError(err)
            ? 'Quizzes need a connection to start — try again when you are back online.'
            : err instanceof Error
              ? err.message
              : 'Unable to start the quiz',
        );
        setLoadBlocked(err instanceof ApiError && err.status === 409);
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const questions = started?.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const answeredCount = Object.keys(answers).length;

  const doSubmit = useCallback(
    async (answersToSend: Record<string, number>) => {
      if (!started || submitting) return;
      setSubmitting(true);
      try {
        const graded = await submitAttempt(
          started.attempt.id,
          started.questions.map((q) => ({
            question_id: q.id,
            selected_index: answersToSend[q.id] ?? null,
          })),
        );
        setResult(graded);
        setFinishedAt(new Date());
      } catch (err) {
        Alert.alert(
          'Submission failed',
          isNetworkError(err)
            ? 'No connection — your answers are still here, try again in a moment.'
            : err instanceof Error
              ? err.message
              : 'Unable to submit',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [started, submitting],
  );

  // Countdown for time-limited assessments; auto-submits at zero.
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  });
  const timed = remaining !== null;
  useEffect(() => {
    if (!timed || result) return;
    // Read from the deadline, not decremented, so time spent in the
    // background counts. Ticking on its own keeps the countdown moving when a
    // tick lands on the same second as the last one.
    const timer = setInterval(() => {
      const deadline = deadlineRef.current;
      if (deadline !== null) setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(timer);
  }, [timed, result]);

  useEffect(() => {
    if (remaining === null || remaining > 0 || result) return;
    // Once: a failed submit re-renders with the clock still at zero, and must
    // not re-alert and re-submit in a loop. The submit button still works.
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    Alert.alert("Time's up", 'Submitting your answers now.');
    doSubmit(answersRef.current);
  }, [remaining, result, doSubmit]);

  const handleSelect = (index: number) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: index }));
    setSkipped((prev) => {
      if (!prev.has(currentQuestion.id)) return prev;
      const next = new Set(prev);
      next.delete(currentQuestion.id);
      return next;
    });
  };

  /** Leave this one unanswered and move on; it can be answered later with Previous. */
  const handleSkip = () => {
    if (!currentQuestion || isLastQuestion) return;
    const qid = currentQuestion.id;
    setAnswers((prev) => {
      if (!(qid in prev)) return prev;
      const next = { ...prev };
      delete next[qid];
      return next;
    });
    setSkipped((prev) => new Set(prev).add(qid));
    setCurrentIndex(currentIndex + 1);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      const unanswered = questions.length - answeredCount;
      Alert.alert(
        'Submit Quiz',
        unanswered > 0
          ? `${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} unanswered. Submit anyway?`
          : `Submit all ${questions.length} answers?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit', onPress: () => doSubmit(answers) },
        ],
      );
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState
          icon={loadBlocked ? 'lock-closed-outline' : 'cloud-offline-outline'}
          message={loadError}
        />
        {loadBlocked && (
          <View style={styles.blockedActions}>
            <PrimaryButton title="Back to quizzes" onPress={() => router.back()} variant="outline" />
          </View>
        )}
      </View>
    );
  }

  if (!started) {
    return <SkeletonScreen />;
  }

  // ------------------------------------------------------------
  // Results review
  // ------------------------------------------------------------
  if (result) {
    const passed = result.score >= PASSING_SCORE;
    const verdictColor = passed ? Accent.green.fg : Accent.red.fg;
    const minCorrect = Math.ceil((result.total * PASSING_SCORE) / 100);
    const limit = started.assessment.time_limit_seconds;
    const missed = started.questions.filter((q) => {
      const verdict = result.results.find((r) => r.question_id === q.id);
      return verdict && !verdict.is_correct;
    });
    const details = [
      {
        label: 'Time Spent',
        value: `${formatClock(result.time_taken_seconds)}${limit ? ` / ${formatClock(limit)}` : ''}`,
      },
      { label: 'Score', value: `${result.correct}/${result.total}` },
      { label: 'Min. Passing Score', value: `${minCorrect}/${result.total}` },
      {
        label: 'Date Finished',
        value: (finishedAt ?? new Date()).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      },
      ...(started.attempt_number
        ? [
            {
              label: 'Attempt',
              value: started.max_attempts
                ? `${started.attempt_number} of ${started.max_attempts}`
                : String(started.attempt_number),
            },
          ]
        : []),
    ];

    const openReview = () => {
      setShowReview(true);
      // After the list renders, bring it into view.
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: reviewY.current, animated: true }));
    };

    return (
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
        <Card style={styles.scoreCard}>
          {user?.name ? <Text style={styles.scoreStudent}>{user.name}</Text> : null}
          <Text style={styles.scoreTitle}>{started.assessment.title}</Text>

          <View style={styles.gaugeWrap}>
            <ScoreGauge
              score={result.score}
              passed={passed}
              detail={`${result.correct} of ${result.total} correct`}
              Palette={Palette}
              color={verdictColor}
            />
          </View>

          <View style={styles.detailGrid}>
            {details.map((d) => (
              <View key={d.label} style={styles.detailCell}>
                <Text style={styles.detailLabel}>{d.label}</Text>
                <Text style={styles.detailValue}>{d.value}</Text>
              </View>
            ))}
          </View>

          {result.late ? (
            <View style={styles.lateNote}>
              <Ionicons name="alert-circle" size={14} color={Accent.amber.fg} />
              <Text style={[styles.lateText, { color: Accent.amber.fg }]}>
                Submitted after the time limit — still graded, and your instructor can see it was late.
              </Text>
            </View>
          ) : null}

          <View style={styles.scoreActions}>
            <PrimaryButton
              title={missed.length > 0 ? `Review Missed Questions (${missed.length})` : 'No missed questions'}
              onPress={openReview}
              disabled={missed.length === 0}
            />
            <PrimaryButton title="Back to quizzes" onPress={() => router.back()} variant="outline" />
          </View>
        </Card>

        <ReflectionCard source="assessment" sourceId={started.attempt.id} />

        {showReview && (
          <View onLayout={(e) => (reviewY.current = e.nativeEvent.layout.y)}>
            <Text style={styles.reviewHeading}>Missed questions</Text>
            {missed.map((q) => {
              const verdict = result.results.find((r) => r.question_id === q.id)!;
              const idx = started.questions.indexOf(q);
              return (
                <Card key={q.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewNumber}>Q{idx + 1}</Text>
                    {verdict.selected_index === null ? (
                      <Text style={[styles.skippedTag, { color: Accent.amber.fg, backgroundColor: Accent.amber.bg }]}>
                        Skipped
                      </Text>
                    ) : (
                      <Ionicons name="close-circle" size={18} color={Accent.red.fg} />
                    )}
                  </View>
                  <Text style={styles.reviewQuestion}>{q.content}</Text>
                  {q.options.map((option, optIdx) => {
                    const isCorrect = optIdx === verdict.correct_index;
                    const isChosen = optIdx === verdict.selected_index;
                    if (!isCorrect && !isChosen) return null;
                    return (
                      <View
                        key={optIdx}
                        style={[styles.reviewOption, isCorrect ? styles.reviewOptionCorrect : styles.reviewOptionWrong]}
                      >
                        <Text style={[styles.reviewOptionText, { color: isCorrect ? Accent.green.fg : Accent.red.fg }]}>
                          {isCorrect ? '✓' : '✗'} {option}
                        </Text>
                      </View>
                    );
                  })}
                  {verdict.explanation ? <Text style={styles.reviewExplanation}>{verdict.explanation}</Text> : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  // ------------------------------------------------------------
  // Taking the quiz
  // ------------------------------------------------------------
  if (!currentQuestion) {
    return (
      <View style={styles.errorContainer}>
        <EmptyState icon="document-text-outline" message="This quiz has no questions yet." />
      </View>
    );
  }

  const selectedIndex = answers[currentQuestion.id] ?? null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Exam toolbar: Previous on the left, Skip and Next on the right. */}
      <View style={styles.toolbar}>
        <ToolbarButton
          label="Previous"
          icon="chevron-back"
          onPress={() => setCurrentIndex(currentIndex - 1)}
          disabled={currentIndex === 0 || submitting}
          Palette={Palette}
        />
        <View style={styles.toolbarRight}>
          {!isLastQuestion && (
            <ToolbarButton label="Skip" icon="play-skip-forward" iconAfter onPress={handleSkip} disabled={submitting} Palette={Palette} />
          )}
          <ToolbarButton
            label={submitting ? 'Submitting…' : isLastQuestion ? 'Submit' : 'Next'}
            icon={isLastQuestion ? 'paper-plane' : 'chevron-forward'}
            iconAfter
            filled
            onPress={handleNext}
            disabled={submitting || (selectedIndex === null && !isLastQuestion)}
            Palette={Palette}
          />
        </View>
      </View>

      <View style={styles.progressBar}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{currentIndex + 1}/{questions.length}</Text>
        {remaining !== null && (
          <View style={[styles.timerPill, remaining <= 60 && styles.timerPillUrgent]}>
            <Ionicons name="time-outline" size={13} color={remaining <= 60 ? Accent.red.fg : Palette.textSecondary} />
            <Text style={[styles.timerPillText, remaining <= 60 && { color: Accent.red.fg }]}>
              {formatClock(remaining)}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.answeredText}>
        {answeredCount}/{questions.length} answered
        {skipped.size > 0 ? ` · ${skipped.size} skipped` : ''}
      </Text>

      <Card style={styles.questionCard}>
        <Text style={styles.questionNumber}>Question {currentIndex + 1}</Text>
        <Text style={styles.questionText}>{currentQuestion.content}</Text>
      </Card>

      <View style={styles.options}>
        {currentQuestion.options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <TouchableOpacity
              key={index}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => handleSelect(index)}
            >
              <Text style={styles.optionText}>{option}</Text>
              {isSelected && <Ionicons name="radio-button-on" size={18} color={Palette.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
  blockedActions: { paddingHorizontal: Spacing.xxl, marginTop: Spacing.lg },
  progressBar: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progressTrack: { flex: 1, height: 8, backgroundColor: Palette.border, borderRadius: 4, marginRight: Spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Palette.primary, borderRadius: 4 },
  progressText: { fontSize: 14, fontWeight: '600', color: Palette.textSecondary },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: Spacing.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Palette.borderLight,
  },
  timerPillUrgent: { backgroundColor: Accent.red.bg },
  timerPillText: { fontSize: 12, fontWeight: '700', color: Palette.textSecondary, fontVariant: ['tabular-nums'] },
  questionCard: { marginBottom: Spacing.xxl },
  questionNumber: { ...Type.eyebrow, color: Palette.primary, marginBottom: Spacing.sm },
  questionText: { fontSize: 18, fontWeight: '600', color: Palette.ink, lineHeight: 27 },
  options: { marginBottom: Spacing.lg },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Palette.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: Palette.border,
  },
  optionSelected: { borderColor: Palette.primary, backgroundColor: Palette.primaryTint },
  optionText: { fontSize: 14, color: Palette.ink, flex: 1, lineHeight: 20 },
  answeredText: { fontSize: 12, color: Palette.textMuted, marginBottom: Spacing.xl },
  scoreCard: { marginBottom: Spacing.xl },
  scoreStudent: { fontSize: 13, fontWeight: '600', color: Palette.textSecondary },
  scoreTitle: { ...Type.title, marginTop: 2 },
  gaugeWrap: { alignItems: 'center', marginVertical: Spacing.lg },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.md },
  detailCell: { width: '50%', paddingRight: Spacing.sm },
  detailLabel: { fontSize: 12, fontWeight: '700', color: Palette.ink },
  detailValue: { fontSize: 13, color: Palette.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  lateNote: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: Spacing.md },
  lateText: { flex: 1, fontSize: 12, lineHeight: 17 },
  scoreActions: { gap: Spacing.sm, marginTop: Spacing.xl },
  skippedTag: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  reviewHeading: { ...Type.eyebrow, marginBottom: Spacing.md },
  reviewCard: { marginBottom: Spacing.md },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  reviewNumber: { fontSize: 12, fontWeight: '800', color: Palette.textMuted },
  reviewQuestion: { fontSize: 14, fontWeight: '600', color: Palette.ink, lineHeight: 20, marginBottom: Spacing.md },
  reviewOption: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  reviewOptionCorrect: { backgroundColor: Accent.green.bg },
  reviewOptionWrong: { backgroundColor: Accent.red.bg },
  reviewOptionText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  reviewExplanation: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },
  });
}
