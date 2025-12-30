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

type SleepModeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SleepMode'>;

interface SleepModeScreenProps {
  navigation: SleepModeScreenNavigationProp;
}

export default function SleepModeScreen({ navigation }: SleepModeScreenProps) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [startTime, setStartTime] = useState('22:00');
  const [endTime, setEndTime] = useState('07:00');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadSleepModeSettings();
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

    const channelName = `sleep_mode:${user.id}`;
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
            if (newData.sleep_mode_enabled !== undefined) setEnabled(newData.sleep_mode_enabled);
            if (newData.sleep_mode_start_time) setStartTime(newData.sleep_mode_start_time);
            if (newData.sleep_mode_end_time) setEndTime(newData.sleep_mode_end_time);
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const loadSleepModeSettings = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_settings')
        .select('sleep_mode_enabled, sleep_mode_start_time, sleep_mode_end_time')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          await createDefaultSettings();
        } else {
          console.error('Error loading sleep mode settings:', error);
        }
      } else if (data) {
        setEnabled(data.sleep_mode_enabled ?? false);
        if (data.sleep_mode_start_time) setStartTime(data.sleep_mode_start_time);
        if (data.sleep_mode_end_time) setEndTime(data.sleep_mode_end_time);
      }
    } catch (error) {
      console.error('Error loading sleep mode settings:', error);
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
          sleep_mode_enabled: false,
          sleep_mode_start_time: '22:00',
          sleep_mode_end_time: '07:00',
        });
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  const handleToggle = async (value: boolean) => {
    if (!user?.id || saving) return;

    try {
      setSaving(true);
      setEnabled(value);

      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            sleep_mode_enabled: value,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving sleep mode:', error);
        Alert.alert('Error', 'Failed to save sleep mode setting. Please try again.');
        await loadSleepModeSettings();
      }
    } catch (error) {
      console.error('Error saving sleep mode:', error);
      Alert.alert('Error', 'Failed to save sleep mode setting. Please try again.');
      await loadSleepModeSettings();
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
        <Text style={styles.headerTitle}>Sleep Mode</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Sleep mode reduces notifications during your sleep hours to avoid disturbing you.
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
                  <Text style={styles.settingTitle}>Enable Sleep Mode</Text>
                  <Text style={styles.settingSubtitle}>Reduce notifications during sleep hours</Text>
                </View>
                {saving ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Switch
                    value={enabled}
                    onValueChange={handleToggle}
                    trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                    thumbColor="#FFFFFF"
                    disabled={saving}
                  />
                )}
              </View>
            </View>

        {enabled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sleep Hours</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeOption}>
                <Text style={styles.timeLabel}>Start Time</Text>
                <Text style={styles.timeValue}>{startTime}</Text>
              </View>
              <View style={styles.timeOption}>
                <Text style={styles.timeLabel}>End Time</Text>
                <Text style={styles.timeValue}>{endTime}</Text>
              </View>
            </View>
            <Text style={styles.note}>
              Time picker functionality can be added here
            </Text>
          </View>
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
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
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#F9F9F9',
  },
  timeLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  note: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 8,
    fontStyle: 'italic',
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

