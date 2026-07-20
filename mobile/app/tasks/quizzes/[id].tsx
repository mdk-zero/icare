import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton, SkeletonScreen, EmptyState } from '@/components/ui';
import { Accent, Palette, Radius, Spacing, Type } from '@/constants/theme';
import { startAttempt, submitAttempt, StartedAttempt, AttemptResult } from '@/lib/api';
import { isNetworkError } from '@/lib/client';

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function QuizInterfaceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const assessmentId = id as string;

  const [started, setStarted] = useState<StartedAttempt | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // question_id -> selected option index (null = unanswered)
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    startAttempt(assessmentId)
      .then((attempt) => {
        if (cancelled) return;
        setStarted(attempt);
        if (attempt.assessment.time_limit_seconds) {
          setRemaining(attempt.assessment.time_limit_seconds);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          isNetworkError(err)
            ? 'Quizzes need a connection to start — try again when you are back online.'
            : err instanceof Error
              ? err.message
              : 'Unable to start the quiz',
        );
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
  answersRef.current = answers;
  useEffect(() => {
    if (remaining === null || result) return;
    if (remaining <= 0) {
      Alert.alert("Time's up", 'Submitting your answers now.');
      doSubmit(answersRef.current);
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining, result, doSubmit]);

  const handleSelect = (index: number) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: index }));
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
        <EmptyState icon="cloud-offline-outline" message={loadError} />
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
    const passed = result.score >= 75;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Card style={styles.resultCard}>
          <View style={[styles.resultCircle, { backgroundColor: passed ? Accent.green.bg : Accent.amber.bg }]}>
            <Text style={[styles.resultScore, { color: passed ? Accent.green.fg : Accent.amber.fg }]}>
              {result.score}%
            </Text>
          </View>
          <Text style={styles.resultTitle}>
            {result.correct}/{result.total} correct
          </Text>
          <Text style={styles.resultSub}>
            {started.assessment.title} · {formatClock(result.time_taken_seconds)}
          </Text>
        </Card>

        <Text style={styles.reviewHeading}>Review</Text>
        {started.questions.map((q, idx) => {
          const verdict = result.results.find((r) => r.question_id === q.id);
          if (!verdict) return null;
          return (
            <Card key={q.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewNumber}>Q{idx + 1}</Text>
                <Ionicons
                  name={verdict.is_correct ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={verdict.is_correct ? Accent.green.fg : Accent.red.fg}
                />
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
              {verdict.explanation ? (
                <Text style={styles.reviewExplanation}>{verdict.explanation}</Text>
              ) : null}
            </Card>
          );
        })}

        <PrimaryButton title="Done" onPress={() => router.back()} size="lg" />
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

      <View style={styles.navRow}>
        {currentIndex > 0 ? (
          <TouchableOpacity style={styles.backButton} onPress={() => setCurrentIndex(currentIndex - 1)}>
            <Ionicons name="chevron-back" size={16} color={Palette.textSecondary} />
            <Text style={styles.backButtonText}>Previous</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <Text style={styles.answeredText}>
          {answeredCount}/{questions.length} answered
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          title={submitting ? 'Submitting…' : isLastQuestion ? 'Submit Quiz' : 'Next Question'}
          onPress={handleNext}
          disabled={submitting || (selectedIndex === null && !isLastQuestion)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', backgroundColor: Palette.background },
  progressBar: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xxl },
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
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  backButtonText: { fontSize: 13, fontWeight: '600', color: Palette.textSecondary },
  answeredText: { fontSize: 12, color: Palette.textMuted },
  actions: { marginTop: Spacing.sm },
  resultCard: { alignItems: 'center', paddingVertical: Spacing.xxl, marginBottom: Spacing.xl },
  resultCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  resultScore: { fontSize: 26, fontWeight: '800' },
  resultTitle: { ...Type.title },
  resultSub: { fontSize: 13, color: Palette.textSecondary, marginTop: 4 },
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
