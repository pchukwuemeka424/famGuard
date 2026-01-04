import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useCheckIn } from '../context/CheckInContext';
import type { RootStackParamList, CheckInSettings } from '../types';

type CheckInSettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CheckInSettings'>;

interface CheckInSettingsScreenProps {
  navigation: CheckInSettingsScreenNavigationProp;
}

export default function CheckInSettingsScreen({ navigation }: CheckInSettingsScreenProps) {
  const { settings, loading, updateSettings, loadSettings } = useCheckIn();
  const [localSettings, setLocalSettings] = useState<Partial<CheckInSettings>>({});
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        enabled: settings.enabled,
        checkInIntervalMinutes: settings.checkInIntervalMinutes,
        autoCheckInEnabled: settings.autoCheckInEnabled,
        autoCheckInDuringTravel: settings.autoCheckInDuringTravel,
        travelSpeedThresholdKmh: settings.travelSpeedThresholdKmh,
        missedCheckInAlertMinutes: settings.missedCheckInAlertMinutes,
      });
    }
  }, [settings]);

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true);
      const success = await updateSettings(localSettings);
      if (success) {
        Alert.alert('Success', 'Settings saved successfully.');
        navigation.goBack();
      } else {
        Alert.alert('Error', 'Failed to save settings. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.headerTitle}>Check-in Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Enable Check-ins */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Enable Check-ins</Text>
              <Text style={styles.settingDescription}>
                Allow periodic safety check-ins
              </Text>
            </View>
            <Switch
              value={localSettings.enabled ?? false}
              onValueChange={(value) => setLocalSettings({ ...localSettings, enabled: value })}
              trackColor={{ false: '#D1D5DB', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Check-in Interval */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Check-in Interval</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Interval (minutes)</Text>
            <TextInput
              style={styles.input}
              value={localSettings.checkInIntervalMinutes?.toString() || '60'}
              onChangeText={(text) => {
                const value = parseInt(text, 10);
                if (!isNaN(value) && value > 0) {
                  setLocalSettings({ ...localSettings, checkInIntervalMinutes: value });
                }
              }}
              keyboardType="number-pad"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.inputHint}>
              How often you want to check in (default: 60 minutes)
            </Text>
          </View>
        </View>

        {/* Automatic Check-ins */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Automatic Check-ins</Text>
              <Text style={styles.settingDescription}>
                Automatically check in at scheduled intervals
              </Text>
            </View>
            <Switch
              value={localSettings.autoCheckInEnabled ?? false}
              onValueChange={(value) =>
                setLocalSettings({ ...localSettings, autoCheckInEnabled: value })
              }
              trackColor={{ false: '#D1D5DB', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Auto Check-in During Travel */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Auto Check-in During Travel</Text>
              <Text style={styles.settingDescription}>
                Automatically check in when traveling
              </Text>
            </View>
            <Switch
              value={localSettings.autoCheckInDuringTravel ?? false}
              onValueChange={(value) =>
                setLocalSettings({ ...localSettings, autoCheckInDuringTravel: value })
              }
              trackColor={{ false: '#D1D5DB', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Travel Speed Threshold */}
        {localSettings.autoCheckInDuringTravel && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Travel Detection</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Speed Threshold (km/h)</Text>
              <TextInput
                style={styles.input}
                value={localSettings.travelSpeedThresholdKmh?.toString() || '20'}
                onChangeText={(text) => {
                  const value = parseFloat(text);
                  if (!isNaN(value) && value >= 0) {
                    setLocalSettings({ ...localSettings, travelSpeedThresholdKmh: value });
                  }
                }}
                keyboardType="decimal-pad"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.inputHint}>
                Consider traveling if speed exceeds this threshold (default: 20 km/h)
              </Text>
            </View>
          </View>
        )}

        {/* Missed Check-in Alert */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Missed Check-in Alerts</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Alert After (minutes)</Text>
            <TextInput
              style={styles.input}
              value={localSettings.missedCheckInAlertMinutes?.toString() || '30'}
              onChangeText={(text) => {
                const value = parseInt(text, 10);
                if (!isNaN(value) && value > 0) {
                  setLocalSettings({ ...localSettings, missedCheckInAlertMinutes: value });
                }
              }}
              keyboardType="number-pad"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.inputHint}>
              Alert emergency contacts if check-in is missed by this duration (default: 30 minutes)
            </Text>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.section}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color="#007AFF" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>About Check-ins</Text>
              <Text style={styles.infoText}>
                Check-ins help your emergency contacts know you're safe. You can manually check in
                anytime or set up automatic check-ins.
              </Text>
              <Text style={styles.infoText}>
                If you miss a scheduled check-in, your emergency contacts will be notified.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
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
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  inputHint: {
    fontSize: 12,
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
    marginBottom: 8,
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});




