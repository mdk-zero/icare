import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, PrimaryButton, Badge } from '@/components/ui';
import { mockQuestions } from '@/lib/api';

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
          
          let optionStyle = styles.option;
          let textStyle = styles.optionText;
          
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
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 32 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#6b7280' },
  progressBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  progressTrack: { flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, marginRight: 12 },
  progressFill: { height: '100%', backgroundColor: '#1B6B7B', borderRadius: 4 },
  progressText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  questionCard: { marginBottom: 24 },
  questionNumber: { fontSize: 12, color: '#1B6B7B', fontWeight: '600', marginBottom: 8 },
  questionText: { fontSize: 18, fontWeight: '600', color: '#11181c', lineHeight: 28 },
  options: { marginBottom: 24 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: '#e5e7eb' },
  optionSelected: { borderColor: '#1B6B7B', backgroundColor: '#f0fdfa' },
  optionCorrect: { borderColor: '#16a34a', backgroundColor: '#dcfce7' },
  optionWrong: { borderColor: '#dc2626', backgroundColor: '#fee2e2' },
  optionText: { fontSize: 14, color: '#11181c', flex: 1 },
  optionTextCorrect: { color: '#16a34a', fontWeight: '600' },
  optionTextWrong: { color: '#dc2626', fontWeight: '600' },
  checkIcon: { fontSize: 18, color: '#16a34a', fontWeight: '700' },
  crossIcon: { fontSize: 18, color: '#dc2626', fontWeight: '700' },
  explanationCard: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd', marginBottom: 24 },
  explanationTitle: { fontSize: 14, fontWeight: '700', color: '#0369a1', marginBottom: 8 },
  explanationText: { fontSize: 14, color: '#0369a1', lineHeight: 22 },
  actions: { marginTop: 8 },
});