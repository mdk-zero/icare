import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { saveAiConsent } from '@/lib/api';
import { openPrivacy } from '@/lib/legal';

/**
 * Asked once, after a student first signs in: may their record go to the AI
 * provider? Says what is sent, who gets it and what changes without it, as
 * App Store Review Guideline 5.1.2(i) asks. Leaving without answering counts
 * as no answer: nothing is sent, and the question comes back next launch.
 */
export default function AiConsentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { Palette, Accent, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [saving, setSaving] = useState<boolean | null>(null);

  const answer = async (consent: boolean) => {
    setSaving(consent);
    try {
      await saveAiConsent(consent);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Check your connection and try again.');
      setSaving(null);
    }
  };

  const facts = [
    {
      icon: 'document-text-outline' as const,
      accent: Accent.teal,
      title: 'What is sent',
      text: "Your scores, skill ratings and your clinical instructor's remarks. Never your name, email or password.",
    },
    {
      icon: 'business-outline' as const,
      accent: Accent.blue,
      title: 'Who receives it',
      text: 'Anthropic, the company that makes the Claude AI.',
    },
    {
      icon: 'shield-checkmark-outline' as const,
      accent: Accent.slate,
      title: "If you don't allow it",
      text: "Your grades and coursework stay the same. You won't get AI study tips, feedback comes straight from your grades, and your clinical instructor can't ask for an AI summary of your work.",
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.badge, { backgroundColor: Accent.blue.bg }]}>
          <Ionicons name="sparkles" size={24} color={Accent.blue.fg} />
        </View>
        <Text style={Type.screenTitle} accessibilityRole="header">
          Allow AI features?
        </Text>
        <Text style={styles.lede}>
          iCARE++ can use AI to write your study tips, give feedback on your graded work and summarize your progress for
          your clinical instructor.
        </Text>

        {facts.map((fact) => (
          <View key={fact.title} style={styles.fact}>
            <View style={[styles.factIcon, { backgroundColor: fact.accent.bg }]}>
              <Ionicons name={fact.icon} size={18} color={fact.accent.fg} />
            </View>
            <View style={styles.factText}>
              <Text style={styles.factTitle}>{fact.title}</Text>
              <Text style={styles.factBody}>{fact.text}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.note}>
          You can change this anytime in Profile, under Settings. Read more in the{' '}
          <Text style={styles.link} onPress={openPrivacy} accessibilityRole="link">
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          title="Allow"
          onPress={() => void answer(true)}
          loading={saving === true}
          disabled={saving !== null}
        />
        <PrimaryButton
          title="Don't allow"
          variant="outline"
          onPress={() => void answer(false)}
          loading={saving === false}
          disabled={saving !== null}
        />
      </View>
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg },
    badge: {
      width: 52,
      height: 52,
      borderRadius: Radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.lg,
    },
    lede: { fontSize: 15, lineHeight: 22, color: Palette.textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.xl },
    fact: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
    factIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    factText: { flex: 1 },
    factTitle: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    factBody: { fontSize: 14, lineHeight: 20, color: Palette.textSecondary, marginTop: 2 },
    note: { fontSize: 13, lineHeight: 19, color: Palette.textSecondary },
    link: { fontWeight: '700', color: Palette.primary, textDecorationLine: 'underline' },
    actions: {
      gap: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Palette.border,
      backgroundColor: Palette.background,
    },
  });
}
