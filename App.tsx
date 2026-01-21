// IMPORTANT: Import warning suppression FIRST before any other imports
// This ensures warnings are filtered before modules that might log them
import './src/utils/warningSuppression';

// Import background task to register it
import './src/tasks/locationBackgroundTask';

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, LogBox, AppState, AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { logger } from './src/utils/logger';
import { updateService } from './src/services/updateService';


// Screens
import SplashScreen from './src/screens/SplashScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import IncidentFeedScreen from './src/screens/IncidentFeedScreen';
import ReportIncidentScreen from './src/screens/ReportIncidentScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import IncidentDetailScreen from './src/screens/IncidentDetailScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';
import MapScreen from './src/screens/MapScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import EmergencyNotesScreen from './src/screens/EmergencyNotesScreen';
import LocationAccuracyScreen from './src/screens/LocationAccuracyScreen';
import LocationUpdateFrequencyScreen from './src/screens/LocationUpdateFrequencyScreen';
import SleepModeScreen from './src/screens/SleepModeScreen';
import LanguageRegionScreen from './src/screens/LanguageRegionScreen';
import UnitsScreen from './src/screens/UnitsScreen';
import BatterySavingScreen from './src/screens/BatterySavingScreen';
import HelpSupportScreen from './src/screens/HelpSupportScreen';
import UserManualScreen from './src/screens/UserManualScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './src/screens/TermsOfServiceScreen';
import LockedScreen from './src/screens/LockedScreen';
import TravelAdvisoryScreen from './src/screens/TravelAdvisoryScreen';
import CheckInScreen from './src/screens/CheckInScreen';
import CheckInSettingsScreen from './src/screens/CheckInSettingsScreen';
import OfflineMapsScreen from './src/screens/OfflineMapsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import UpdateScreen from './src/screens/UpdateScreen';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ConnectionProvider } from './src/context/ConnectionContext';
import { IncidentProvider } from './src/context/IncidentContext';
import { AppSettingProvider, useAppSetting } from './src/context/AppSettingContext';
import { TravelAdvisoryProvider } from './src/context/TravelAdvisoryContext';
import { CheckInProvider } from './src/context/CheckInContext';

// Types
import type { RootStackParamList, MainTabParamList } from './src/types';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

type TabBarIconProps = {
  focused: boolean;
  color: string;
  size: number;
};

type TabScreenOptionsProps = {
  route: RouteProp<MainTabParamList, keyof MainTabParamList>;
};

