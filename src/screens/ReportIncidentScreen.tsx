import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useIncidents } from '../context/IncidentContext';
import { useAuth } from '../context/AuthContext';
import { locationService } from '../services/locationService';
import { incidentCategories } from '../data/mockData';
import type { RootStackParamList, Location } from '../types';

type ReportIncidentScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ReportIncident'>;

interface ReportIncidentScreenProps {
  navigation: ReportIncidentScreenNavigationProp;
}

export default function ReportIncidentScreen({ navigation }: ReportIncidentScreenProps) {
  const { addIncident } = useIncidents();
  const { user } = useAuth();
  const [type, setType] = useState<string>('Robbery');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [isHappeningNow, setIsHappeningNow] = useState<boolean>(true);
  const [showTypePicker, setShowTypePicker] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [locationLoading, setLocationLoading] = useState<boolean>(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [lastAutoFilledType, setLastAutoFilledType] = useState<string>('');
  const [lastAutoFilledTitle, setLastAutoFilledTitle] = useState<string>('');
  const [lastAutoFilledDescription, setLastAutoFilledDescription] = useState<string>('');

  // Get current location when screen loads
  useEffect(() => {
    loadCurrentLocation();
  }, []);

  // Auto-fill title and description when type or location changes
  useEffect(() => {
    if (type && currentLocation) {
      autoFillIncidentDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, currentLocation]);

  // Function to generate auto-filled title and description based on incident type and location
  const autoFillIncidentDetails = (): void => {
    if (!type || !currentLocation) return;

    const fullAddress = currentLocation.address || 'this location';

    // Generate title based on incident type (NO address in title)
    const titles: Record<string, string> = {
      'Robbery': `${type} Reported`,
      'Kidnapping': 'Suspicious Activity Reported',
      'Accident': 'Traffic Accident Reported',
      'Fire': `${type} Reported`,
      'Protest': 'Protest Gathering Reported',
      'Assault': `${type} Incident Reported`,
      'Theft': `${type} Reported`,
      'Other': 'Incident Reported',
    };

    // Generate description based on incident type (WITH full address)
    const descriptions: Record<string, string> = {
      'Robbery': `A ${type.toLowerCase()} incident has been reported.\n\nLocation: ${fullAddress}\n\nPlease exercise caution and avoid the area if possible. Authorities have been notified.`,
      'Kidnapping': `Suspicious activity related to ${type.toLowerCase()} has been reported.\n\nLocation: ${fullAddress}\n\nPlease remain vigilant and report any suspicious behavior to authorities immediately.`,
      'Accident': `A traffic accident has been reported.\n\nLocation: ${fullAddress}\n\nEmergency services are responding. Please expect delays and use alternate routes if possible.`,
      'Fire': `A ${type.toLowerCase()} has been reported.\n\nLocation: ${fullAddress}\n\nFire department is responding. Please avoid the area and follow instructions from emergency personnel.`,
      'Protest': `A protest gathering has been reported.\n\nLocation: ${fullAddress}\n\nPlease expect traffic delays and exercise caution if in the area.`,
      'Assault': `An ${type.toLowerCase()} incident has been reported.\n\nLocation: ${fullAddress}\n\nPlease avoid the area and report any relevant information to authorities.`,
      'Theft': `A ${type.toLowerCase()} has been reported.\n\nLocation: ${fullAddress}\n\nPlease secure your belongings and report any suspicious activity.`,
      'Other': `An incident has been reported.\n\nLocation: ${fullAddress}\n\nPlease exercise caution in the area.`,
    };

    const newTitle = titles[type] || 'Incident Reported';
    const newDescription = descriptions[type] || `An incident has been reported.\n\nLocation: ${fullAddress}\n\nPlease exercise caution in the area.`;

    // Check if type has changed
    const typeChanged = lastAutoFilledType !== type && lastAutoFilledType !== '';
    
    // Determine if we should update the fields:
    // 1. If fields are empty, always auto-fill
    // 2. If type changed and current text matches previous auto-filled text, update it (user hasn't edited)
    const titleIsEmpty = !title.trim();
    const titleMatchesPrevious = title.trim() === lastAutoFilledTitle;
    const shouldUpdateTitle = titleIsEmpty || (typeChanged && titleMatchesPrevious);
    
    const descriptionIsEmpty = !description.trim();
    const descriptionMatchesPrevious = description.trim() === lastAutoFilledDescription;
    const shouldUpdateDescription = descriptionIsEmpty || (typeChanged && descriptionMatchesPrevious);

    // Update title if needed
    if (shouldUpdateTitle) {
      setTitle(newTitle);
      setLastAutoFilledTitle(newTitle);
    }

    // Update description if needed
    if (shouldUpdateDescription) {
      setDescription(newDescription);
      setLastAutoFilledDescription(newDescription);
    }

    // Track the type for future comparisons (always track on first load or when type changes)
    if (lastAutoFilledType === '' || typeChanged) {
      setLastAutoFilledType(type);
    }
  };

  const loadCurrentLocation = async (): Promise<void> => {
    try {
      setLocationLoading(true);
      setLocationError(null);
      
      // Request permissions first
      const hasPermission = await locationService.checkPermissions();
      if (!hasPermission) {
        const permissionResult = await locationService.requestPermissions();
        if (!permissionResult.granted) {
          setLocationError(permissionResult.message || 'Location permission denied. Please enable location access in settings.');
          setLocationLoading(false);
          return;
        }
      }

      // Get high accuracy location with address
      const location = await locationService.getHighAccuracyLocation();
      
      if (location) {
        setCurrentLocation(location);
        // Update IncidentContext with the new location
        // This ensures the location is available for other parts of the app
      } else {
        setLocationError('Unable to get your location. Please try again.');
      }
    } catch (error: any) {
      console.error('Error loading location:', error);
      setLocationError(error.message || 'Failed to get location. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (!currentLocation) {
      Alert.alert('Error', 'Location is required. Please wait for location to load or try refreshing.');
      return;
    }

    // Validate location coordinates
    if (typeof currentLocation.latitude !== 'number' || typeof currentLocation.longitude !== 'number') {
      Alert.alert('Error', 'Invalid location coordinates. Please refresh your location.');
      return;
    }

    // Validate latitude range (-90 to 90)
    if (currentLocation.latitude < -90 || currentLocation.latitude > 90) {
      Alert.alert('Error', 'Invalid latitude. Please refresh your location.');
      return;
    }

    // Validate longitude range (-180 to 180)
    if (currentLocation.longitude < -180 || currentLocation.longitude > 180) {
      Alert.alert('Error', 'Invalid longitude. Please refresh your location.');
      return;
    }

    try {
      const incident = {
        type,
        title: title.trim(),
        description: description.trim(),
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          address: currentLocation.address || undefined,
        },
        reporter: {
          name: isAnonymous ? 'Anonymous' : (user?.name || 'User'),
          isAnonymous,
        },
        category: type,
      };

      // Log location data being sent
      console.log('Submitting incident with location:', {
        latitude: incident.location.latitude,
        longitude: incident.location.longitude,
        address: incident.location.address,
      });

      await addIncident(incident);
      Alert.alert('Success', 'Incident reported successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Error submitting incident:', error);
      Alert.alert('Error', error.message || 'Failed to report incident. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Modern Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <View style={styles.backButtonContainer}>
              <Ionicons name="close" size={22} color="#1C1C1E" />
            </View>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Report Incident</Text>
            <Text style={styles.headerSubtitle}>Help keep your community safe</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Incident Type Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="alert-circle" size={20} color="#007AFF" />
              <Text style={styles.cardTitle}>Type of Incident</Text>
              <Text style={styles.required}>*</Text>
            </View>
            <TouchableOpacity
              style={styles.pickerContainer}
              onPress={() => setShowTypePicker(!showTypePicker)}
              activeOpacity={0.7}
            >
              <View style={styles.pickerContent}>
                <Text style={styles.pickerText}>{type}</Text>
                <Ionicons 
                  name={showTypePicker ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color="#6B7280" 
                />
              </View>
            </TouchableOpacity>
            {showTypePicker && (
              <View style={styles.pickerOptions}>
                {incidentCategories.map((category, index) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.pickerOption,
                      index === incidentCategories.length - 1 && styles.pickerOptionLast,
                      type === category && styles.pickerOptionActive,
                    ]}
                    onPress={() => {
                      setType(category);
                      setShowTypePicker(false);
                      // Auto-fill will be triggered by useEffect when type changes
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        type === category && styles.pickerOptionTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                    {type === category && (
                      <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Title Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="text" size={20} color="#007AFF" />
              <Text style={styles.cardTitle}>Title</Text>
              <Text style={styles.required}>*</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Brief title for the incident"
              placeholderTextColor="#9CA3AF"
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
            <Text style={styles.charCount}>{title.length}/100</Text>
          </View>

          {/* Description Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={20} color="#007AFF" />
              <Text style={styles.cardTitle}>Description</Text>
              <Text style={styles.required}>*</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe what happened, when it occurred, and any relevant details..."
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          {/* Location Card */}
          <View style={styles.card}>
            <View style={styles.locationHeader}>
              <View style={styles.cardHeader}>
                <Ionicons name="location" size={20} color="#007AFF" />
                <Text style={styles.cardTitle}>Location</Text>
                <Text style={styles.required}>*</Text>
              </View>
              <TouchableOpacity
                onPress={loadCurrentLocation}
                disabled={locationLoading}
                style={styles.refreshButton}
                activeOpacity={0.7}
              >
                <View style={styles.refreshButtonContainer}>
                  {locationLoading ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <Ionicons name="refresh" size={18} color="#007AFF" />
                  )}
                </View>
              </TouchableOpacity>
            </View>
            
            {locationLoading ? (
              <View style={styles.locationContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.locationText}>Getting your location...</Text>
              </View>
            ) : locationError ? (
              <View style={[styles.locationContainer, styles.locationError]}>
                <View style={styles.errorIconContainer}>
                  <Ionicons name="warning" size={20} color="#EF4444" />
                </View>
                <View style={styles.locationErrorContent}>
                  <Text style={styles.locationErrorText}>{locationError}</Text>
                  <TouchableOpacity 
                    onPress={loadCurrentLocation} 
                    style={styles.retryButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : currentLocation ? (
              <View style={[styles.locationContainer, styles.locationSuccess]}>
                <View style={styles.successIconContainer}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                </View>
                <View style={styles.locationInfo}>
                  {currentLocation.address ? (
                    <>
                      <Text style={styles.locationText}>{currentLocation.address}</Text>
                      <Text style={styles.locationCoordinates}>
                        {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.locationText}>
                      {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.locationContainer}>
                <Ionicons name="location-outline" size={20} color="#9CA3AF" />
                <Text style={styles.locationText}>No location available</Text>
              </View>
            )}
            
            <View style={styles.locationHint}>
              <Ionicons name="information-circle" size={14} color="#6B7280" />
              <Text style={styles.locationHintText}>
                Only users nearby (within 5 km) will see this report
              </Text>
            </View>
          </View>

          {/* Time Selection Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="time" size={20} color="#007AFF" />
              <Text style={styles.cardTitle}>When did this happen?</Text>
            </View>
            <View style={styles.timeOptions}>
              <TouchableOpacity
                style={[
                  styles.timeOption,
                  isHappeningNow && styles.timeOptionActive,
                ]}
                onPress={() => setIsHappeningNow(true)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.timeOptionIcon,
                  isHappeningNow && styles.timeOptionIconActive,
                ]}>
                  <Ionicons
                    name="time"
                    size={20}
                    color={isHappeningNow ? '#007AFF' : '#6B7280'}
                  />
                </View>
                <Text
                  style={[
                    styles.timeOptionText,
                    isHappeningNow && styles.timeOptionTextActive,
                  ]}
                >
                  Happening Now
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.timeOption,
                  !isHappeningNow && styles.timeOptionActive,
                ]}
                onPress={() => setIsHappeningNow(false)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.timeOptionIcon,
                  !isHappeningNow && styles.timeOptionIconActive,
                ]}>
                  <Ionicons
                    name="calendar"
                    size={20}
                    color={!isHappeningNow ? '#007AFF' : '#6B7280'}
                  />
                </View>
                <Text
                  style={[
                    styles.timeOptionText,
                    !isHappeningNow && styles.timeOptionTextActive,
                  ]}
                >
                  Happened Earlier
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Anonymous Toggle Card */}
          <View style={styles.card}>
            <View style={styles.toggleContainer}>
              <View style={styles.toggleInfo}>
                <View style={styles.toggleHeader}>
                  <Ionicons name="eye-off" size={18} color="#007AFF" />
                  <Text style={styles.toggleLabel}>Anonymous Reporting</Text>
                </View>
                <Text style={styles.toggleSubtext}>
                  Hide your name from public view (still stored internally for safety)
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, isAnonymous && styles.toggleActive]}
                onPress={() => setIsAnonymous(!isAnonymous)}
                activeOpacity={0.8}
              >
                <View style={[styles.toggleThumb, isAnonymous && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="information-circle" size={22} color="#007AFF" />
            </View>
            <Text style={styles.infoText}>
              Your report helps keep the community safe. False reports may result in account suspension.
            </Text>
          </View>
        </ScrollView>

        {/* Footer with Submit Button */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.submitButton} 
            onPress={handleSubmit}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" style={styles.submitIcon} />
            <Text style={styles.submitButtonText}>Submit Report</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  keyboardView: {
    flex: 1,
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
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  placeholder: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  required: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  pickerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  pickerText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  pickerOptions: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    maxHeight: 240,
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionLast: {
    borderBottomWidth: 0,
  },
  pickerOptionActive: {
    backgroundColor: '#F0F9FF',
  },
  pickerOptionText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  pickerOptionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
      },
    }),
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'right',
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    minHeight: 64,
    backgroundColor: '#F9FAFB',
  },
  locationSuccess: {
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  locationError: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  successIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    marginBottom: 4,
  },
  locationCoordinates: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  locationErrorContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  locationErrorText: {
    fontSize: 14,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#EF4444',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  locationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
  },
  locationHintText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
    lineHeight: 16,
  },
  timeOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  timeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  timeOptionActive: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F9FF',
  },
  timeOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeOptionIconActive: {
    backgroundColor: '#DBEAFE',
  },
  timeOptionText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  timeOptionTextActive: {
    color: '#007AFF',
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  toggleSubtext: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  toggle: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    padding: 3,
  },
  toggleActive: {
    backgroundColor: '#10B981',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 12,
    marginBottom: 8,
  },
  infoIconContainer: {
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
    fontWeight: '500',
  },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 24,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  submitButton: {
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
  submitIcon: {
    marginRight: -4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

