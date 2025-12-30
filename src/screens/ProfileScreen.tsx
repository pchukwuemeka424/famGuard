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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { supabase } from '../lib/supabase';
import type { MainTabParamList, RootStackParamList } from '../types';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  StackNavigationProp<RootStackParamList>
>;

interface ProfileScreenProps {
  navigation: ProfileScreenNavigationProp;
}

// Settings are now stored in user_settings table in database

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { user, logout, updateUser } = useAuth();
  const { locationSharingEnabled, setLocationSharingEnabled } = useConnection();
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [communityReportsEnabled, setCommunityReportsEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  
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
          location_sharing_enabled: true,
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
        console.log('Notifications setting saved:', value);
      }
    } catch (error) {
      console.error('Error saving notifications setting:', error);
      Alert.alert('Error', 'Failed to save notification settings. Please try again.');
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

  const handleNotificationFilters = (): void => {
    navigation.navigate('NotificationFilters');
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

  const handleHelpSupport = (): void => {
    navigation.navigate('HelpSupport');
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
              await logout();
            } catch (error) {
              console.error('Error during logout:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
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
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.name || 'User'}</Text>
          <Text style={styles.email}>{user?.email || ''}</Text>
          <Text style={styles.phone}>{user?.phone || ''}</Text>
        </View>

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
            onPress={handleSleepMode}
            disabled={saving}
          >
            <Ionicons name="time-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Sleep Mode</Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={handleNotificationFilters}
            disabled={saving}
          >
            <Ionicons name="filter-outline" size={20} color="#000000" />
            <Text style={styles.menuItemText}>Notification Filters</Text>
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
        </View>

        <View style={styles.section}>
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

        <TouchableOpacity 
          style={[styles.logoutButton, saving && styles.logoutButtonDisabled]} 
          onPress={handleLogout}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  profileSection: {
    alignItems: 'center',
    padding: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 4,
  },
  phone: {
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
});

