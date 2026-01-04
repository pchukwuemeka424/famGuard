import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useCheckIn } from '../context/CheckInContext';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList, UserCheckIn } from '../types';

type CheckInScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CheckIn'>;

interface CheckInScreenProps {
  navigation: CheckInScreenNavigationProp;
}

export default function CheckInScreen({ navigation }: CheckInScreenProps) {
  const { settings, lastCheckIn, recentCheckIns, loading, checkIn, refreshCheckIns } = useCheckIn();
  const { user } = useAuth();
  const [checkingIn, setCheckingIn] = useState<boolean>(false);

  useEffect(() => {
    refreshCheckIns();
  }, []);

  const handleQuickCheckIn = async (status: UserCheckIn['status'] = 'safe'): Promise<void> => {
    try {
      setCheckingIn(true);
      const success = await checkIn(status);
      if (success) {
        // Refresh check-ins in background (non-blocking)
        refreshCheckIns().catch((error) => {
          console.error('Error refreshing check-ins:', error);
        });
        
        // Show success immediately without waiting for refresh
        Alert.alert('✅ Check-in Successful', 'Your safety status has been updated.', [
          { text: 'OK' },
        ]);
      } else {
        Alert.alert('Error', 'Failed to check in. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };


  const getStatusColor = (status: UserCheckIn['status']): string => {
    const colors = {
      safe: '#10B981',
      unsafe: '#EF4444',
      delayed: '#F59E0B',
      missed: '#DC2626',
    };
    return colors[status] || '#6B7280';
  };

  const getStatusIcon = (status: UserCheckIn['status']): keyof typeof Ionicons.glyphMap => {
    const icons = {
      safe: 'checkmark-circle',
      unsafe: 'warning',
      delayed: 'time',
      missed: 'close-circle',
    };
    return icons[status] || 'help-circle';
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now.getTime() - time.getTime()) / 1000 / 60);
    
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };


  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Safety Check-in</Text>
          <Text style={styles.headerSubtitle}>Let your contacts know you're safe</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('CheckInSettings')}
          style={styles.settingsButton}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Quick Check-in Buttons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Check-in</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickButton, styles.safeButton]}
              onPress={() => handleQuickCheckIn('safe')}
              disabled={checkingIn}
              activeOpacity={0.8}
            >
              <View style={styles.quickButtonContent}>
                <Ionicons name="checkmark-circle" size={32} color="#FFFFFF" />
                <Text style={styles.quickButtonText}>I'm Safe</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickButton, styles.delayedButton]}
              onPress={() => handleQuickCheckIn('delayed')}
              disabled={checkingIn}
              activeOpacity={0.8}
            >
              <View style={styles.quickButtonContent}>
                <Ionicons name="time" size={32} color="#FFFFFF" />
                <Text style={styles.quickButtonText}>Delayed</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {checkingIn && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Checking in...</Text>
          </View>
        )}

        {/* Last Check-in Status */}
        {lastCheckIn && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last Check-in</Text>
            <View style={styles.statusCard}>
              <View style={styles.statusHeader}>
                <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(lastCheckIn.status) }]}>
                  <Ionicons name={getStatusIcon(lastCheckIn.status)} size={20} color="#FFFFFF" />
                </View>
                <View style={styles.statusInfo}>
                  <Text style={styles.statusText}>{lastCheckIn.status.toUpperCase()}</Text>
                  <Text style={styles.statusTime}>{formatTimeAgo(lastCheckIn.createdAt)}</Text>
                </View>
              </View>
              {lastCheckIn.location?.address && (
                <View style={styles.locationInfo}>
                  <Ionicons name="location" size={16} color="#6B7280" />
                  <Text style={styles.locationText} numberOfLines={2}>
                    {lastCheckIn.location.address}
                  </Text>
                </View>
              )}
              {lastCheckIn.message && (
                <Text style={styles.messageText}>{lastCheckIn.message}</Text>
              )}
            </View>
          </View>
        )}

        {/* Recent Check-ins */}
        {recentCheckIns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Check-ins</Text>
            {recentCheckIns.map((checkIn) => (
              <View key={checkIn.id} style={styles.recentCheckInCard}>
                <View style={styles.recentCheckInHeader}>
                  <View style={[styles.recentStatusDot, { backgroundColor: getStatusColor(checkIn.status) }]} />
                  <View style={styles.recentCheckInInfo}>
                    <Text style={styles.recentStatusText}>{checkIn.status.toUpperCase()}</Text>
                    <Text style={styles.recentTimeText}>{formatTimeAgo(checkIn.createdAt)}</Text>
                  </View>
                  {checkIn.isEmergency && (
                    <View style={styles.emergencyBadge}>
                      <Ionicons name="warning" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                {checkIn.message && (
                  <Text style={styles.recentMessageText}>{checkIn.message}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Settings Info */}
        {settings && (
          <View style={styles.section}>
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={20} color="#007AFF" />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Check-in Settings</Text>
                <Text style={styles.infoText}>
                  Automatic check-ins: {settings.autoCheckInEnabled ? 'Enabled' : 'Disabled'}
                </Text>
                <Text style={styles.infoText}>
                  Interval: Every {settings.checkInIntervalMinutes} minutes
                </Text>
                {settings.emergencyContacts.length > 0 && (
                  <Text style={styles.infoText}>
                    Emergency contacts: {settings.emergencyContacts.length}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  quickButton: {
    flex: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  safeButton: {
    backgroundColor: '#10B981',
  },
  delayedButton: {
    backgroundColor: '#F59E0B',
  },
  quickButtonContent: {
    alignItems: 'center',
    gap: 8,
  },
  quickButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingOverlay: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statusTime: {
    fontSize: 14,
    color: '#6B7280',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
  },
  messageText: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 12,
    lineHeight: 20,
  },
  nextCheckInInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  nextCheckInText: {
    fontSize: 14,
    color: '#6B7280',
  },
  recentCheckInCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  recentCheckInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  recentCheckInInfo: {
    flex: 1,
  },
  recentStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  recentTimeText: {
    fontSize: 12,
    color: '#6B7280',
  },
  emergencyBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recentMessageText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1E40AF',
    marginBottom: 4,
  },
});