function MainTabs() {
  const { hideIncident } = useAppSetting();

  const getIconName = (routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap => {
    switch (routeName) {
      case 'Home':
        return focused ? 'map' : 'map-outline';
      case 'Incidents':
        return focused ? 'alert-circle' : 'alert-circle-outline';
      case 'Connections':
        return focused ? 'people' : 'people-outline';
      case 'Profile':
        return focused ? 'person' : 'person-outline';
      default:
        return 'help-outline';
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }: TabScreenOptionsProps) => ({
        tabBarIcon: ({ focused, color, size }: TabBarIconProps) => {
          const iconName = getIconName(route.name, focused);
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      {!hideIncident && <Tab.Screen name="Incidents" component={IncidentFeedScreen} />}
      <Tab.Screen name="Connections" component={ConnectionScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { isAuthenticated, loading, user } = useAuth();
  const { hideReportIncident, hideIncident, forceUpdateRequired, loading: appSettingLoading } = useAppSetting();
  const [showUpdate, setShowUpdate] = React.useState(false);

  // Check if update is required from app_setting table
  React.useEffect(() => {
    // If force_update_required is true, show update screen and lock the app
    if (forceUpdateRequired) {
      setShowUpdate(true);
      return;
    }

    // Otherwise, check for version-based update requirement
    const checkUpdateRequired = async () => {
      try {
        const updateRequired = await updateService.checkUpdateRequired();
        setShowUpdate(updateRequired);
      } catch (error) {
        logger.error('Error checking for app update:', error);
      }
    };
    
    // Only check if app settings are loaded
    if (!appSettingLoading) {
      checkUpdateRequired();
    }
  }, [forceUpdateRequired, appSettingLoading]);

  // Show update screen if update is required (this locks the app)
  if (showUpdate) {
    return <UpdateScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Flow: Splash → Welcome → Login/Signup → Main App */}
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="UserManual" component={UserManualScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : user?.isLocked ? (
          <>
            <Stack.Screen name="Locked" component={LockedScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Locked" component={LockedScreen} />
            <Stack.Screen name="Update" component={UpdateScreen} />
            {!hideReportIncident && <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} />}
            {!hideIncident && <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />}
            <Stack.Screen name="Connections" component={ConnectionScreen} />
            <Stack.Screen name="MapView" component={MapScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="EmergencyNotes" component={EmergencyNotesScreen} />
            <Stack.Screen name="LocationAccuracy" component={LocationAccuracyScreen} />
            <Stack.Screen name="LocationUpdateFrequency" component={LocationUpdateFrequencyScreen} />
            <Stack.Screen name="SleepMode" component={SleepModeScreen} />
            <Stack.Screen name="LanguageRegion" component={LanguageRegionScreen} />
            <Stack.Screen name="Units" component={UnitsScreen} />
            <Stack.Screen name="BatterySaving" component={BatterySavingScreen} />
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
            <Stack.Screen name="UserManual" component={UserManualScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
            <Stack.Screen name="TravelAdvisory" component={TravelAdvisoryScreen} />
            <Stack.Screen name="CheckIn" component={CheckInScreen} />
            <Stack.Screen name="CheckInSettings" component={CheckInSettingsScreen} />
            <Stack.Screen name="OfflineMaps" component={OfflineMapsScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // Global error handlers to catch unhandled errors
    let originalHandler: ((error: Error, isFatal?: boolean) => void) | undefined;
    let originalUnhandledRejection: ((event: any) => void) | undefined;

    try {
      // Set up global error handlers for React Native
      if (typeof ErrorUtils !== 'undefined') {
        originalHandler = ErrorUtils.getGlobalHandler();
        ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
          logger.error('Global error handler:', error, isFatal ? '(Fatal)' : '(Non-fatal)');
          // In production, you might want to send this to an error tracking service
          // Example: Sentry.captureException(error);
          if (originalHandler) {
            originalHandler(error, isFatal);
          }
        });
      }

      // Handle unhandled promise rejections
      if (typeof global !== 'undefined') {
        originalUnhandledRejection = (global as any).onunhandledrejection;
        (global as any).onunhandledrejection = (event: any) => {
          logger.error('Unhandled promise rejection:', event?.reason || event);
          // In production, you might want to send this to an error tracking service
          if (originalUnhandledRejection) {
            originalUnhandledRejection(event);
          }
        };
      }
    } catch (error) {
      logger.warn('Failed to set up global error handlers:', error);
    }

    // Cleanup
    return () => {
      try {
        if (typeof ErrorUtils !== 'undefined' && originalHandler) {
          ErrorUtils.setGlobalHandler(originalHandler);
        }
        if (typeof global !== 'undefined' && originalUnhandledRejection) {
          (global as any).onunhandledrejection = originalUnhandledRejection;
        }
      } catch (error) {
        logger.warn('Error cleaning up global handlers:', error);
      }
    };
  }, []);

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  const handleAppReady = () => {
    setAppReady(true);
  };

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AppSettingProvider>
            <ConnectionProvider>
              <IncidentProvider>
                <TravelAdvisoryProvider>
                  <CheckInProvider>
                    <StatusBar style="auto" />
                    {showSplash ? (
                      <SplashScreen onFinish={handleSplashFinish} />
                    ) : (
                      <AppContent onReady={handleAppReady} />
                    )}
                  </CheckInProvider>
                </TravelAdvisoryProvider>
              </IncidentProvider>
            </ConnectionProvider>
          </AppSettingProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function AppContent({ onReady }: { onReady: () => void }) {
  const { loading } = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!loading) {
      onReady();
    }
  }, [loading, onReady]);

  // Handle app state changes (foreground/background/closed)
  // NOTE: Location reinitialization is handled by HomeScreen and ConnectionContext
  // We only log the state change here to avoid duplicate location access that causes iOS crashes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      // App is going to background or inactive
      if (nextAppState.match(/inactive|background/)) {
        console.log('App going to background/inactive');
        // Background location task should continue running
        // Real-time subscriptions will pause but reconnect when app comes back
      }

      // App is coming to foreground (from background or after being closed)
      if (
        previousState.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App coming to foreground');
        // Location updates are handled by HomeScreen and ConnectionContext
        // to avoid duplicate location access that crashes iOS
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 12, fontSize: 16, color: '#8E8E93' }}>Loading...</Text>
      </View>
    );
  }

  return <AppNavigator />;
}

