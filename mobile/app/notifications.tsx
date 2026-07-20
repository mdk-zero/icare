import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { mockNotifications } from '@/lib/api';

const primaryColor = Colors.light.primary;

export default function NotificationsScreen() {
  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'alert': 
        return { icon: '#dc2626', bg: '#fef2f2', badge: '#dc2626' };
      case 'warning': 
        return { icon: '#d97706', bg: '#fefce8', badge: '#d97706' };
      case 'success': 
        return { icon: '#16a34a', bg: '#dcfce7', badge: '#16a34a' };
      case 'info': 
        return { icon: primaryColor, bg: primaryColor + '15', badge: primaryColor };
      default: 
        return { icon: '#64748b', bg: '#f1f5f9', badge: '#64748b' };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert': return 'warning';
      case 'warning': return 'warning';
      case 'success': return 'checkmark-circle';
      case 'info': return 'information-circle';
      default: return 'notifications';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.subtitle}>
                {mockNotifications.filter(n => !n.read).length} unread messages
              </Text>
            </View>
            <View style={[styles.notifIconBox, { backgroundColor: primaryColor + '15' }]}>
              <Ionicons name="notifications" size={24} color={primaryColor} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.notifList}>
        {mockNotifications.map((notification, index) => {
          const typeStyles = getTypeStyles(notification.type);
          
          return (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationCard,
                !notification.read && styles.notificationUnread
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.notificationHeader}>
                <View style={[styles.iconContainer, { backgroundColor: typeStyles.bg }]}>
                  <Ionicons name={getTypeIcon(notification.type) as any} size={20} color={typeStyles.icon} />
                </View>
                <View style={styles.notificationMeta}>
                  <Text style={[styles.notificationTitle, !notification.read && styles.notificationTitleUnread]}>
                    {notification.title}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: typeStyles.badge + '20' }]}>
                    <Text style={[styles.badgeText, { color: typeStyles.badge }]}>{notification.type}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.notificationMessage}>{notification.message}</Text>
              <View style={styles.notificationTimeRow}>
                <Ionicons name="time-outline" size={12} color="#94a3b8" />
                <Text style={styles.notificationTime}>
                  {new Date(notification.timestamp).toLocaleString()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8fafc' 
  },
  content: { 
    padding: 16, 
    paddingBottom: 32 
  },
  header: { 
    marginBottom: 20 
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notifIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { 
    fontSize: 26, 
    fontWeight: '800', 
    color: '#0f172a' 
  },
  subtitle: { 
    fontSize: 13, 
    color: '#64748b', 
    marginTop: 4 
  },
  notifList: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  notificationCard: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 14, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: '#f1f5f9' 
  },
  notificationUnread: { 
    backgroundColor: '#fafbfc',
  },
  notificationHeader: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    marginBottom: 8 
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    color: '#1e293b',
    flex: 1,
    marginRight: 8,
  },
  notificationTitleUnread: {
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  notificationMessage: { 
    fontSize: 13, 
    color: '#64748b', 
    lineHeight: 20, 
    marginBottom: 8,
    paddingLeft: 52,
  },
  notificationTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 52,
  },
  notificationTime: { 
    fontSize: 11, 
    color: '#94a3b8',
    marginLeft: 4,
  },
});