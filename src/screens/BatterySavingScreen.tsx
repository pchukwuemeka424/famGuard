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
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type BatterySavingScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BatterySaving'>;

interface BatterySavingScreenProps {
  navigation: BatterySavingScreenNavigationProp;
}

export default function BatterySavingScreen({ navigation }: BatterySavingScreenProps) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [reduceLocationUpdates, setReduceLocationUpdates] = useState(false);
  const [reduceBackgroundSync, setReduceBackgroundSync] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadBatterySavingSettings();
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

  const setupRealtimeSubscription = (): void => {
    if (!user?.id) return;

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channelName = `battery_saving:${user.id}`;
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
          if (newData) {
            if (newData.battery_saving_mode !== undefined) setEnabled(newData.battery_saving_mode);
            if (newData.battery_saving_reduce_location_updates !== undefined) setReduceLocationUpdates(newData.battery_saving_reduce_location_updates);
            if (newData.battery_saving_reduce_background_sync !== undefined) setReduceBackgroundSync(newData.battery_saving_reduce_background_sync);
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const loadBatterySavingSettings = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_settings')
        .select('battery_saving_mode, battery_saving_reduce_location_updates, battery_saving_reduce_background_sync')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          await createDefaultSettings();
        } else {
          console.error('Error loading battery saving settings:', error);
        }
      } else if (data) {
        setEnabled(data.battery_saving_mode ?? false);
        setReduceLocationUpdates(data.battery_saving_reduce_location_updates ?? false);
        setReduceBackgroundSync(data.battery_saving_reduce_background_sync ?? false);
      }
    } catch (error) {
      console.error('Error loading battery saving settings:', error);
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
          battery_saving_mode: false,
          battery_saving_reduce_location_updates: false,
          battery_saving_reduce_background_sync: false,
        });
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  const handleToggle = async (field: string, value: boolean) => {
    if (!user?.id || saving) return;

    try {
      setSaving(true);

      const updateData: any = { user_id: user.id };
      if (field === 'battery_saving_mode') {
        setEnabled(value);
        updateData.battery_saving_mode = value;
      } else if (field === 'battery_saving_reduce_location_updates') {
        setReduceLocationUpdates(value);
        updateData.battery_saving_reduce_location_updates = value;
      } else if (field === 'battery_saving_reduce_background_sync') {
        setReduceBackgroundSync(value);
        updateData.battery_saving_reduce_background_sync = value;
      }

      const { error } = await supabase
        .from('user_settings')
        .upsert(updateData, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Error saving battery saving settings:', error);
        Alert.alert('Error', 'Failed to save battery saving settings. Please try again.');
        await loadBatterySavingSettings();
      }
    } catch (error) {
      console.error('Error saving battery saving settings:', error);
      Alert.alert('Error', 'Failed to save battery saving settings. Please try again.');
      await loadBatterySavingSettings();
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
        <Text style={styles.headerTitle}>Battery Saving Mode</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Optimize app performance to conserve battery life. Some features may be limited.
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.settingRow}>
                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>Enable Battery Saving</Text>
                  <Text style={styles.settingSubtitle}>Reduce background activity</Text>
                </View>
                {saving ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Switch
                    value={enabled}
                    onValueChange={(value) => handleToggle('battery_saving_mode', value)}
                    trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                    thumbColor="#FFFFFF"
                    disabled={saving}
                  />
                )}
              </View>
            </View>

            {enabled && (
              <>
                <View style={styles.section}>
                  <View style={styles.settingRow}>
                    <View style={styles.settingContent}>
                      <Text style={styles.settingTitle}>Reduce Location Updates</Text>
                      <Text style={styles.settingSubtitle}>Update location less frequently</Text>
                    </View>
                    {saving ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <Switch
                        value={reduceLocationUpdates}
                        onValueChange={(value) => handleToggle('battery_saving_reduce_location_updates', value)}
                        trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                        thumbColor="#FFFFFF"
                        disabled={saving}
                      />
                    )}
                  </View>
                </View>

                <View style={styles.section}>
                  <View style={styles.settingRow}>
                    <View style={styles.settingContent}>
                      <Text style={styles.settingTitle}>Reduce Background Sync</Text>
                      <Text style={styles.settingSubtitle}>Sync data less frequently</Text>
                    </View>
                    {saving ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <Switch
                        value={reduceBackgroundSync}
                        onValueChange={(value) => handleToggle('battery_saving_reduce_background_sync', value)}
                        trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                        thumbColor="#FFFFFF"
                        disabled={saving}
                      />
                    )}
                  </View>
                </View>
              </>
            )}
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
  section: {
    marginBottom: 24,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
});
