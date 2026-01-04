import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { supabase } from '../lib/supabase';
import { pushNotificationService } from '../services/pushNotificationService';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { MainTabParamList, RootStackParamList } from '../types';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  StackNavigationProp<RootStackParamList>
>;

interface ProfileScreenProps {
  navigation: ProfileScreenNavigationProp;
}

// Settings are now stored in user_settings table in database

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: 'Who receives my emergency alerts?',
    answer: 'Only the people in your Connections receive your emergency alerts. These are contacts you personally invite and approve. FamGuard does not send alerts to the public or to contacts outside your Connections.',
  },
  {
    question: 'What happens after I press the emergency button?',
    answer: 'An alert is sent immediately to your Connections with your location and time. The app then locks automatically and cannot be reopened from your device until a trusted connection confirms you are safe.',
  },
  {
    question: 'Can I stop or cancel an emergency alert?',
    answer: 'No. Once an emergency alert is triggered, it cannot be cancelled from your device. This prevents alerts from being stopped if your phone is taken or accessed by someone else.',
  },
  {
    question: 'Are incident reports anonymous?',
    answer: 'Yes. Incident reports can be submitted anonymously. Reports only include basic details to help nearby users stay informed and do not reveal your identity.',
  },
  {
    question: 'Does FamGuard work without internet access?',
    answer: 'FamGuard remains usable when mobile data is limited or network coverage is weak. Essential safety tools and maps stay available, though some features may require connectivity to update.',
  },
  {
    question: 'Why does FamGuard request location access?',
    answer: 'Location access, when enabled, is used to determine your location when you send an emergency alert to your Connections or report an incident. Location sharing only happens when you enable it.',
  },
  {
    question: 'Why are notifications required?',
    answer: 'Notifications allow you to receive safety alerts, incident updates, and messages from your Connections. Without notifications enabled, important alerts may be missed.',
  },
  {
    question: 'Does FamGuard track my location in the background?',
    answer: 'FamGuard does not track your location continuously. Location updates are shared only during emergency alerts, active location sharing, or when a feature requires it.',
  },
  {
    question: 'Can I change or revoke permissions later?',
    answer: 'Yes. You can manage location, notification, and other permissions at any time through the app settings or your device\'s system settings.',
  },
  {
    question: 'Will FamGuard access my contacts or personal files?',
    answer: 'FamGuard does not access your contacts, photos, or files unless you choose to add a contact to your Connections or submit information during an incident report.',
  },
];

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { user, logout, deleteAccount, updateUser } = useAuth();
  const { locationSharingEnabled, setLocationSharingEnabled } = useConnection();
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [communityReportsEnabled, setCommunityReportsEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [deletingAccount, setDeletingAccount] = useState<boolean>(false);
  const [showUsersManual, setShowUsersManual] = useState<boolean>(false);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  
  const realtimeChannelRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);

  // Load settings on mount
  useEffect(() => {
    if (user?.id) {
      loadSettings();
      setupRealtimeSubscription();
    }

    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // Cleanup realtime subscription
      if (realtimeChannelRef.current) {
        try {
          supabase.removeChannel(realtimeChannelRef.current);
        } catch (error) {
          console.warn('Error removing channel during cleanup:', error);
        }
        realtimeChannelRef.current = null;
      }
    };
  }, [user?.id]);

  // Set up real-time subscription for user profile updates
  const setupRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription if any
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    // Subscribe to users table changes for profile updates
    const channelName = `profile_screen_user:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          console.log('User profile update detected:', payload.eventType);
          // Reload user data when profile is updated
          if (isMountedRef.current) {
            loadSettings({ background: true });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('User settings update detected:', payload.eventType);
          // Reload settings when they are updated
          if (isMountedRef.current) {
            loadSettings({ background: true });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to user profile real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to user profile real-time updates');
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ User profile subscription timed out');
        } else if (status === 'CLOSED') {
          console.log('User profile subscription closed');
        }
      });

    realtimeChannelRef.current = channel;
  };

  // Load settings from database
  const loadSettings = async (
    options: { background?: boolean } = {}
  ): Promise<void> => {
    const { background = false } = options;
    if (!user?.id) return;

    try {
      if (!background) {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from('user_settings')
        .select('notifications_enabled, community_reports_enabled')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If settings don't exist, create default settings
        if (error.code === 'PGRST116') {
          await createDefaultSettings();
          setNotificationsEnabled(true);
          setCommunityReportsEnabled(true);
        } else {
          console.error('Error loading settings:', error);
          // Use defaults on error
          setNotificationsEnabled(true);
          setCommunityReportsEnabled(true);
        }
      } else if (data) {
        setNotificationsEnabled(data.notifications_enabled ?? true);
        setCommunityReportsEnabled(data.community_reports_enabled ?? true);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      // Use defaults on error
      setNotificationsEnabled(true);
      setCommunityReportsEnabled(true);
    } finally {
      if (isMountedRef.current) {
        if (!hasLoaded) {
          setHasLoaded(true);
        }
        if (!background) {
          setLoading(false);
        }
      }
    }
  };

  // Create default settings if they don't exist
  const createDefaultSettings = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          notifications_enabled: true,
          community_reports_enabled: true,
          location_update_frequency_minutes: 60, // Default 1 hour
          location_sharing_enabled: false,
        });

      if (error) {
        console.error('Error creating default settings:', error);
      }
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  // Save notifications setting
  const handleNotificationsToggle = async (value: boolean): Promise<void> => {
    if (!user?.id) return;

    try {
      setSaving(true);

      // If turning ON, request notification permission first
      if (value) {
        // CRITICAL: Check if running on physical device
        if (!Device.isDevice) {
          Alert.alert(
            'Physical Device Required',
            'Push notifications only work on physical devices, not simulators or emulators. Please test on a real device.',
            [{ text: 'OK' }]
          );
          setSaving(false);
          return;
        }

        console.log('📱 Physical device detected, proceeding with permission request...');

        // Check current permission status
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        console.log('📋 Current permission status:', existingStatus);
        
        if (existingStatus !== 'granted') {
          // Request permission
          console.log('🔔 Requesting notification permission...');
          const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
              allowAnnouncements: false,
            },
          });

          console.log('📋 Permission request result:', status, 'canAskAgain:', canAskAgain);

          if (status !== 'granted') {
            // Permission denied
            console.error('❌ Notification permission denied');
            
            if (!canAskAgain && Platform.OS === 'android') {
              // Permanently denied on Android - guide user to settings
              Alert.alert(
                'Permission Required',
                'Push notifications require notification permission. It appears you previously denied this permission.\n\nPlease enable it manually:\n1. Go to Settings\n2. Tap Apps > FamGuard\n3. Tap Notifications\n4. Enable "Show notifications"',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Open Settings',
                    onPress: () => {
                      Linking.openSettings().catch((err) => {
                        console.error('Error opening settings:', err);
                      });
                    },
                  },
                ]
              );
            } else {
              // Can ask again or iOS
              Alert.alert(
                'Permission Required',
                'Push notifications require notification permission to alert you about emergencies.\n\nPlease grant permission when prompted to receive important safety alerts.',
                [{ text: 'OK' }]
              );
            }
            // Don't enable toggle if permission not granted
            setSaving(false);
            return;
          }

          // Permission granted - register push token
          console.log('✅ Notification permission granted, registering push token...');
          try {
            await pushNotificationService.initialize(user.id);
            console.log('✅ Push token registered successfully');
          } catch (tokenError: any) {
            console.error('❌ Error registering push token:', tokenError);
            Alert.alert(
              'Warning',
              'Permission granted but failed to register push token. Notifications may not work. Please try again later.',
              [{ text: 'OK' }]
            );
            // Continue anyway - user can still receive notifications if token was already registered
          }
        } else {
          // Permission already granted - ensure token is registered
          console.log('✅ Notification permission already granted, ensuring token is registered...');
          try {
            await pushNotificationService.initialize(user.id);
            console.log('✅ Push token registration verified');
          } catch (tokenError: any) {
            console.error('❌ Error registering push token:', tokenError);
            // Continue anyway - token might already be registered
          }
        }

        // Verify permission is still granted after registration
        const { status: finalStatus } = await Notifications.getPermissionsAsync();
        if (finalStatus !== 'granted') {
          console.error('❌ Permission was revoked or not granted');
          Alert.alert(
            'Permission Not Granted',
            'Notification permission is required for push notifications. Please grant permission to enable notifications.',
            [{ text: 'OK' }]
          );
          setSaving(false);
          return;
        }
      }

      // Update toggle state
      setNotificationsEnabled(value);
      
      // Save to database
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            notifications_enabled: value,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving notifications setting:', error);
        Alert.alert('Error', 'Failed to save notification settings. Please try again.');
        // Revert on error
        setNotificationsEnabled(!value);
      } else {
        console.log('✅ Notifications setting saved:', value);
        if (value) {
          // Verify permission one more time before showing success
          const { status: verifyStatus } = await Notifications.getPermissionsAsync();
          if (verifyStatus === 'granted') {
            Alert.alert(
              'Success',
              'Push notifications enabled! You will receive emergency alerts and safety notifications.',
              [{ text: 'OK' }]
            );
          } else {
            Alert.alert(
              'Warning',
              'Notifications setting saved, but permission is not granted. Please enable notifications in device settings.',
              [{ text: 'OK' }]
            );
          }
        }
      }
    } catch (error: any) {
      console.error('❌ Error saving notifications setting:', error);
      Alert.alert(
        'Error',
        `Failed to save notification settings: ${error?.message || 'Unknown error'}\n\nPlease try again.`,
        [{ text: 'OK' }]
      );
      // Revert on error
      setNotificationsEnabled(!value);
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  // Save community reports setting
  const handleCommunityReportsToggle = async (value: boolean): Promise<void> => {
    if (!user?.id) return;

    try {
      setSaving(true);
      setCommunityReportsEnabled(value);
      
      // Save to database
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            community_reports_enabled: value,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving community reports setting:', error);
        Alert.alert('Error', 'Failed to save community reports settings. Please try again.');
        // Revert on error
        setCommunityReportsEnabled(!value);
      } else {
        console.log('Community reports setting saved:', value);
      }
    } catch (error) {
      console.error('Error saving community reports setting:', error);
      Alert.alert('Error', 'Failed to save community reports settings. Please try again.');
      // Revert on error
      setCommunityReportsEnabled(!value);
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  // Handle location sharing toggle (already handled by ConnectionContext, but we can add loading state)
  const handleLocationSharingToggle = async (value: boolean): Promise<void> => {
    try {
      setSaving(true);
      await setLocationSharingEnabled(value);
    } catch (error) {
      console.error('Error saving location sharing setting:', error);
      Alert.alert('Error', 'Failed to save location sharing settings. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  // Navigation handlers
  const handleEditProfile = (): void => {
    navigation.navigate('EditProfile');
  };

  const handleConnections = (): void => {
    navigation.navigate('Connections');
  };

  const handleEmergencyNotes = (): void => {
    navigation.navigate('EmergencyNotes');
  };

  const handleLocationAccuracy = (): void => {
    navigation.navigate('LocationAccuracy');
  };

  const handleLocationUpdateFrequency = (): void => {
    navigation.navigate('LocationUpdateFrequency');
  };

  const handleSleepMode = (): void => {
    navigation.navigate('SleepMode');
  };

  // Test push notification
  const handleTestPushNotification = async (): Promise<void> => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found. Please log in and try again.');
      return;
    }

    try {
      // Check if permission is granted
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Push notifications require notification permission. Please enable it in Settings > Apps > FamGuard > Notifications, or toggle Push Notifications ON in Profile.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Check if token exists in database
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_push_tokens')
        .select('push_token')
        .eq('user_id', user.id)
        .single();

      if (tokenError || !tokenData) {
        Alert.alert(
          'Token Not Found',
          'Push notification token not registered. Please toggle Push Notifications ON in Profile to register your token.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Show confirmation dialog
      Alert.alert(
        'Test Push Notification',
        'This will send a test notification to your device. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Test',
            onPress: async () => {
              try {
                // Send test notification via Edge Function
                const { data, error } = await supabase.functions.invoke(
                  'send-push-notification',
                  {
                    body: {
                      user_ids: [user.id],
                      title: '🧪 Test Notification',
                      body: 'If you see this, push notifications are working!',
                      data: {
                        type: 'test',
                        timestamp: new Date().toISOString(),
                      },
                    },
                  }
                );

                if (error) {
                  console.error('Error sending test notification:', error);
                  Alert.alert(
                    'Error',
                    `Failed to send test notification: ${error.message || 'Unknown error'}\n\nCheck Edge Function logs for details.`,
                    [{ text: 'OK' }]
                  );
                  return;
                }

                if (data) {
                  const sentCount = data.sent || 0;
                  const failedCount = data.failed || 0;
                  const message = data.message || '';

                  if (sentCount > 0) {
                    Alert.alert(
                      '✅ Success!',
                      `Test notification sent successfully!\n\nCheck your device notifications. You should receive a test notification shortly.\n\nSent: ${sentCount}\nFailed: ${failedCount}`,
                      [{ text: 'OK' }]
                    );
                  } else if (message) {
                    Alert.alert(
                      '⚠️ No Notification Sent',
                      `${message}\n\nThis usually means:\n• Token not found in database\n• Token expired or invalid\n• Try toggling Push Notifications OFF and ON again`,
                      [{ text: 'OK' }]
                    );
                  } else {
                    Alert.alert(
                      '⚠️ Unknown Result',
                      'Notification request completed but no confirmation. Check your device notifications.',
                      [{ text: 'OK' }]
                    );
                  }
                }
              } catch (error: any) {
                console.error('Error testing push notification:', error);
                Alert.alert(
                  'Error',
                  `Failed to test notification: ${error?.message || 'Unknown error'}\n\nPlease try again.`,
                  [{ text: 'OK' }]
                );
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error in handleTestPushNotification:', error);
      Alert.alert(
        'Error',
        `Failed to test notification: ${error?.message || 'Unknown error'}\n\nPlease try again.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleLanguageRegion = (): void => {
    navigation.navigate('LanguageRegion');
  };

  const handleUnits = (): void => {
    navigation.navigate('Units');
  };

  const handleBatterySaving = (): void => {
    navigation.navigate('BatterySaving');
  };

  const handleOfflineMaps = (): void => {
    navigation.navigate('OfflineMaps');
  };

  const handleHelpSupport = (): void => {
    navigation.navigate('HelpSupport');
  };

  const handleUsersManual = (): void => {
    setShowUsersManual(true);
  };

  const toggleFAQ = (index: number): void => {
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  const handlePrivacyPolicy = (): void => {
    navigation.navigate('PrivacyPolicy');
  };

  const handleTermsOfService = (): void => {
    navigation.navigate('TermsOfService');
  };

  const handleLogout = async (): Promise<void> => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoggingOut(true);
              
              // Clean up realtime subscriptions before logout
              if (realtimeChannelRef.current) {
                try {
                  supabase.removeChannel(realtimeChannelRef.current);
                  realtimeChannelRef.current = null;
                } catch (error) {
                  console.warn('Error removing channel during logout:', error);
                }
              }
              
              // Perform logout
              await logout();
              
              // Navigation will be handled automatically by App.tsx
              // based on isAuthenticated state change
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert(
                'Error',
                'Failed to sign out. Please try again.',
                [{ text: 'OK' }]
              );
            } finally {
              if (isMountedRef.current) {
                setLoggingOut(false);
              }
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async (): Promise<void> => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone. All your data, connections, and settings will be permanently deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Second confirmation
            Alert.alert(
              'Final Confirmation',
              'This will permanently delete your account and all associated data. Are you absolutely sure?',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
                {
                  text: 'Yes, Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setDeletingAccount(true);
                      
                      // Clean up realtime subscriptions before deletion
                      if (realtimeChannelRef.current) {
                        try {
                          supabase.removeChannel(realtimeChannelRef.current);
                          realtimeChannelRef.current = null;
                        } catch (error) {
                          console.warn('Error removing channel during account deletion:', error);
                        }
                      }
                      
                      // Perform account deletion
                      await deleteAccount();
                      
                      // Navigation will be handled automatically by App.tsx
                      // based on isAuthenticated state change
                    } catch (error: any) {
                      console.error('Error during account deletion:', error);
                      Alert.alert(
                        'Error',
                        error.message || 'Failed to delete account. Please try again.',
                        [{ text: 'OK' }]
                      );
                    } finally {
                      if (isMountedRef.current) {
                        setDeletingAccount(false);
                      }
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleDeleteAccountViaWebsite = (): void => {
    // Get deletion URL from environment variable
    const getEnvVar = (key: string): string | undefined => {
      // Try to get from Constants.expoConfig.extra first (for app.json config)
      if (Constants.expoConfig?.extra?.[key]) {
        return Constants.expoConfig.extra[key];
      }
      // Fallback to process.env (for .env file with expo-constants)
      return process.env[key];
    };
    
    const deleteAccountUrl = getEnvVar('EXPO_PUBLIC_DELETE_ACCOUNT_URL') || 'https://safezone.app/delete-account';
    
    if (!deleteAccountUrl) {
      Alert.alert(
        'Error',
        'Account deletion URL is not configured. Please contact support.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    Alert.alert(
      'Delete Account via Website',
      'You will be redirected to our website to complete the account deletion process.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          onPress: () => {
            Linking.openURL(deleteAccountUrl).catch((error) => {
              console.error('Error opening URL:', error);
              Alert.alert(
                'Error',
                'Could not open the website. Please try again later.',
                [{ text: 'OK' }]
              );
            });
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleEditProfile}
            disabled={saving}
          >
            <Ionicons name="person-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleConnections}
            disabled={saving}
          >
            <Ionicons name="people-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Connections</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleEmergencyNotes}
            disabled={saving}
          >
            <Ionicons name="document-text-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Emergency Notes</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety & Privacy</Text>
          <View style={styles.menuItem}>
            <Ionicons name="location-outline" size={20} color="#000000" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>Share Location</Text>
              <Text style={styles.menuItemSubtext}>Visible to connections</Text>
            </View>
            {saving ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Switch
                value={locationSharingEnabled}
                onValueChange={handleLocationSharingToggle}
                trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                thumbColor="#FFFFFF"
                disabled={saving}
              />
            )}
          </View>
          <View style={styles.menuItem}>
            <Ionicons name="alert-circle-outline" size={20} color="#000000" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>Community Reports</Text>
              <Text style={styles.menuItemSubtext}>Show nearby incidents</Text>
            </View>
            {saving ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Switch
                value={communityReportsEnabled}
                onValueChange={handleCommunityReportsToggle}
                trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                thumbColor="#FFFFFF"
                disabled={saving}
              />
            )}
          </View>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleLocationAccuracy}
            disabled={saving}
          >
            <Ionicons name="eye-outline" size={20} color="#000000" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>Location Accuracy</Text>
              <Text style={styles.menuItemSubtext}>Exact GPS or approximate</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleLocationUpdateFrequency}
            disabled={saving}
          >
            <Ionicons name="time-outline" size={20} color="#000000" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>Location Update Frequency</Text>
              <Text style={styles.menuItemSubtext}>How often location updates</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.menuItem}>
            <Ionicons name="notifications-outline" size={20} color="#000000" />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>Push Notifications</Text>
              <Text style={styles.menuItemSubtext}>Receive safety alerts</Text>
            </View>
            {saving ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                thumbColor="#FFFFFF"
                disabled={saving}
              />
            )}
          </View>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleTestPushNotification}
            disabled={saving}
          >
            <Ionicons name="send-outline" size={20} color="#007AFF" />
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemText, { color: '#007AFF' }]}>Test Push Notification</Text>
              <Text style={styles.menuItemSubtext}>Send a test notification to this device</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleSleepMode}
            disabled={saving}
          >
            <Ionicons name="time-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Sleep Mode</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleLanguageRegion}
            disabled={saving}
          >
            <Ionicons name="language-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Language & Region</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleUnits}
            disabled={saving}
          >
            <Ionicons name="speedometer-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Units (km / miles)</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleBatterySaving}
            disabled={saving}
          >
            <Ionicons name="battery-charging-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Battery Saving Mode</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleOfflineMaps}
            disabled={saving}
          >
            <Ionicons name="map-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Offline Maps</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleUsersManual}
            disabled={saving}
          >
            <Ionicons name="book-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Users Manual</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleHelpSupport}
            disabled={saving}
          >
            <Ionicons name="help-circle-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handlePrivacyPolicy}
            disabled={saving}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleTermsOfService}
            disabled={saving}
          >
            <Ionicons name="document-text-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Management</Text>
          <TouchableOpacity 
            style={[styles.deleteAccountButton, (saving || deletingAccount) && styles.deleteAccountButtonDisabled]} 
            onPress={handleDeleteAccount}
            disabled={saving || deletingAccount}
          >
            {(saving || deletingAccount) ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.deleteAccountExternalButton, (saving || deletingAccount) && styles.deleteAccountButtonDisabled]} 
            onPress={handleDeleteAccountViaWebsite}
            disabled={saving || deletingAccount}
          >
            <Ionicons name="globe-outline" size={20} color="#FF3B30" />
            <Text style={styles.deleteAccountExternalButtonText}>Delete Account via Website</Text>
            <Ionicons name="open-outline" size={16} color="#FF3B30" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.logoutButton, (saving || loggingOut || deletingAccount) && styles.logoutButtonDisabled]} 
          onPress={handleLogout}
          disabled={saving || loggingOut || deletingAccount}
        >
          {(saving || loggingOut) ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Users Manual Modal */}
      <Modal
        visible={showUsersManual}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setShowUsersManual(false);
          setExpandedFAQ(null);
        }}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowUsersManual(false);
                setExpandedFAQ(null);
              }}
              style={styles.modalBackButton}
            >
              <Ionicons name="arrow-back" size={24} color="#000000" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Users Manual</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            style={styles.faqContent} 
            contentContainerStyle={styles.faqScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            {faqData.map((faq, index) => (
              <View key={index} style={styles.faqItem}>
                <TouchableOpacity
                  style={styles.faqQuestion}
                  onPress={() => toggleFAQ(index)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.faqQuestionText}>{faq.question}</Text>
                  <Ionicons
                    name={expandedFAQ === index ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#6366F1"
                  />
                </TouchableOpacity>
                {expandedFAQ === index && (
                  <View style={styles.faqAnswer}>
                    <Text style={styles.faqAnswerText}>{faq.answer}</Text>
                  </View>
                )}
              </View>
            ))}
      </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemText: {
    fontSize: 16,
    color: '#000000',
    flex: 1,
  },
  menuItemSubtext: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  logoutButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButton: {
    marginTop: 8,
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteAccountButtonDisabled: {
    opacity: 0.6,
  },
  deleteAccountButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountExternalButton: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteAccountExternalButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 32,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    width: '100%',
    height: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    minHeight: 56,
  },
  modalBackButton: {
    padding: 4,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    flex: 1,
    textAlign: 'center',
    marginRight: 28,
  },
  faqContent: {
    flex: 1,
    width: '100%',
  },
  faqScrollContent: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },
  faqItem: {
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  faqQuestionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    marginRight: 12,
    lineHeight: 22,
  },
  faqAnswer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  faqAnswerText: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
    marginTop: 12,
  },
});

