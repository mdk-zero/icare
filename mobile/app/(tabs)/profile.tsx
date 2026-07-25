import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { SectionHeader } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useApiData, allCached } from '@/hooks/useApiData';
import { fetchProgress, fetchRecommendations, resolveAvatarUrl } from '@/lib/api';
import { clearCache } from '@/lib/client';
import { ThemePreference, useThemePreference } from '@/hooks/useThemePreference';

/** Teal ramp sampled from the pill logo's cap (same as login/header/tab bar/dashboard). */
const Teal = {
  deepest: '#082E38',
  deep: '#0D4550',
  primary: '#1B6B7B',
  light: '#35859B',
};

/**
 * First letter of the first name plus the last — matches the web avatar, and
 * keeps "Linux Mandrake S. Adona" at "LA" rather than the first two words.
 */
function getInitials(name?: string) {
  const words = (name ?? '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return 'S';
  const letterOf = (w: string) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '';
  const last = words.length > 1 ? letterOf(words[words.length - 1]) : '';
  return (letterOf(words[0]) + last).toUpperCase() || 'S';
}

function competencyAccent(Accent: ReturnType<typeof useTheme>['Accent'], score: number) {
  if (score >= 70) return { ...Accent.green, label: 'Proficient' };
  if (score >= 50) return { ...Accent.amber, label: 'Developing' };
  return { ...Accent.red, label: 'Needs Work' };
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function ProfileScreen() {
  // content starts below the floating header, then scrolls beneath it
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const { Palette, Accent, Shadow, Type } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent, Shadow, Type), [Palette, Accent, Shadow, Type]);
  const { data, refreshing, refresh } = useApiData(() =>
    allCached(fetchProgress(), fetchRecommendations()),
  );
  const [progress, recommendations] = data ?? [null, []];

  // Uploaded avatars are stored as a bucket path and need signing before they
  // can be displayed; Google URLs resolve to themselves.
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = await resolveAvatarUrl(user?.picture_url);
      if (!cancelled) setAvatarUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.picture_url]);

  const handleClearCache = () => {
    Alert.alert(
      'Clear cached data',
      'Offline copies of your data will be removed from this device. Anything not yet synced stays queued, and you remain signed in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearCache();
              Alert.alert('Cache cleared', 'Pull to refresh on any screen to load the latest data.');
            } catch {
              Alert.alert('Error', 'Could not clear the cached data. Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const attempts = progress?.attempts ?? [];
  const scored = attempts.filter((a) => a.score !== null);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, a) => sum + (a.score ?? 0), 0) / scored.length)
      : null;

  const byCompetency = new Map<string, { total: number; count: number }>();
  for (const record of progress?.competency_scores ?? []) {
    const name = record.competency_areas?.name ?? 'General';
    const entry = byCompetency.get(name) ?? { total: 0, count: 0 };
    entry.total += record.score;
    entry.count += 1;
    byCompetency.set(name, entry);
  }
  const competencies = [...byCompetency.entries()].map(([competency, { total, count }]) => ({
    competency,
    avgScore: Math.round(total / count),
  }));

  const quickLinks = [
    { label: 'Performance Analytics', icon: 'bar-chart' as const, accent: Accent.blue, onPress: () => router.push('/progress') },
    { label: 'Notifications', icon: 'notifications' as const, accent: Accent.amber, onPress: () => router.push('/notifications') },
    { label: 'Recommended for You', icon: 'book' as const, accent: Accent.green, onPress: () => router.push('/recommendations') },
    { label: 'Request Assistance', icon: 'hand-left' as const, accent: Accent.violet, onPress: () => router.push('/assistance') },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 88 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <LinearGradient
        colors={[Teal.deepest, Teal.deep, Teal.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        <View style={styles.avatarRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarLarge} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[Teal.light, '#FFFFFF33', Teal.deep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarLarge}
            >
              <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
            </LinearGradient>
          )}
        </View>
        <Text style={styles.name}>{user?.name || 'Student'}</Text>
        <Text style={styles.email}>{user?.email || 'student@icare.edu'}</Text>
        <View style={styles.badges}>
          {/* Section comes from the session; the old cohort/student-ID badges
              rendered hardcoded strings that were never on the server. */}
          <View style={styles.badge}>
            <Ionicons name="school-outline" size={12} color="#FFFFFF" />
            <Text style={styles.badgeText}>
              {user?.section ? `Section ${user.section}` : 'No section assigned'}
            </Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="person-outline" size={12} color="#FFFFFF" />
            <Text style={styles.badgeText}>
              {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Student'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.section}>
        <SectionHeader title="Performance Overview" />
        <View style={styles.statsCard}>
          <View style={styles.perfStat}>
            <View style={[styles.perfIconBox, { backgroundColor: Palette.primaryTint }]}>
              <Ionicons name="trending-up" size={18} color={Palette.primary} />
            </View>
            <Text style={[styles.perfValue, { color: Palette.primary }]}>
              {avgScore === null ? '—' : `${avgScore}%`}
            </Text>
            <Text style={styles.perfLabel}>Avg Score</Text>
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfStat}>
            <View style={[styles.perfIconBox, { backgroundColor: Accent.violet.bg }]}>
              <Ionicons name="analytics" size={18} color={Accent.violet.fg} />
            </View>
            <Text style={styles.perfValue}>{attempts.length}</Text>
            <Text style={styles.perfLabel}>Activities</Text>
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfStat}>
            <View style={[styles.perfIconBox, { backgroundColor: Accent.blue.bg }]}>
              <Ionicons name="ribbon" size={18} color={Accent.blue.fg} />
            </View>
            <Text style={styles.perfValue}>{competencies.length}</Text>
            <Text style={styles.perfLabel}>Skills</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Competencies" />
        <View style={styles.listCard}>
          {competencies.length === 0 && (
            <Text style={styles.emptyListText}>
              Competency scores appear here once your faculty validates your work.
            </Text>
          )}
          {competencies.map((comp, index) => {
            const accent = competencyAccent(Accent, comp.avgScore);
            return (
              <View
                key={comp.competency}
                style={[styles.compItem, index > 0 && styles.rowBorder]}
              >
                <View style={styles.compLeft}>
                  <Text style={styles.compName}>{comp.competency}</Text>
                  <View style={styles.compScore}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${comp.avgScore}%`, backgroundColor: accent.fg },
                        ]}
                      />
                    </View>
                    <Text style={styles.compValue}>{comp.avgScore}%</Text>
                  </View>
                </View>
                <View style={[styles.compBadge, { backgroundColor: accent.bg }]}>
                  <Text style={[styles.compBadgeText, { color: accent.fg }]}>{accent.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="AI Recommendations" actionLabel="See all" onAction={() => router.push('/recommendations')} />
        <View style={styles.listCard}>
          {recommendations.length === 0 && (
            <Text style={styles.emptyListText}>
              Personalized suggestions appear here after your quiz results are analyzed.
            </Text>
          )}
          {recommendations.slice(0, 2).map((rec, index) => {
            const priority = rec.rank <= 1 ? Accent.red : Accent.amber;
            return (
              <Pressable
                key={rec.id}
                style={({ pressed }) => [styles.recItem, index > 0 && styles.rowBorder, pressed && styles.pressedDim]}
                onPress={() => router.push('/recommendations')}
              >
                <View style={styles.recHeader}>
                  <View style={[styles.recIconContainer, { backgroundColor: Accent.violet.bg }]}>
                    <Ionicons name="document-text" size={15} color={Accent.violet.fg} />
                  </View>
                  <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
                    <Text style={[styles.priorityText, { color: priority.fg }]}>#{rec.rank}</Text>
                  </View>
                </View>
                <Text style={styles.recTitle}>{rec.assessments?.title ?? 'Recommended practice'}</Text>
                <Text style={styles.recDesc} numberOfLines={2}>
                  {rec.reason}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Quick Links" />
        <View style={styles.listCard}>
          {quickLinks.map((link, index) => (
            <Pressable
              key={link.label}
              style={({ pressed }) => [styles.linkItem, index > 0 && styles.rowBorder, pressed && styles.pressedDim]}
              onPress={link.onPress}
            >
              <View style={[styles.linkIconContainer, { backgroundColor: link.accent.bg }]}>
                <Ionicons name={link.icon} size={17} color={link.accent.fg} />
              </View>
              <Text style={styles.linkText}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Settings" />
        <View style={styles.listCard}>
          <View style={styles.settingBlock}>
            <View style={styles.settingHeader}>
              <View style={[styles.linkIconContainer, { backgroundColor: Accent.slate.bg }]}>
                <Ionicons name="contrast-outline" size={17} color={Accent.slate.fg} />
              </View>
              <View style={styles.settingTextWrap}>
                <Text style={styles.linkText}>Appearance</Text>
                <Text style={styles.settingSubtext}>Match your device, or pin light or dark</Text>
              </View>
            </View>
            <View style={styles.segment}>
              {THEME_OPTIONS.map((opt) => {
                const active = preference === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.segmentItem,
                      active && styles.segmentItemActive,
                      pressed && styles.pressedDim,
                    ]}
                    onPress={() => setPreference(opt.value)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={14}
                      color={active ? Palette.primary : Palette.textSecondary}
                    />
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.linkItem, styles.rowBorder, pressed && styles.pressedDim]}
            onPress={handleClearCache}
          >
            <View style={[styles.linkIconContainer, { backgroundColor: Accent.amber.bg }]}>
              <Ionicons name="trash-outline" size={17} color={Accent.amber.fg} />
            </View>
            <View style={styles.settingTextWrap}>
              <Text style={styles.linkText}>Clear cached data</Text>
              <Text style={styles.settingSubtext}>Remove offline copies stored on this device</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={Palette.textFaint} />
          </Pressable>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutButton, pressed && styles.pressedDim]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={19} color={Accent.red.fg} />
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>

      <Text style={styles.footer}>
        iCARE++ v1.0 • Protected by Philippine Data Privacy Act of 2012
      </Text>
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Accent: ReturnType<typeof useTheme>['Accent'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
  Type: ReturnType<typeof useTheme>['Type'],
) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    padding: Spacing.lg,
    // clears the floating tab bar so the last items can scroll above it
    paddingBottom: 128,
  },
  pressedDim: {
    opacity: 0.7,
  },
  headerCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    ...Shadow.raised,
  },
  avatarRow: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  avatarLarge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF88',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  editButton: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
  },
  name: {
    ...Type.screenTitle,
    fontSize: 22,
    color: '#FFFFFF',
  },
  email: {
    fontSize: 13,
    color: '#E7F0F1CC',
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: '#FFFFFF26',
    borderWidth: 1,
    borderColor: '#FFFFFF33',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  perfStat: {
    alignItems: 'center',
    flex: 1,
  },
  perfIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  perfDivider: {
    width: 1,
    backgroundColor: Palette.borderLight,
  },
  perfValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Palette.ink,
  },
  perfLabel: {
    ...Type.micro,
    fontWeight: '500',
    marginTop: 2,
  },
  listCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: Palette.borderLight,
  },
  compItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  compLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  compName: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.ink,
    marginBottom: 6,
  },
  compScore: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    width: 88,
    height: 6,
    backgroundColor: Palette.border,
    borderRadius: 3,
    marginRight: Spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  compValue: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.textSecondary,
  },
  compBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  compBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyListText: {
    fontSize: 13,
    color: Palette.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  recItem: {
    paddingVertical: Spacing.md,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  recIconContainer: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  recTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.ink,
    marginBottom: 3,
  },
  recDesc: {
    fontSize: 12,
    color: Palette.textSecondary,
    lineHeight: 18,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md + 2,
  },
  linkIconContainer: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Palette.ink,
  },
  settingBlock: {
    paddingVertical: Spacing.md + 2,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingSubtext: {
    fontSize: 11.5,
    color: Palette.textSecondary,
    marginTop: 2,
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: Palette.surfaceMuted,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Palette.border,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  segmentItemActive: {
    backgroundColor: Palette.primaryTint,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Palette.textSecondary,
  },
  segmentTextActive: {
    color: Palette.primary,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Accent.red.bg,
    borderRadius: Radius.md,
    paddingVertical: 15,
    marginBottom: Spacing.xl,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: Accent.red.fg,
  },
  footer: {
    ...Type.micro,
    textAlign: 'center',
  },
  });
}
