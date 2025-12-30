import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../types';

type LockedScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Locked'>;

interface LockedScreenProps {
  navigation: LockedScreenNavigationProp;
}

export default function LockedScreen({ navigation }: LockedScreenProps) {
  const { user } = useAuth();
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    // Check lock status periodically
    const checkLockStatus = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('users')
          .select('is_locked')
          .eq('id', user.id)
          .single();

        if (!error && data && !data.is_locked) {
          // User has been unlocked, navigate back to home
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
        }
      } catch (error) {
        console.error('Error checking lock status:', error);
      } finally {
        setCheckingStatus(false);
      }
    };

    // Check immediately
    checkLockStatus();

    // Check every 5 seconds
    const interval = setInterval(checkLockStatus, 5000);

    return () => clearInterval(interval);
  }, [user?.id, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
          {/* Lock Icon Container */}
          <View style={styles.lockIconContainer}>
            <View style={styles.lockIconOuter}>
              <View style={styles.lockIconInner}>
                <Ionicons name="lock-closed" size={72} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.lockPulse} />
          </View>

          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>App Locked</Text>
            <View style={styles.badgeContainer}>
              <View style={styles.lockBadge}>
                <Ionicons name="lock-closed" size={16} color="#FFFFFF" />
                <Text style={styles.badgeText}>SECURED</Text>
              </View>
            </View>
          </View>

          {/* Simple Message */}
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>
              Access to the app is temporarily restricted.
            </Text>
            <Text style={styles.messageText}>
              Please contact one of your trusted connections to unlock your account.
            </Text>
          </View>

          {/* Status Indicator */}
          {checkingStatus && (
            <View style={styles.statusContainer}>
              <ActivityIndicator size="small" color="#DC2626" />
              <Text style={styles.statusText}>Checking lock status...</Text>
            </View>
          )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
    alignItems: 'center',
  },
  lockIconContainer: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lockIconOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FECACA',
    ...Platform.select({
      ios: {
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  lockIconInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockPulse: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#FEE2E2',
    opacity: 0.4,
    zIndex: -1,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  badgeContainer: {
    marginTop: 8,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  messageContainer: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  messageText: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
});
