import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type LocationUpdateFrequencyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'LocationUpdateFrequency'>;

interface LocationUpdateFrequencyScreenProps {
  navigation: LocationUpdateFrequencyScreenNavigationProp;
}

interface FrequencyOption {
  label: string;
  minutes: number;
  description: string;
}

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { label: '15 minutes', minutes: 15, description: 'Update location every 15 minutes' },
  { label: '30 minutes', minutes: 30, description: 'Update location every 30 minutes' },
  { label: '1 hour', minutes: 60, description: 'Update location every hour (recommended)' },
  { label: '2 hours', minutes: 120, description: 'Update location every 2 hours' },
  { label: '3 hours', minutes: 180, description: 'Update location every 3 hours' },
];

export default function LocationUpdateFrequencyScreen({ navigation }: LocationUpdateFrequencyScreenProps) {
  const { user } = useAuth();
  const [selectedMinutes, setSelectedMinutes] = useState<number>(60); // Default 1 hour
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadSettings();
      setupRealtimeSubscription();
    }

    return () => {
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

  // Set up real-time subscription for settings updates
  const setupRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription if any
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    // Subscribe to user_settings table changes
    const channelName = `location_update_frequency:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Location update frequency change detected:', payload.eventType);
          const newData = payload.new as any;
          if (newData?.location_update_frequency_minutes) {
            setSelectedMinutes(newData.location_update_frequency_minutes);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to location update frequency real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to location update frequency real-time updates');
        }
      });

    realtimeChannelRef.current = channel;
  };

  // Load settings from database
  const loadSettings = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_settings')
        .select('location_update_frequency_minutes')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If settings don't exist, create default settings
        if (error.code === 'PGRST116') {
          await createDefaultSettings();
          setSelectedMinutes(60); // Default 1 hour
        } else {
          console.error('Error loading settings:', error);
          Alert.alert('Error', 'Failed to load settings. Using default values.');
          setSelectedMinutes(60);
        }
      } else if (data) {
        setSelectedMinutes(data.location_update_frequency_minutes || 60);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setSelectedMinutes(60); // Default on error
    } finally {
      setLoading(false);
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
          location_update_frequency_minutes: 60, // Default 1 hour
          notifications_enabled: true,
          community_reports_enabled: true,
          location_sharing_enabled: false,
        });

      if (error) {
        console.error('Error creating default settings:', error);
      }
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  // Save selected frequency
  const handleSelectFrequency = async (minutes: number): Promise<void> => {
    if (!user?.id || saving) return;

    try {
      setSaving(true);
      setSelectedMinutes(minutes);

      // Upsert settings (insert if doesn't exist, update if exists)
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            location_update_frequency_minutes: minutes,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving location update frequency:', error);
        Alert.alert('Error', 'Failed to save location update frequency. Please try again.');
        // Revert on error
        await loadSettings();
      } else {
        console.log('Location update frequency saved:', minutes, 'minutes');
      }
    } catch (error) {
      console.error('Error saving location update frequency:', error);
      Alert.alert('Error', 'Failed to save location update frequency. Please try again.');
      // Revert on error
      await loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    } else if (minutes === 60) {
      return '1 hr';
    } else {
      const hours = minutes / 60;
      return `${hours} hr`;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Location Update Frequency</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location Update Frequency</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Choose how often your location is updated and shared with your connections.
          More frequent updates provide better accuracy but use more battery.
        </Text>

        {FREQUENCY_OPTIONS.map((option) => {
          const isSelected = selectedMinutes === option.minutes;
          const isSaving = saving && selectedMinutes === option.minutes;

          return (
            <TouchableOpacity
              key={option.minutes}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => handleSelectFrequency(option.minutes)}
              disabled={saving}
            >
              <View style={styles.optionContent}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#007AFF" style={styles.radioButton} />
                ) : (
                  <Ionicons
                    name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                    size={24}
                    color={isSelected ? '#007AFF' : '#8E8E93'}
                    style={styles.radioButton}
                  />
                )}
                <View style={styles.optionText}>
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionTitle}>{option.label}</Text>
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>Current</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.optionSubtitle}>{option.description}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
          <Text style={styles.infoText}>
            Your location will be updated automatically at the selected interval when location sharing is enabled.
            You can change this setting at any time.
          </Text>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: 16,
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
  description: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
    lineHeight: 20,
  },
  option: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#F9F9F9',
  },
  optionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    marginRight: 12,
  },
  optionText: {
    flex: 1,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  selectedBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
    lineHeight: 20,
  },
});
