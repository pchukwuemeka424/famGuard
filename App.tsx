import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { notificationService } from './src/services/notificationService';

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
import NotificationScreen from './src/screens/NotificationScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import EmergencyNotesScreen from './src/screens/EmergencyNotesScreen';
import LocationAccuracyScreen from './src/screens/LocationAccuracyScreen';
import LocationUpdateFrequencyScreen from './src/screens/LocationUpdateFrequencyScreen';
import SleepModeScreen from './src/screens/SleepModeScreen';
import NotificationFiltersScreen from './src/screens/NotificationFiltersScreen';
import LanguageRegionScreen from './src/screens/LanguageRegionScreen';
import UnitsScreen from './src/screens/UnitsScreen';
import BatterySavingScreen from './src/screens/BatterySavingScreen';
import HelpSupportScreen from './src/screens/HelpSupportScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './src/screens/TermsOfServiceScreen';
import LockedScreen from './src/screens/LockedScreen';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ConnectionProvider } from './src/context/ConnectionContext';
import { IncidentProvider } from './src/context/IncidentContext';
import { AppSettingProvider, useAppSetting } from './src/context/AppSettingContext';

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
  const { hideReportIncident, hideIncident } = useAppSetting();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Flow: Splash → Welcome → Login/Signup → Main App */}
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
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
            {!hideReportIncident && <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} />}
            {!hideIncident && <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />}
            <Stack.Screen name="Connections" component={ConnectionScreen} />
            <Stack.Screen name="MapView" component={MapScreen} />
            <Stack.Screen name="Notifications" component={NotificationScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="EmergencyNotes" component={EmergencyNotesScreen} />
            <Stack.Screen name="LocationAccuracy" component={LocationAccuracyScreen} />
            <Stack.Screen name="LocationUpdateFrequency" component={LocationUpdateFrequencyScreen} />
            <Stack.Screen name="SleepMode" component={SleepModeScreen} />
            <Stack.Screen name="NotificationFilters" component={NotificationFiltersScreen} />
            <Stack.Screen name="LanguageRegion" component={LanguageRegionScreen} />
            <Stack.Screen name="Units" component={UnitsScreen} />
            <Stack.Screen name="BatterySaving" component={BatterySavingScreen} />
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Configure notification handler for background
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Set up notification listeners for background/foreground handling
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Background notification received:', notification);
      // Handle background notification
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Background notification tapped:', response);
      const data = response.notification.request.content.data;
      
      // Handle navigation based on notification data
      // This will be handled by individual screens that set up their own listeners
    });

    return () => {
      // Use .remove() method instead of deprecated removeNotificationSubscription
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
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
    <SafeAreaProvider>
      <AuthProvider>
        <AppSettingProvider>
          <ConnectionProvider>
            <IncidentProvider>
              <StatusBar style="auto" />
              {showSplash ? (
                <SplashScreen onFinish={handleSplashFinish} />
              ) : (
                <AppContent onReady={handleAppReady} />
              )}
            </IncidentProvider>
          </ConnectionProvider>
        </AppSettingProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppContent({ onReady }: { onReady: () => void }) {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      onReady();
    }
  }, [loading, onReady]);

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

