import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { EmptyState } from '@/components/ui';
import { LEGAL_EFFECTIVE, PRIVACY, TERMS, type LegalDoc, type LegalItem } from '@/lib/legal-content';

const DOCS: Record<string, LegalDoc> = { terms: TERMS, privacy: PRIVACY };

/**
 * The Terms of Use or the Privacy Policy, read inside the app (no browser),
 * from the same text the website shows. Open before sign-in too: the welcome
 * screen links here.
 */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const insets = useSafeAreaInsets();
  const { Palette, Type } = useTheme();
  const styles = useMemo(() => createStyles(Palette, Type), [Palette, Type]);
  const content = DOCS[doc ?? ''];

  if (!content) {
    return (
      <View style={styles.container}>
        <EmptyState icon="document-text-outline" message="This document was not found." />
      </View>
    );
  }

  const item = (it: LegalItem, key: number) => (
    <View key={key} style={styles.listItem}>
      <Text style={styles.bullet}>•</Text>
      <Text style={styles.body}>
        {typeof it === 'string' ? (
          it
        ) : (
          <>
            <Text style={styles.lead}>{it.lead}: </Text>
            {it.text}
          </>
        )}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      <Stack.Screen options={{ title: content.title }} />
      <Text style={styles.effective}>Effective {LEGAL_EFFECTIVE}</Text>
      {content.intro.map((p, i) => (
        <Text key={i} style={[styles.body, styles.intro]}>
          {p}
        </Text>
      ))}

      <View style={styles.contents}>
        {content.sections.map((s, i) => (
          <Text key={s.id} style={styles.contentsItem}>
            {i + 1}. {s.title}
          </Text>
        ))}
      </View>

      {content.sections.map((s, i) => (
        <View key={s.id} style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {i + 1}. {s.title}
          </Text>
          {s.blocks.map((b, j) =>
            'p' in b ? (
              <Text key={j} style={[styles.body, styles.paragraph]}>
                {b.p}
              </Text>
            ) : (
              <View key={j} style={styles.list}>
                {b.list.map(item)}
              </View>
            ),
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Type: ReturnType<typeof useTheme>['Type']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: Palette.background },
    content: { padding: Spacing.xl },
    effective: { ...Type.caption },
    intro: { marginTop: Spacing.lg },
    contents: {
      marginTop: Spacing.xl,
      padding: Spacing.lg,
      gap: 6,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Palette.border,
      backgroundColor: Palette.surface,
    },
    contentsItem: { fontSize: 13, color: Palette.textSecondary },
    section: { marginTop: Spacing.xxl },
    sectionTitle: { ...Type.sectionTitle, fontSize: 17, marginBottom: Spacing.sm },
    body: { flex: 1, fontSize: 15, lineHeight: 23, color: Palette.text },
    paragraph: { marginBottom: Spacing.sm },
    lead: { fontWeight: '700', color: Palette.ink },
    list: { marginBottom: Spacing.sm, gap: 6 },
    listItem: { flexDirection: 'row', gap: Spacing.sm },
    bullet: { fontSize: 15, lineHeight: 23, color: Palette.textMuted },
  });
}
