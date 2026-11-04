import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { fetchAiConsent, saveAiConsent } from '@/lib/api';

/**
 * The AI features switch in Profile: the same answer the first-launch question
 * asks for. Hidden until the server can read and save it.
 */
export default function AiConsentSwitch() {
  const { Palette, Accent } = useTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [on, setOn] = useState<boolean | null>(null);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  // Coming back from the question may have changed it.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchAiConsent()
        .then((state) => {
          if (!live) return;
          setAvailable(state.available);
          setOn(state.consent === true);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );

  const save = async (consent: boolean) => {
    setBusy(true);
    try {
      await saveAiConsent(consent);
      setOn(consent);
    } catch (err) {
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) => {
    if (next) {
      void save(true);
      return;
    }
    Alert.alert(
      'Turn off AI features?',
      "Nothing more goes to the AI, and the AI tips and feedback saved for you are deleted. Your grades and coursework stay the same.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn off', style: 'destructive', onPress: () => void save(false) },
      ],
    );
  };

  if (!available) return null;

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: Accent.blue.bg }]}>
        <Ionicons name="sparkles-outline" size={18} color={Accent.blue.fg} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>AI features</Text>
        <Text style={styles.detail}>
          AI study tips, feedback and summaries for your instructor. Sends your scores and remarks to Anthropic.
        </Text>
      </View>
      <Switch
        value={!!on}
        onValueChange={toggle}
        disabled={on === null || busy}
        trackColor={{ false: Palette.border, true: Palette.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={Palette.border}
        accessibilityLabel="AI features"
      />
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette']) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      minHeight: 64,
    },
    icon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1 },
    title: { fontSize: 15, fontWeight: '700', color: Palette.ink },
    detail: { fontSize: 12, lineHeight: 17, color: Palette.textSecondary, marginTop: 2 },
  });
}
