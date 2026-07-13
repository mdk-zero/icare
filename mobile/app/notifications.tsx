import React from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Accent, Palette, Radius, Shadow, Spacing } from '@/constants/theme';
import { mockNotifications } from '@/lib/mocks';

const TYPE_ACCENT: Record<string, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  alert: { ...Accent.red, icon: 'warning' },
  warning: { ...Accent.amber, icon: 'warning' },
  success: { ...Accent.green, icon: 'checkmark-circle' },
  info: { ...Accent.teal, icon: 'information-circle' },
};

export default function NotificationsScreen() {
  const unread = mockNotifications.filter((n) => !n.read).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {unread > 0 && (
        <View style={styles.summaryRow}>
          <View style={styles.unreadDot} />
          <Text style={styles.summaryText}>
            {unread} unread {unread === 1 ? 'message' : 'messages'}
          </Text>
        </View>
      )}

      {mockNotifications.map((notification) => {
        const accent = TYPE_ACCENT[notification.type] ?? { ...Accent.slate, icon: 'notifications' as const };

        return (
          <Pressable
            key={notification.id}
            style={({ pressed }) => [
              styles.notificationCard,
              !notification.read && styles.notificationUnread,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.notificationHeader}>
              <View style={[styles.iconContainer, { backgroundColor: accent.bg }]}>
                <Ionicons name={accent.icon} size={18} color={accent.fg} />
              </View>
              <View style={styles.notificationMeta}>
                <Text
                  style={[styles.notificationTitle, !notification.read && styles.notificationTitleUnread]}
                  numberOfLines={1}
                >
                  {notification.title}
                </Text>
                <View style={[styles.badge, { backgroundColor: accent.bg }]}>
                  <Text style={[styles.badgeText, { color: accent.fg }]}>{notification.type}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.notificationMessage}>{notification.message}</Text>
            <View style={styles.notificationTimeRow}>
              <Ionicons name="time-outline" size={12} color={Palette.textMuted} />
              <Text style={styles.notificationTime}>
                {new Date(notification.timestamp).toLocaleString()}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.textSecondary,
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
    color: '#1E293B',
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
