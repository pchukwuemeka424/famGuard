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

type UnitsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Units'>;

interface UnitsScreenProps {
  navigation: UnitsScreenNavigationProp;
}

type UnitSystem = 'metric' | 'imperial';

export default function UnitsScreen({ navigation }: UnitsScreenProps) {
  const { user } = useAuth();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadUnitSystem();
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

    const channelName = `units:${user.id}`;
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
          if (newData?.units) {
            setUnitSystem(newData.units as UnitSystem);
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const loadUnitSystem = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_settings')
        .select('units')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          await createDefaultSettings();
          setUnitSystem('metric');
        } else {
          console.error('Error loading unit system:', error);
          setUnitSystem('metric');
        }
      } else if (data) {
        setUnitSystem((data.units as UnitSystem) || 'metric');
      }
    } catch (error) {
      console.error('Error loading unit system:', error);
      setUnitSystem('metric');
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
          units: 'metric',
        });
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  const handleSelectUnit = async (system: UnitSystem) => {
    if (!user?.id || saving) return;

    try {
      setSaving(true);
      setUnitSystem(system);

      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            units: system,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving unit system:', error);
        Alert.alert('Error', 'Failed to save unit system setting. Please try again.');
        await loadUnitSystem();
      }
    } catch (error) {
      console.error('Error saving unit system:', error);
      Alert.alert('Error', 'Failed to save unit system setting. Please try again.');
      await loadUnitSystem();
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
        <Text style={styles.headerTitle}>Units</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Choose your preferred unit system for distances and measurements.
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.option, unitSystem === 'metric' && styles.optionSelected]}
              onPress={() => handleSelectUnit('metric')}
              disabled={saving}
            >
              <View style={styles.optionContent}>
                {saving && unitSystem === 'metric' ? (
                  <ActivityIndicator size="small" color="#007AFF" style={styles.radioButton} />
                ) : (
                  <Ionicons
                    name={unitSystem === 'metric' ? 'radio-button-on' : 'radio-button-off'}
                    size={24}
                    color={unitSystem === 'metric' ? '#007AFF' : '#8E8E93'}
                    style={styles.radioButton}
                  />
                )}
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>Metric (km, m)</Text>
                  <Text style={styles.optionSubtitle}>Kilometers and meters</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, unitSystem === 'imperial' && styles.optionSelected]}
              onPress={() => handleSelectUnit('imperial')}
              disabled={saving}
            >
              <View style={styles.optionContent}>
                {saving && unitSystem === 'imperial' ? (
                  <ActivityIndicator size="small" color="#007AFF" style={styles.radioButton} />
                ) : (
                  <Ionicons
                    name={unitSystem === 'imperial' ? 'radio-button-on' : 'radio-button-off'}
                    size={24}
                    color={unitSystem === 'imperial' ? '#007AFF' : '#8E8E93'}
                    style={styles.radioButton}
                  />
                )}
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>Imperial (miles, feet)</Text>
                  <Text style={styles.optionSubtitle}>Miles and feet</Text>
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
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
});
