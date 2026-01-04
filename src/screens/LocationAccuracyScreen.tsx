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

type LocationAccuracyScreenNavigationProp = StackNavigationProp<RootStackParamList, 'LocationAccuracy'>;

interface LocationAccuracyScreenProps {
  navigation: LocationAccuracyScreenNavigationProp;
}

type AccuracyMode = 'exact' | 'approximate';

export default function LocationAccuracyScreen({ navigation }: LocationAccuracyScreenProps) {
  const { user } = useAuth();
  const [accuracyMode, setAccuracyMode] = useState<AccuracyMode>('exact');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadAccuracyMode();
      setupRealtimeSubscription();
    }

    return () => {
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

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channelName = `location_accuracy:${user.id}`;
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
          const newData = payload.new as any;
          if (newData?.location_accuracy) {
            setAccuracyMode(newData.location_accuracy);
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const loadAccuracyMode = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_settings')
        .select('location_accuracy')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No settings found - create with 'exact' as default
          await createDefaultSettings();
          setAccuracyMode('exact');
        } else {
          console.error('Error loading accuracy mode:', error);
          // Default to 'exact' on error
          setAccuracyMode('exact');
        }
      } else if (data) {
        // If location_accuracy is null, undefined, or empty, default to 'exact'
        const savedMode = data.location_accuracy as AccuracyMode;
        if (!savedMode || (savedMode !== 'exact' && savedMode !== 'approximate')) {
          // Invalid or missing value - save 'exact' as default
          setAccuracyMode('exact');
          await supabase
            .from('user_settings')
            .upsert(
              {
                user_id: user.id,
                location_accuracy: 'exact',
              },
              {
                onConflict: 'user_id',
              }
            );
        } else {
          setAccuracyMode(savedMode);
        }
      } else {
        // No data returned - default to 'exact'
        setAccuracyMode('exact');
        await createDefaultSettings();
      }
    } catch (error) {
      console.error('Error loading accuracy mode:', error);
      // Always default to 'exact' on any error
      setAccuracyMode('exact');
    } finally {
      setLoading(false);
    }
  };

  const createDefaultSettings = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          location_accuracy: 'exact',
        });
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  const handleSelectMode = async (mode: AccuracyMode) => {
    if (!user?.id || saving) return;

    try {
      setSaving(true);
      setAccuracyMode(mode);

      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            location_accuracy: mode,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving accuracy mode:', error);
        Alert.alert('Error', 'Failed to save location accuracy setting. Please try again.');
        await loadAccuracyMode();
      }
    } catch (error) {
      console.error('Error saving accuracy mode:', error);
      Alert.alert('Error', 'Failed to save location accuracy setting. Please try again.');
      await loadAccuracyMode();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location Accuracy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Choose how precise your location is shared with your connections.
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.option, accuracyMode === 'exact' && styles.optionSelected]}
              onPress={() => handleSelectMode('exact')}
              disabled={saving}
            >
          <View style={styles.optionContent}>
            <Ionicons
              name={accuracyMode === 'exact' ? 'radio-button-on' : 'radio-button-off'}
              size={24}
              color={accuracyMode === 'exact' ? '#007AFF' : '#8E8E93'}
            />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Exact GPS Location</Text>
              <Text style={styles.optionSubtitle}>
                Share your precise location with exact coordinates
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, accuracyMode === 'approximate' && styles.optionSelected]}
          onPress={() => handleSelectMode('approximate')}
        >
          <View style={styles.optionContent}>
            <Ionicons
              name={accuracyMode === 'approximate' ? 'radio-button-on' : 'radio-button-off'}
              size={24}
              color={accuracyMode === 'approximate' ? '#007AFF' : '#8E8E93'}
            />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Approximate Location</Text>
              <Text style={styles.optionSubtitle}>
                Share a general area (within ~100 meters) for privacy
              </Text>
            </View>
          </View>
        </TouchableOpacity>
          </>
        )}
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
  optionText: {
    flex: 1,
    marginLeft: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
});

