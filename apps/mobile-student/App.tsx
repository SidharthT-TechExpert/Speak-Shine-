import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';

export default function App() {
  const [streak] = useState(14);
  const [streakFreeze] = useState(2);
  const [monthlyScore] = useState(840);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Speak & Shine</Text>
            <Text style={styles.subtitle}>Mobile App for Students</Text>
          </View>
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>🔥 {streak} Days</Text>
          </View>
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTag}>TODAY'S DAILY CHALLENGE</Text>
          <Text style={styles.heroTitle}>Mastering Articulate Introductions</Text>
          <Text style={styles.heroDesc}>
            Record a 60-second video response using MediaPipe background blur & AI noise cancellation.
          </Text>
          <TouchableOpacity style={styles.recordButton} activeOpacity={0.8}>
            <Text style={styles.recordButtonText}>📹 Start Recording</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>STREAK</Text>
            <Text style={styles.statValue}>{streak}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SHIELDS</Text>
            <Text style={styles.statValue}>🛡️ {streakFreeze}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SCORE</Text>
            <Text style={styles.statValue}>🏆 {monthlyScore}</Text>
          </View>
        </View>

        {/* Class Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enrolled Cohort</Text>
          <Text style={styles.cardSubtitle}>Corporate Speech & Fluency Batch A</Text>
          <Text style={styles.classCode}>Class ID: SHINE-9402</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  streakBadge: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  streakText: {
    color: '#D97706',
    fontWeight: '700',
    fontSize: 13,
  },
  heroCard: {
    backgroundColor: '#2563EB',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  heroTag: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroDesc: {
    color: '#DBEAFE',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  recordButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  recordButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 15,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  classCode: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
});
