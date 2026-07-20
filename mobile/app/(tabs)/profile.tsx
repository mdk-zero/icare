import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { mockPerformanceLogs, mockAIRecommendations } from '@/lib/api';

const primaryColor = Colors.light.primary;

function getInitials(name?: string) {
  if (!name) return 'S';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

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

  const avgScore = Math.round(
    mockPerformanceLogs.reduce((a, b) => a + b.score, 0) / mockPerformanceLogs.length
  );

  const competencies = Object.entries(
    mockPerformanceLogs.reduce((acc, log) => {
      if (!acc[log.competency]) acc[log.competency] = [];
      acc[log.competency].push(log.score);
      return acc;
    }, {} as Record<string, number[]>)
  ).map(([competency, scores]) => ({
    competency,
    avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCard}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatarLarge, { backgroundColor: primaryColor }]}>
              <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
            </View>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="camera" size={16} color={primaryColor} />
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{user?.name || 'Student'}</Text>
          <Text style={styles.email}>{user?.email || 'student@icare.edu'}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: primaryColor + '15' }]}>
              <Ionicons name="school-outline" size={12} color={primaryColor} />
              <Text style={[styles.badgeText, { color: primaryColor, marginLeft: 4 }]}>{user?.cohort || 'BSN-2027'}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: '#f1f5f9' }]}>
              <Ionicons name="id-card-outline" size={12} color="#64748b" />
              <Text style={styles.badgeTextGray}>{user?.studentId || 'NS-2024-001'}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance Overview</Text>
        <View style={styles.statsCard}>
          <View style={styles.perfStats}>
            <View style={styles.perfStat}>
              <View style={[styles.perfIconBox, { backgroundColor: primaryColor + '15' }]}>
                <Ionicons name="trending-up" size={20} color={primaryColor} />
              </View>
              <Text style={[styles.perfValue, { color: primaryColor }]}>{avgScore}%</Text>
              <Text style={styles.perfLabel}>Avg Score</Text>
            </View>
            <View style={styles.perfDivider} />
            <View style={styles.perfStat}>
              <View style={[styles.perfIconBox, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="analytics" size={20} color="#7c3aed" />
              </View>
              <Text style={styles.perfValue}>{mockPerformanceLogs.length}</Text>
              <Text style={styles.perfLabel}>Activities</Text>
            </View>
            <View style={styles.perfDivider} />
            <View style={styles.perfStat}>
              <View style={[styles.perfIconBox, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="ribbon" size={20} color="#2563eb" />
              </View>
              <Text style={styles.perfValue}>{competencies.length}</Text>
              <Text style={styles.perfLabel}>Skills</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Competencies</Text>
        <View style={styles.competenciesCard}>
          {competencies.map((comp, index) => (
            <View
              key={comp.competency}
              style={[styles.compItem, index < competencies.length - 1 && styles.compBorder]}
            >
              <View style={styles.compLeft}>
                <Text style={styles.compName}>{comp.competency}</Text>
                <View style={styles.compScore}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${comp.avgScore}%`,
                          backgroundColor:
                            comp.avgScore >= 70
                              ? '#16a34a'
                              : comp.avgScore >= 50
                              ? '#d97706'
                              : '#dc2626',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.compValue}>{comp.avgScore}%</Text>
                </View>
              </View>
              <View style={[styles.compBadge, { 
                backgroundColor: comp.avgScore >= 70 ? '#dcfce7' : comp.avgScore >= 50 ? '#fef3c7' : '#fee2e2'
              }]}>
                <Text style={[styles.compBadgeText, { 
                  color: comp.avgScore >= 70 ? '#16a34a' : comp.avgScore >= 50 ? '#d97706' : '#dc2626'
                }]}>
                  {comp.avgScore >= 70 ? 'Proficient' : comp.avgScore >= 50 ? 'Developing' : 'Needs Work'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Recommendations</Text>
        <View style={styles.recommendationsCard}>
          {mockAIRecommendations.slice(0, 2).map((rec, index) => (
            <TouchableOpacity
              key={rec.id}
              style={[styles.recItem, index < 1 && styles.recBorder]}
              activeOpacity={0.7}
            >
              <View style={styles.recHeader}>
                <View style={[styles.recIconContainer, { 
                  backgroundColor: rec.type === 'quiz' ? '#ede9fe' : rec.type === 'task' ? '#fef3c7' : '#dbeafe'
                }]}>
                  <Ionicons 
                    name={rec.type === 'quiz' ? 'document-text' : rec.type === 'task' ? 'list' : 'book'} 
                    size={16} 
                    color={rec.type === 'quiz' ? '#7c3aed' : rec.type === 'task' ? '#d97706' : '#2563eb'} 
                  />
                </View>
                <View style={[styles.priorityBadge, { 
                  backgroundColor: rec.priority === 'high' ? '#fee2e2' : '#fef3c7'
                }]}>
                  <Text style={[styles.priorityText, { 
                    color: rec.priority === 'high' ? '#dc2626' : '#d97706'
                  }]}>
                    {rec.priority}
                  </Text>
                </View>
              </View>
              <Text style={styles.recTitle}>{rec.title}</Text>
              <Text style={styles.recDesc} numberOfLines={2}>
                {rec.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Links</Text>
        <View style={styles.quickLinksCard}>
          <TouchableOpacity style={styles.linkItem} onPress={() => router.push('/progress')}>
            <View style={[styles.linkIconContainer, { backgroundColor: '#dbeafe' }]}>
              <Ionicons name="bar-chart" size={18} color="#2563eb" />
            </View>
            <Text style={styles.linkText}>Performance Analytics</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem} onPress={() => router.push('/notifications')}>
            <View style={[styles.linkIconContainer, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="notifications" size={18} color="#d97706" />
            </View>
            <Text style={styles.linkText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem}>
            <View style={[styles.linkIconContainer, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="book" size={18} color="#16a34a" />
            </View>
            <Text style={styles.linkText}>Clinical Guidelines</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem}>
            <View style={[styles.linkIconContainer, { backgroundColor: '#f3e8ff' }]}>
              <Ionicons name="help-circle" size={18} color="#9333ea" />
            </View>
            <Text style={styles.linkText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out" size={20} color="#dc2626" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        iCARE++ v1.0 • Protected by Philippine Data Privacy Act of 2012
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 20,
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatarRow: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: primaryColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  editButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#f1f5f9',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  email: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  badges: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextGray: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginLeft: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  perfStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  perfStat: {
    alignItems: 'center',
    flex: 1,
  },
  perfIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  perfDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
  },
  perfValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  perfLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 4,
  },
  competenciesCard: {
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
  compItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  compBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  compLeft: {
    flex: 1,
    marginRight: 12,
  },
  compName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  compScore: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    width: 80,
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    marginRight: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  compValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  compBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  compBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  recommendationsCard: {
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
  recItem: {
    paddingVertical: 10,
  },
  recBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  recTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  recDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  quickLinksCard: {
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
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  linkIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#dc2626',
    marginLeft: 8,
  },
  footer: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
});