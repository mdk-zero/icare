import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, PrimaryButton } from '@/components/ui';
import { Accent, Palette, Radius, Spacing, Type } from '@/constants/theme';
import { mockQuestions } from '@/lib/mocks';

export default function QuizInterfaceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const quizId = id as string;

  const questions = mockQuestions.filter((q) => q.quizId === quizId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleSelect = (index: number) => {
    if (showAnswer) return;
    setSelectedIndex(index);
  };

  const handleSubmit = () => {
    if (selectedIndex === null) {
      Alert.alert('Select Answer', 'Please select an answer before submitting.');
      return;
    }
    setShowAnswer(true);
    setAnswers([...answers, selectedIndex]);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      const correct = answers.filter((a, i) => a === questions[i].correctIndex).length + (selectedIndex === currentQuestion?.correctIndex ? 1 : 0);
      Alert.alert('Quiz Complete!', `You got ${correct}/${questions.length} questions correct.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedIndex(null);
      setShowAnswer(false);
    }
  };

  if (!currentQuestion) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Quiz not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.progressBar}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{currentIndex + 1}/{questions.length}</Text>
      </View>

      <Card style={styles.questionCard}>
        <Text style={styles.questionNumber}>Question {currentIndex + 1}</Text>
        <Text style={styles.questionText}>{currentQuestion.text}</Text>
      </Card>

      <View style={styles.options}>
        {currentQuestion.options.map((option, index) => {
          const isCorrect = index === currentQuestion.correctIndex;
          const isSelected = index === selectedIndex;
          
          let optionStyle: StyleProp<ViewStyle> = styles.option;
          let textStyle: StyleProp<TextStyle> = styles.optionText;
          
          if (showAnswer) {
            if (isCorrect) {
              optionStyle = [styles.option, styles.optionCorrect];
              textStyle = [styles.optionText, styles.optionTextCorrect];
            } else if (isSelected && !isCorrect) {
              optionStyle = [styles.option, styles.optionWrong];
              textStyle = [styles.optionText, styles.optionTextWrong];
            }
          } else if (isSelected) {
            optionStyle = [styles.option, styles.optionSelected];
          }

          return (
            <TouchableOpacity
              key={index}
              style={optionStyle}
              onPress={() => handleSelect(index)}
              disabled={showAnswer}
            >
              <Text style={textStyle}>{option}</Text>
              {showAnswer && isCorrect && <Text style={styles.checkIcon}>✓</Text>}
              {showAnswer && isSelected && !isCorrect && <Text style={styles.crossIcon}>✗</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {showAnswer && (
        <Card style={styles.explanationCard}>
          <Text style={styles.explanationTitle}>Explanation</Text>
          <Text style={styles.explanationText}>{currentQuestion.explanation}</Text>
        </Card>
      )}

      <View style={styles.actions}>
        {!showAnswer ? (
          <PrimaryButton title="Submit Answer" onPress={handleSubmit} disabled={selectedIndex === null} />
        ) : (
          <PrimaryButton title={isLastQuestion ? 'See Results' : 'Next Question'} onPress={handleNext} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.background },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Palette.background },
  errorText: { fontSize: 16, color: Palette.textSecondary },
  progressBar: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xxl },
  progressTrack: { flex: 1, height: 8, backgroundColor: Palette.border, borderRadius: 4, marginRight: Spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Palette.primary, borderRadius: 4 },
  progressText: { fontSize: 14, fontWeight: '600', color: Palette.textSecondary },
  questionCard: { marginBottom: Spacing.xxl },
  questionNumber: { ...Type.eyebrow, color: Palette.primary, marginBottom: Spacing.sm },
  questionText: { fontSize: 18, fontWeight: '600', color: Palette.ink, lineHeight: 27 },
  options: { marginBottom: Spacing.xxl },
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
  optionCorrect: { borderColor: Accent.green.fg, backgroundColor: Accent.green.bg },
  optionWrong: { borderColor: Accent.red.fg, backgroundColor: Accent.red.bg },
  optionText: { fontSize: 14, color: Palette.ink, flex: 1, lineHeight: 20 },
  optionTextCorrect: { color: Accent.green.fg, fontWeight: '600' },
  optionTextWrong: { color: Accent.red.fg, fontWeight: '600' },
  checkIcon: { fontSize: 18, color: Accent.green.fg, fontWeight: '700' },
  crossIcon: { fontSize: 18, color: Accent.red.fg, fontWeight: '700' },
  explanationCard: { backgroundColor: Accent.blue.bg, borderColor: Accent.blue.border, marginBottom: Spacing.xxl },
  explanationTitle: { fontSize: 14, fontWeight: '700', color: Accent.blue.fg, marginBottom: Spacing.sm },
  explanationText: { fontSize: 14, color: '#1E40AF', lineHeight: 22 },
  actions: { marginTop: Spacing.sm },
});