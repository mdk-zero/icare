import React, { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import logoImg from '@/assets/images/logo-pill.png';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { PrimaryButton } from '@/components/ui';
import { API_URL } from '@/lib/client';

/**
 * Shown by the student web app while an Admin has it turned off (see
 * lib/student-web), in place of a sign-in form that couldn't work.
 */
export function StudentWebOff({ onCheckAgain }: { onCheckAgain: () => Promise<void> }) {
  const { Palette, Accent, Type } = useTheme();
  const [checking, setChecking] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Palette.background }]}>
      <View style={styles.body}>
        <Image source={logoImg} style={styles.logo} accessibilityLabel="iCARE++" />
        <View style={[styles.icon, { backgroundColor: Accent.amber.bg }]}>
          <Ionicons name="cloud-offline-outline" size={30} color={Accent.amber.fg} />
        </View>
        <Text style={[Type.screenTitle, { textAlign: 'center' }]} accessibilityRole="header">
          The web version is turned off
        </Text>
        <Text style={[styles.text, { color: Palette.textSecondary }]}>
          {"iCARE++ isn't available in a browser right now. Use the iCARE++ mobile app, or ask your instructor when the web version will be back. Your work is safe either way."}
        </Text>
        <PrimaryButton
          title={checking ? 'Checking…' : 'Check again'}
          disabled={checking}
          onPress={async () => {
            setChecking(true);
            try {
              await onCheckAgain();
            } finally {
              setChecking(false);
            }
          }}
          style={{ alignSelf: 'stretch' }}
        />
        <PrimaryButton
          title="Get the Android app"
          variant="outline"
          onPress={() => void Linking.openURL(`${API_URL}/download`)}
          style={{ alignSelf: 'stretch' }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.lg,
  },
  logo: { width: 52, height: 78, resizeMode: 'contain', marginBottom: Spacing.sm },
  icon: { width: 64, height: 64, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
