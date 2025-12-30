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

type NotificationFiltersScreenNavigationProp = StackNavigationProp<RootStackParamList, 'NotificationFilters'>;

interface NotificationFiltersScreenProps {
  navigation: NotificationFiltersScreenNavigationProp;
}

interface NotificationFilter {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_FILTERS: NotificationFilter[] = [
  { id: 'emergency', label: 'Emergency Alerts', description: 'Critical safety notifications', enabled: true },
  { id: 'incidents', label: 'Incident Reports', description: 'Nearby incident notifications', enabled: true },
  { id: 'connections', label: 'Connection Updates', description: 'When connections join or leave', enabled: true },
  { id: 'location', label: 'Location Updates', description: 'When connections share location', enabled: false },
  { id: 'community', label: 'Community Reports', description: 'Community safety updates', enabled: true },
];

export default function NotificationFiltersScreen({ navigation }: NotificationFiltersScreenProps) {
  const { user } = useAuth();
  const [filters, setFilters] = useState<NotificationFilter[]>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadFilters();
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

    const channelName = `notification_filters:${user.id}`;
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
          if (newData?.notification_filters) {
            try {
              const parsed = JSON.parse(JSON.stringify(newData.notification_filters));
              if (Array.isArray(parsed)) {
                setFilters(parsed);
              }
            } catch (error) {
              console.error('Error parsing notification filters:', error);
            }
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const loadFilters = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_settings')
        .select('notification_filters')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          await createDefaultSettings();
          setFilters(DEFAULT_FILTERS);
        } else {
          console.error('Error loading notification filters:', error);
          setFilters(DEFAULT_FILTERS);
        }
      } else if (data) {
        if (data.notification_filters && Array.isArray(data.notification_filters)) {
          setFilters(data.notification_filters);
        } else {
          setFilters(DEFAULT_FILTERS);
        }
      }
    } catch (error) {
      console.error('Error loading notification filters:', error);
      setFilters(DEFAULT_FILTERS);
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
          notification_filters: DEFAULT_FILTERS,
        });
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  const handleToggle = async (id: string, value: boolean) => {
    if (!user?.id || saving) return;

    try {
      setSaving(true);
      const updated = filters.map(filter =>
        filter.id === id ? { ...filter, enabled: value } : filter
      );
      setFilters(updated);
      
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            notification_filters: updated,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving notification filters:', error);
        Alert.alert('Error', 'Failed to save notification filters. Please try again.');
        await loadFilters();
      }
    } catch (error) {
      console.error('Error saving notification filters:', error);
      Alert.alert('Error', 'Failed to save notification filters. Please try again.');
      await loadFilters();
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
        <Text style={styles.headerTitle}>Notification Filters</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Choose which types of notifications you want to receive.
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            {filters.map((filter) => (
              <View key={filter.id} style={styles.filterRow}>
                <View style={styles.filterContent}>
                  <Text style={styles.filterTitle}>{filter.label}</Text>
                  <Text style={styles.filterDescription}>{filter.description}</Text>
                </View>
                {saving ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Switch
                    value={filter.enabled}
                    onValueChange={(value) => handleToggle(filter.id, value)}
                    trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                    thumbColor="#FFFFFF"
                    disabled={saving}
                  />
                )}
              </View>
            ))}
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filterContent: {
    flex: 1,
    marginRight: 16,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  filterDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
});
