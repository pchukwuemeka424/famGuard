import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';

type UserManualScreenNavigationProp = StackNavigationProp<RootStackParamList, 'UserManual'>;

interface UserManualScreenProps {
  navigation: UserManualScreenNavigationProp;
}

interface ManualSection {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  steps: {
    title: string;
    description: string;
    screenshot?: any;
  }[];
}

const manualSections: ManualSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'rocket-outline',
    description: 'Learn how to set up your account and get started with FamGuard',
    steps: [
      {
        title: '1. Create Your Account',
        description: 'Tap "Get Started" on the welcome screen. Enter your name, email, and create a secure password. Verify your email address to activate your account.',
        screenshot: require('../../assets/manual/create-account.jpeg'),
      },
      {
        title: '2. Grant Permissions',
        description: 'Allow location access and notifications when prompted. These permissions are essential for FamGuard to keep you and your family safe.',
      },
      {
        title: '3. Set Up Your Profile',
        description: 'Go to Profile tab and add your emergency contact information. This helps your connections reach you in case of an emergency.',
        screenshot: require('../../assets/manual/profilescreen.jpeg'),
      },
    ],
  },
  {
    id: 'connections',
    title: 'Managing Connections',
    icon: 'people-outline',
    description: 'Add and manage your trusted connections',
    steps: [
      {
        title: '1. Add a Connection',
        description: 'Navigate to the Connections screen from the Home tab. Tap the "+" button to add a new connection. Enter their email or phone number.',
        screenshot: require('../../assets/manual/connectionscreen.jpeg'),
      },
      {
        title: '2. Accept Connection Requests',
        description: 'When someone sends you a connection request, you\'ll receive a notification. Go to Connections screen to accept or decline.',
        screenshot: require('../../assets/manual/connectionscreen.jpeg'),
      },
      {
        title: '3. Manage Location Sharing',
        description: 'For each connection, you can toggle location sharing on/off. When enabled, they can see your live location on the map.',
        screenshot: require('../../assets/manual/connectionscreen.jpeg'),
      },
      {
        title: '4. View Connection on Map',
        description: 'Tap the "Map" button on any connection card to see their current location on an interactive map.',
        screenshot: require('../../assets/manual/map.jpeg'),
      },
    ],
  },
  {
    id: 'emergency',
    title: 'Emergency Features',
    icon: 'warning-outline',
    description: 'Learn how to use emergency alerts and safety features',
    steps: [
      {
        title: '1. Send Emergency Alert',
        description: 'On the Home screen, tap the large red "Emergency" button. This immediately sends your location to all your connections.',
        screenshot: require('../../assets/manual/emergencyButton.jpeg'),
      },
      {
        title: '2. App Lock Feature',
        description: 'After sending an emergency alert, the app locks automatically. Only a trusted connection can unlock it by confirming you\'re safe.',
      },
      {
        title: '3. Check-In Feature',
        description: 'Use the Check-In feature to let your connections know you\'re safe. Set up automatic check-ins in Settings.',
        screenshot: require('../../assets/manual/Check-in.jpeg'),
      },
    ],
  },
  {
    id: 'incidents',
    title: 'Incident Reports',
    icon: 'alert-circle-outline',
    description: 'Report and view safety incidents in your area',
    steps: [
      {
        title: '1. Report an Incident',
        description: 'Go to the Incidents tab and tap "Report Incident". Select the incident type, add a description, and submit. Reports can be anonymous.',
        screenshot: require('../../assets/manual/incidentReporting .jpeg'),
      },
      {
        title: '2. View Nearby Incidents',
        description: 'The Incident Feed shows incidents within 5 minutes to 1 hour of your location. Tap any incident to see details on the map.',
      },
      {
        title: '3. Proximity Alerts',
        description: 'You\'ll receive automatic notifications when you\'re near reported incidents. These alerts help you stay aware of your surroundings.',
        screenshot: require('../../assets/manual/notifcationscreen.jpeg'),
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: 'notifications-outline',
    description: 'Stay informed with safety alerts and updates',
    steps: [
      {
        title: '1. View Notifications',
        description: 'Tap the bell icon on the Home screen to see all your notifications. Unread notifications are highlighted.',
        screenshot: require('../../assets/manual/notifcationscreen.jpeg'),
      },
      {
        title: '2. Emergency Alerts',
        description: 'Emergency alerts show the full message and location. Tap to open the map and see the exact location.',
        screenshot: require('../../assets/manual/notifcationscreen.jpeg'),
      },
      {
        title: '3. Proximity Warnings',
        description: 'Proximity alerts show danger levels (DANGER, WARNING, ALERT) based on distance from incidents. Tap to view incident details.',
        screenshot: require('../../assets/manual/notifcationscreen.jpeg'),
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings & Preferences',
    icon: 'settings-outline',
    description: 'Customize your app settings and preferences',
    steps: [
      {
        title: '1. Location Settings',
        description: 'In Profile > Settings, adjust location accuracy, update frequency, and battery-saving options.',
        screenshot: require('../../assets/manual/profilescreen.jpeg'),
      },
      {
        title: '2. Notification Settings',
        description: 'Customize which notifications you receive. Enable or disable alerts for different types of events.',
        screenshot: require('../../assets/manual/profilescreen.jpeg'),
      },
      {
        title: '3. Privacy Settings',
        description: 'Control who can see your location. You can disable location sharing for specific connections.',
        screenshot: require('../../assets/manual/profilescreen.jpeg'),
      },
    ],
  },
  {
    id: 'maps',
    title: 'Using Maps',
    icon: 'map-outline',
    description: 'Navigate and view locations on the map',
    steps: [
      {
        title: '1. View Connection Location',
        description: 'Tap "Map" on any connection card to see their location. The map shows their current position and your distance.',
        screenshot: require('../../assets/manual/map.jpeg'),
      },
      {
        title: '2. Offline Maps',
        description: 'Download offline maps for areas you frequently visit. Go to Settings > Offline Maps to manage downloads.',
      },
      {
        title: '3. Emergency Location',
        description: 'When viewing an emergency alert, the map automatically centers on the emergency location with clear markers.',
        screenshot: require('../../assets/manual/map.jpeg'),
      },
    ],
  },
];

const { width } = Dimensions.get('window');

export default function UserManualScreen({ navigation }: UserManualScreenProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  const currentSection = manualSections[currentSectionIndex];
  const currentStep = currentSection.steps[currentStepIndex];
  const isFirstStep = currentSectionIndex === 0 && currentStepIndex === 0;
  const isLastStep = 
    currentSectionIndex === manualSections.length - 1 && 
    currentStepIndex === currentSection.steps.length - 1;

  const handleNext = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    if (currentStepIndex < currentSection.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else if (currentSectionIndex < manualSections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      setCurrentStepIndex(0);
    }
  };

  const handlePrevious = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    } else if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
      setCurrentStepIndex(manualSections[currentSectionIndex - 1].steps.length - 1);
    }
  };

  const handleSkip = () => {
    navigation.goBack();
  };

  const progress = ((currentSectionIndex + 1) / manualSections.length) * 100;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleSkip}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>User Manual</Text>
          <Text style={styles.headerSubtitle}>
            {currentSectionIndex + 1} of {manualSections.length}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Section Header */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconContainer}>
              <Ionicons name={currentSection.icon} size={32} color="#DC2626" />
            </View>
            <Text style={styles.sectionTitle}>{currentSection.title}</Text>
            <Text style={styles.sectionDescription}>{currentSection.description}</Text>
          </View>

          {/* Current Step */}
          <View style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{currentStepIndex + 1}</Text>
              </View>
              <Text style={styles.stepTitle}>{currentStep.title}</Text>
            </View>
            <Text style={styles.stepDescription}>{currentStep.description}</Text>
            
            {currentStep.screenshot && (
              <View style={styles.screenshotContainer}>
                <Image
                  source={currentStep.screenshot}
                  style={styles.screenshot}
                  resizeMode="contain"
                />
              </View>
            )}
          </View>

          {/* Step Indicators */}
          <View style={styles.stepIndicators}>
            {currentSection.steps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.stepIndicator,
                  index === currentStepIndex && styles.stepIndicatorActive,
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity
          style={[styles.navButton, styles.prevButton, isFirstStep && styles.navButtonDisabled]}
          onPress={handlePrevious}
          disabled={isFirstStep}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={isFirstStep ? '#9CA3AF' : '#1F2937'} />
          <Text style={[styles.navButtonText, isFirstStep && styles.navButtonTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.nextButton]}
          onPress={handleNext}
          disabled={isLastStep}
          activeOpacity={0.7}
        >
          <Text style={[styles.navButtonText, styles.nextButtonText]}>
            {isLastStep ? 'Done' : 'Next'}
          </Text>
          {!isLastStep && <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />}
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  skipButton: {
    padding: 4,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#DC2626',
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sectionIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  stepCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  stepDescription: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
    marginLeft: 48,
  },
  screenshotContainer: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  screenshot: {
    width: width - 80,
    height: (width - 80) * 1.77,
    maxHeight: 500,
  },
  stepIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  stepIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  stepIndicatorActive: {
    width: 24,
    backgroundColor: '#DC2626',
  },
  navigationContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  prevButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  nextButton: {
    backgroundColor: '#DC2626',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  navButtonTextDisabled: {
    color: '#9CA3AF',
  },
  nextButtonText: {
    color: '#FFFFFF',
  },
});
