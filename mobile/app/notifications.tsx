import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { SkeletonScreen, EmptyState } from '@/components/ui';
import { useNotifications } from '@/hooks/useNotifications';
import { AppNotification } from '@/lib/api';

function typeAccent(
  Accent: ReturnType<typeof useTheme>['Accent'],
): Record<
  AppNotification['type'],
  { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }
> {
  return {
    assignment_created: { ...Accent.violet, icon: 'clipboard', label: 'Assignment' },
    deadline_reminder: { ...Accent.amber, icon: 'alarm', label: 'Deadline' },
    at_risk_flag: { ...Accent.red, icon: 'warning', label: 'At Risk' },
    vitals_anomaly: { ...Accent.red, icon: 'pulse', label: 'Vitals' },
    performance_validated: { ...Accent.green, icon: 'checkmark-circle', label: 'Validated' },
    assistance_request: { ...Accent.blue, icon: 'hand-left', label: 'Assistance' },
    system: { ...Accent.teal, icon: 'information-circle', label: 'System' },
  };
}

export default function NotificationsScreen() {
  const { notifications, unread, loading, connected, error, markRead, markAllRead, refresh } =
    useNotifications();
  const [refreshing, setRefreshing] = React.useState(false);
  const { Palette, Accent, Shadow } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Shadow), [Palette, Shadow]);
  const TYPE_ACCENT = React.useMemo(() => typeAccent(Accent), [Accent]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  if (loading) {
    return <SkeletonScreen />;
  }

  const handleOpen = (notification: AppNotification) => {
    void markRead(notification.id);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Palette.primary]} tintColor={Palette.primary} />
      }
    >
      <View style={styles.summaryRow}>
        {unread > 0 ? (
          <>
            <View style={styles.unreadDot} />
            <Text style={styles.summaryText}>
              {unread} unread {unread === 1 ? 'message' : 'messages'}
            </Text>
            <Pressable onPress={() => markAllRead()} style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* Signals that the feed updates itself, so nobody pulls to refresh
                waiting for something that has already arrived. */}
            <View
              style={[
                styles.liveDot,
                { backgroundColor: connected ? Accent.green.fg : Palette.textMuted },
              ]}
            />
            <Text style={styles.summaryText}>{connected ? 'Live' : 'Reconnecting…'}</Text>
          </>
        )}
      </View>

      {notifications.length === 0 && (
        <EmptyState
          icon={error ? 'cloud-offline-outline' : 'notifications-off-outline'}
          message={error ?? "You're all caught up — no notifications yet."}
        />
      )}

      {notifications.map((notification) => {
        const accent = TYPE_ACCENT[notification.type] ?? { ...Accent.slate, icon: 'notifications' as const, label: 'Other' };
        const isUnread = !notification.read_at;

        return (
          <Pressable
            key={notification.id}
            style={({ pressed }) => [
              styles.notificationCard,
              isUnread && styles.notificationUnread,
              pressed && styles.pressed,
            ]}
            onPress={() => handleOpen(notification)}
          >
            <View style={styles.notificationHeader}>
              <View style={[styles.iconContainer, { backgroundColor: accent.bg }]}>
                <Ionicons name={accent.icon} size={18} color={accent.fg} />
              </View>
              <View style={styles.notificationMeta}>
                <Text
                  style={[styles.notificationTitle, isUnread && styles.notificationTitleUnread]}
                  numberOfLines={1}
                >
                  {notification.title}
                </Text>
                <View style={[styles.badge, { backgroundColor: accent.bg }]}>
                  <Text style={[styles.badgeText, { color: accent.fg }]}>{accent.label}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.notificationMessage}>{notification.body}</Text>
            <View style={styles.notificationTimeRow}>
              <Ionicons name="time-outline" size={12} color={Palette.textMuted} />
              <Text style={styles.notificationTime}>
                {new Date(notification.created_at).toLocaleString()}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(
  Palette: ReturnType<typeof useTheme>['Palette'],
  Shadow: ReturnType<typeof useTheme>['Shadow'],
) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 32,
  },
  pressed: {
    opacity: 0.8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.primary,
    marginRight: Spacing.sm,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  summaryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Palette.textSecondary,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.primary,
  },
  notificationCard: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  notificationUnread: {
    borderLeftWidth: 3,
    borderLeftColor: Palette.primary,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  notificationMeta: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.ink,
    flex: 1,
    marginRight: Spacing.sm,
  },
  notificationTitleUnread: {
    fontWeight: '700',
    color: Palette.ink,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  notificationMessage: {
    fontSize: 13,
    color: Palette.textSecondary,
    lineHeight: 19,
    marginBottom: Spacing.sm,
    paddingLeft: 48,
  },
  notificationTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 48,
  },
  notificationTime: {
    fontSize: 11,
    color: Palette.textMuted,
    marginLeft: 4,
  },
  });
}
