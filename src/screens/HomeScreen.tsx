import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
  ScrollView,
  Modal,
  Animated,
} from 'react-native';
import * as ExpoLocation from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useConnection } from '../context/ConnectionContext';
import { useAuth } from '../context/AuthContext';
import { useAppSetting } from '../context/AppSettingContext';
import { locationService } from '../services/locationService';
import { incidentProximityService } from '../services/incidentProximityService';
import { supabase } from '../lib/supabase';
import type { MainTabParamList, RootStackParamList, Location } from '../types';
import type { FamilyMember } from '../types';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  StackNavigationProp<RootStackParamList>
>;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { connections, locationSharingEnabled, setLocationSharingEnabled, refreshConnections } = useConnection();
  const { user } = useAuth();
  const { hideReportIncident, sosLock } = useAppSetting();
  const [togglingLocation, setTogglingLocation] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<Location>({
    latitude: 37.78825,
    longitude: -122.4324,
  });
  const [locationLoading, setLocationLoading] = useState<boolean>(false);
  const locationUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<Location | null>(null);
  const locationWatchSubscriptionRef = useRef<ExpoLocation.LocationSubscription | null>(null);
  const locationHistoryChannelRef = useRef<any>(null);
  const [showEmergencySentAlert, setShowEmergencySentAlert] = useState<boolean>(false);
  const alertScale = useRef(new Animated.Value(0)).current;
  const alertOpacity = useRef(new Animated.Value(0)).current;
  const emergencyNavigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasNavigatedToLockedRef = useRef<boolean>(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);
  const notificationChannelRef = useRef<any>(null);

  // Removed automatic location loading on mount
  // Location will only be requested when user toggles location sharing ON

  const updateUserLocationDebounced = useCallback((newLocation: Location) => {
    if (locationUpdateTimeoutRef.current) {
      clearTimeout(locationUpdateTimeoutRef.current);
    }

    if (lastLocationRef.current) {
      const distance = calculateDistance(
        lastLocationRef.current.latitude,
        lastLocationRef.current.longitude,
        newLocation.latitude,
        newLocation.longitude
      );

      if (distance < 10) {
        return;
      }
    }

    locationUpdateTimeoutRef.current = setTimeout(() => {
      setUserLocation(newLocation);
      lastLocationRef.current = newLocation;
    }, 500);
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Real-time location tracking and history saving
  useEffect(() => {
    if (!user?.id || !locationSharingEnabled) {
      // Clean up if location sharing is disabled
      if (locationWatchSubscriptionRef.current) {
        locationWatchSubscriptionRef.current.remove();
        locationWatchSubscriptionRef.current = null;
      }
      if (locationHistoryChannelRef.current) {
        supabase.removeChannel(locationHistoryChannelRef.current);
        locationHistoryChannelRef.current = null;
      }
      return;
    }

    let isMounted = true;
    let locationUpdateInterval: NodeJS.Timeout | null = null;
    const ONE_HOUR_MS = 3600000; // 1 hour in milliseconds

    // Start real-time location tracking
    const startLocationTracking = async () => {
      try {
        const hasPermission = await locationService.checkPermissions();
        if (!hasPermission) {
          console.warn('Location permission not granted for real-time tracking');
          return;
        }

        // Get initial location and save to history (inserts if first time, updates if exists)
        // Permission already checked above, so pass true to allow location access
        const initialLocation = await locationService.getHighAccuracyLocation(true);
        if (initialLocation && isMounted) {
          // Will insert if no entry exists, or update if entry already exists
          await locationService.saveLocationToHistory(user.id, initialLocation);
          updateUserLocationDebounced(initialLocation);
          
          // Trigger incident proximity check after initial location is saved
          incidentProximityService.triggerCheck().catch((error) => {
            console.error('Error triggering incident proximity check:', error);
          });
          
          if (__DEV__) {
            console.log('Initial location saved to history');
          }
        }

        // Set up periodic update every 1 hour - always UPDATE the existing row
        locationUpdateInterval = setInterval(async () => {
          if (!isMounted || !locationSharingEnabled) {
            return;
          }

          try {
            // Permission already granted when location sharing was enabled
            const currentLocation = await locationService.getCurrentLocation(true);
            if (currentLocation) {
              // Will update existing row or insert if doesn't exist
              await locationService.saveLocationToHistory(user.id, currentLocation);
              updateUserLocationDebounced(currentLocation);
              
              // Trigger incident proximity check after location update
              incidentProximityService.triggerCheck().catch((error) => {
                console.error('Error triggering incident proximity check:', error);
              });
              
              if (__DEV__) {
                console.log('Location history updated (hourly update)');
              }
            }
          } catch (error) {
            console.error('Error in hourly location update:', error);
          }
        }, ONE_HOUR_MS);

        // Start watching location changes for UI updates (but don't save to history)
        const subscription = await ExpoLocation.watchPositionAsync(
          {
            accuracy: ExpoLocation.Accuracy.High,
            timeInterval: 60000, // Check every minute for UI updates
            distanceInterval: 10, // Update UI if moved 10 meters
          },
          async (location) => {
            if (!isMounted) return;

            const newLocation: Location = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };

            // Update UI location only (not saving to history here)
            updateUserLocationDebounced(newLocation);
          }
        );

        if (isMounted) {
          locationWatchSubscriptionRef.current = subscription;
        } else {
          subscription.remove();
        }
      } catch (error) {
        console.error('Error starting location tracking:', error);
      }
    };

    // Set up real-time subscription to location_history
    const setupLocationHistorySubscription = () => {
      // Remove existing channel if any
      if (locationHistoryChannelRef.current) {
        supabase.removeChannel(locationHistoryChannelRef.current);
        locationHistoryChannelRef.current = null;
      }

      const channel = supabase
        .channel(`location_history:${user.id}`, {
          config: {
            broadcast: { self: false },
          },
        })
        .on(
          'postgres_changes',
          {
            event: 'UPDATE', // Listen for UPDATE events (when location is updated)
            schema: 'public',
            table: 'location_history',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!isMounted) return;

            const updatedLocation = payload.new;
            if (updatedLocation && updatedLocation.latitude && updatedLocation.longitude) {
              const newLocation: Location = {
                latitude: updatedLocation.latitude,
                longitude: updatedLocation.longitude,
                address: updatedLocation.address || undefined,
              };

              // Update UI with the new location from database
              updateUserLocationDebounced(newLocation);

              if (__DEV__) {
                console.log('Location history updated via real-time:', {
                  latitude: newLocation.latitude,
                  longitude: newLocation.longitude,
                  address: newLocation.address,
                });
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT', // Listen for INSERT events (first time location is saved)
            schema: 'public',
            table: 'location_history',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!isMounted) return;

            const newEntry = payload.new;
            if (newEntry && newEntry.latitude && newEntry.longitude) {
              const newLocation: Location = {
                latitude: newEntry.latitude,
                longitude: newEntry.longitude,
                address: newEntry.address || undefined,
              };

              // Update UI with the new location from database
              updateUserLocationDebounced(newLocation);

              if (__DEV__) {
                console.log('Location history inserted via real-time:', {
                  latitude: newLocation.latitude,
                  longitude: newLocation.longitude,
                  address: newLocation.address,
                });
              }
            }
          }
        )
        .subscribe((status) => {
          if (__DEV__) {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Successfully subscribed to location_history real-time updates');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Error subscribing to location_history real-time updates');
            } else if (status === 'TIMED_OUT') {
              console.warn('⚠️ Location history subscription timed out');
            } else if (status === 'CLOSED') {
              console.log('Location history subscription closed');
            }
          }
        });

      locationHistoryChannelRef.current = channel;
    };

    startLocationTracking();
    setupLocationHistorySubscription();
    
    // Start periodic incident proximity checking
    incidentProximityService.startPeriodicChecking();

    return () => {
      isMounted = false;
      // Stop periodic incident proximity checking
      incidentProximityService.stopPeriodicChecking();
      if (locationWatchSubscriptionRef.current) {
        locationWatchSubscriptionRef.current.remove();
        locationWatchSubscriptionRef.current = null;
      }
      if (locationUpdateInterval) {
        clearInterval(locationUpdateInterval);
        locationUpdateInterval = null;
      }
      if (locationHistoryChannelRef.current) {
        supabase.removeChannel(locationHistoryChannelRef.current);
        locationHistoryChannelRef.current = null;
      }
    };
  }, [user?.id, locationSharingEnabled, updateUserLocationDebounced]);

  // Load unread notification count
  useEffect(() => {
    if (!user?.id) return;

    const loadUnreadCount = async () => {
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false);

        if (error) {
          console.error('Error loading unread notification count:', error);
          return;
        }

        setUnreadNotificationCount(count || 0);
      } catch (error) {
        console.error('Error loading unread notification count:', error);
      }
    };

    loadUnreadCount();

    // Set up real-time subscription for notifications
    const channel = supabase
      .channel(`notifications_count:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    notificationChannelRef.current = channel;

    return () => {
      if (notificationChannelRef.current) {
        supabase.removeChannel(notificationChannelRef.current);
      }
    };
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (locationUpdateTimeoutRef.current) {
        clearTimeout(locationUpdateTimeoutRef.current);
      }
      if (emergencyNavigationTimeoutRef.current) {
        clearTimeout(emergencyNavigationTimeoutRef.current);
        emergencyNavigationTimeoutRef.current = null;
      }
    };
  }, []);

  // Removed loadUserLocation - location is now only loaded when user enables location sharing

  const handleToggleLocationSharing = async (): Promise<void> => {
    try {
      setTogglingLocation(true);

      if (!locationSharingEnabled) {
        // Only request permission when user wants to enable location sharing
        const hasPermission = await locationService.checkPermissions();
        if (!hasPermission) {
          const permissionResult = await locationService.requestPermissions();
          if (!permissionResult.granted) {
            Alert.alert(
              'Permission Required',
              permissionResult.message || 'Location permission is required to share your location with connections.',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Open Settings', 
                  onPress: () => Linking.openSettings() 
                },
              ]
            );
            setTogglingLocation(false);
            return;
          }
        }

        // Get initial location only after permission is granted
        setLocationLoading(true);
        const initialLocation = await locationService.getHighAccuracyLocation(true); // Request permission if needed
        if (!initialLocation) {
          Alert.alert(
            'Location Error',
            'Unable to get your location. Please check your location settings.',
            [{ text: 'OK' }]
          );
          setTogglingLocation(false);
          setLocationLoading(false);
          return;
        }

        // Update UI with initial location
        updateUserLocationDebounced(initialLocation);
        lastLocationRef.current = initialLocation;
        setLocationLoading(false);

        // Save location to location_history table (inserts if first time, updates if exists)
        if (user?.id && initialLocation) {
          try {
            // Will insert if no entry exists, or update if entry already exists
            await locationService.saveLocationToHistory(user.id, initialLocation);
            console.log('Location saved to history table');
          } catch (error) {
            console.error('Error saving location to history:', error);
            // Don't block the toggle if history save fails
          }
        }
      }

      const newValue = !locationSharingEnabled;
      await setLocationSharingEnabled(newValue);
      await refreshConnections();

      if (newValue) {
        console.log('Location sharing enabled - connections can now see your location');
      } else {
        console.log('Location sharing disabled - you are now offline to connections');
        // Clear location when sharing is disabled
        setUserLocation({
          latitude: 37.78825,
          longitude: -122.4324,
        });
        lastLocationRef.current = null;
      }
    } catch (error) {
      console.error('Error toggling location sharing:', error);
      Alert.alert(
        'Error',
        'Failed to update location sharing. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setTogglingLocation(false);
      setLocationLoading(false);
    }
  };


  const handleOfflineEmergency = async (): Promise<void> => {
    try {
      // Check if there are any connections
      if (connections.length === 0) {
        Alert.alert(
          'No Connections',
          'You need to add connections before sending an offline emergency message.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Filter connections that have phone numbers
      const connectionsWithPhone = connections.filter(conn => conn.phone && conn.phone.trim() !== '');
      
      if (connectionsWithPhone.length === 0) {
        Alert.alert(
          'No Phone Numbers',
          'None of your connections have phone numbers saved. Please update your connections with phone numbers.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Get the last known location
      let locationToUse = lastLocationRef.current || userLocation;
      
      // Try to get current location if available, otherwise use last known
      // Don't request permission here - use last known location if permission not granted
      try {
        const currentLocation = await locationService.getCurrentLocation(false);
        if (currentLocation) {
          locationToUse = currentLocation;
        }
      } catch (error) {
        console.log('Using last known location for offline emergency');
      }

      // Format location message
      const userName = user?.name || 'Someone';
      const timestamp = new Date().toLocaleString();
      let message = `🚨 EMERGENCY ALERT - ${userName} needs help!\n\n`;
      
      if (locationToUse && locationToUse.latitude && locationToUse.longitude) {
        message += `📍 Location:\n`;
        if (locationToUse.address) {
          message += `${locationToUse.address}\n`;
        }
        message += `Coordinates: ${locationToUse.latitude.toFixed(6)}, ${locationToUse.longitude.toFixed(6)}\n`;
        message += `Google Maps: https://maps.google.com/?q=${locationToUse.latitude},${locationToUse.longitude}\n`;
      } else {
        message += `⚠️ Location unavailable\n`;
      }
      
      message += `\n🕐 Time: ${timestamp}\n`;
      message += `\nPlease send help immediately!`;

      // If only one connection with phone, send directly
      if (connectionsWithPhone.length === 1) {
        await sendSMSToConnection(connectionsWithPhone[0], message);
        return;
      }

      // Show selection dialog for multiple connections
      const connectionOptions = connectionsWithPhone.map(conn => ({
        text: conn.name,
        onPress: () => sendSMSToConnection(conn, message),
      }));

      Alert.alert(
        'Select Connection',
        'Choose which connection to send the emergency message to:',
        [
          { text: 'Cancel', style: 'cancel' },
          ...connectionOptions,
        ]
      );
    } catch (error) {
      console.error('Error in offline emergency:', error);
      Alert.alert(
        'Error',
        'An error occurred while preparing the emergency message. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const sendSMSToConnection = async (connection: FamilyMember, message: string): Promise<void> => {
    try {
      if (!connection.phone || connection.phone.trim() === '') {
        Alert.alert(
          'No Phone Number',
          `${connection.name} does not have a phone number saved.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // Clean phone number (remove spaces, dashes, etc.)
      const cleanPhone = connection.phone.replace(/[\s\-\(\)]/g, '');
      
      // Encode message for URL
      const encodedMessage = encodeURIComponent(message);
      
      // Create SMS URL with phone number and message
      // Format: sms:PHONE_NUMBER?body=MESSAGE (Android) or sms:PHONE_NUMBER&body=MESSAGE (iOS)
      const smsUrl = Platform.OS === 'ios' 
        ? `sms:${cleanPhone}&body=${encodedMessage}`
        : `sms:${cleanPhone}?body=${encodedMessage}`;
      
      const canOpen = await Linking.canOpenURL(smsUrl);
      let smsOpened = false;
      
      if (canOpen) {
        await Linking.openURL(smsUrl);
        smsOpened = true;
        Alert.alert(
          'Message Ready',
          `Emergency message is ready to send to ${connection.name}. Please review and send.`,
          [{ text: 'OK' }]
        );
      } else {
        // Fallback: try with just phone number
        const fallbackUrl = `sms:${cleanPhone}`;
        const canOpenFallback = await Linking.canOpenURL(fallbackUrl);
        if (canOpenFallback) {
          await Linking.openURL(fallbackUrl);
          smsOpened = true;
          Alert.alert(
            'SMS Opened',
            `SMS opened for ${connection.name}. Please copy and paste the following location information:\n\n${message}`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Error',
            `Unable to open SMS app for ${connection.name}. Please manually send your location.`,
            [{ text: 'OK' }]
          );
          return;
        }
      }

      // If SMS was successfully opened, lock the user and navigate to locked screen
      if (smsOpened && user?.id) {
        try {
          // Lock the user after offline emergency
          const { error: lockError } = await supabase
            .from('users')
            .update({ is_locked: true })
            .eq('id', user.id);

          if (lockError) {
            console.error('Error locking user:', lockError);
          } else {
            console.log('User locked after offline emergency');
          }

          // Reset navigation flag
          hasNavigatedToLockedRef.current = false;
          
          // Navigate to locked screen after a short delay
          setTimeout(() => {
            if (!hasNavigatedToLockedRef.current) {
              hasNavigatedToLockedRef.current = true;
              navigation.navigate('Locked');
            }
          }, 2000);
        } catch (error) {
          console.error('Error locking user after offline emergency:', error);
        }
      }
    } catch (error) {
      console.error('Error sending SMS to connection:', error);
      Alert.alert(
        'Error',
        `Failed to open SMS for ${connection.name}. Please try again or send manually.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleSOS = async (): Promise<void> => {
    try {
      // Reset navigation flag and clear any existing timeout
      hasNavigatedToLockedRef.current = false;
      if (emergencyNavigationTimeoutRef.current) {
        clearTimeout(emergencyNavigationTimeoutRef.current);
        emergencyNavigationTimeoutRef.current = null;
      }

      if (connections.length === 0) {
        Alert.alert(
          'No Connections',
          'You need to add connections before sending an emergency alert.',
          [{ text: 'OK' }]
        );
        return;
      }

      Alert.alert(
        'Send Emergency Alert?',
        `This will send an emergency alert to all ${connections.length} connection${connections.length > 1 ? 's' : ''}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Emergency Alert',
            style: 'destructive',
            onPress: async () => {
              try {
                // Request permission for emergency - this is user-initiated
                const currentLocation = await locationService.getCurrentLocation(true);
                if (!currentLocation) {
                  Alert.alert(
                    'Location Error',
                    'Unable to get your location. Emergency alert will be sent without location data.',
                    [{ text: 'OK' }]
                  );
                }

                const userName = user?.name || 'Someone';
                const timestamp = new Date();
                const locationData = currentLocation
                  ? {
                      latitude: currentLocation.latitude,
                      longitude: currentLocation.longitude,
                      address: currentLocation.address || undefined,
                    }
                  : null;

                let locationInfo = '';
                if (locationData) {
                  if (locationData.address) {
                    locationInfo = `\n📍 ${locationData.address}`;
                  }
                  locationInfo += `\n🌐 ${locationData.latitude.toFixed(6)}, ${locationData.longitude.toFixed(6)}`;
                  locationInfo += `\n🕐 ${timestamp.toLocaleTimeString()}`;
                }

                // Get all connected user IDs for push notifications
                const getConnectedUserIds = async (): Promise<string[]> => {
                  if (!user?.id) return [];
                  
                  try {
                    // Get connections where this user is the main user
                    const { data: connections1, error: error1 } = await supabase
                      .from('connections')
                      .select('connected_user_id')
                      .eq('user_id', user.id)
                      .eq('status', 'connected');

                    // Get connections where this user is the connected user
                    const { data: connections2, error: error2 } = await supabase
                      .from('connections')
                      .select('user_id')
                      .eq('connected_user_id', user.id)
                      .eq('status', 'connected');

                    if (error1 || error2) {
                      console.error('Error fetching connected users:', error1 || error2);
                      return [];
                    }

                    const userIds = new Set<string>();
                    (connections1 || []).forEach((conn) => {
                      if (conn.connected_user_id) userIds.add(conn.connected_user_id);
                    });
                    (connections2 || []).forEach((conn) => {
                      if (conn.user_id) userIds.add(conn.user_id);
                    });

                    return Array.from(userIds);
                  } catch (error) {
                    console.error('Error in getConnectedUserIds:', error);
                    return [];
                  }
                };

                // Send push notifications to all connected users
                const connectedUserIds = await getConnectedUserIds();
                
                console.log('📱 Sending push notifications to connected users:', {
                  count: connectedUserIds.length,
                  userIds: connectedUserIds,
                });
                
                if (connectedUserIds.length === 0) {
                  console.warn('⚠️ No connected users found - push notifications will not be sent');
                }
                
                // Create notifications for all connected users
                if (connectedUserIds.length > 0) {
                  try {
                    const notificationEntries = connectedUserIds.map((connectedUserId) => ({
                      user_id: connectedUserId,
                      title: '🚨 Emergency Alert',
                      body: `${userName} needs help!${locationInfo}`,
                      type: 'sos_alert',
                      data: {
                        type: 'sos_alert',
                        userId: user?.id,
                        userName: userName,
                        location: locationData,
                        timestamp: timestamp.toISOString(),
                      },
                      read: false,
                    }));

                    const { error: notificationError } = await supabase
                      .from('notifications')
                      .insert(notificationEntries);

                    if (notificationError) {
                      console.error('Error creating notifications:', notificationError);
                    } else {
                      console.log(`Created ${notificationEntries.length} notifications for emergency alert`);
                    }
                  } catch (error) {
                    console.error('Error creating notifications:', error);
                    // Don't fail the emergency alert if notification creation fails
                  }
                }
                
                if (connectedUserIds.length > 0) {
                  try {
                    // Get Supabase URL and anon key for direct function call
                    const getEnvVar = (key: string): string | undefined => {
                      if (process.env[key]) {
                        const value = process.env[key];
                        if (typeof value === 'string' && value.includes('${')) {
                          return undefined;
                        }
                        if (value && value.trim() !== '') {
                          return value;
                        }
                      }
                      if (Constants.expoConfig?.extra?.[key]) {
                        const value = Constants.expoConfig.extra[key];
                        if (typeof value === 'string' && value.includes('${')) {
                          return undefined;
                        }
                        return value;
                      }
                      return undefined;
                    };

                    // Call Edge Function to send push notifications
                    // Function is deployed with --no-verify-jwt so it doesn't require authentication
                    try {
                      const pushNotificationBody = {
                        user_ids: connectedUserIds,
                        title: '🚨 Emergency Alert',
                        body: `${userName} needs help!${locationInfo}`,
                        data: {
                          type: 'sos_alert',
                          userId: user?.id,
                          userName: userName,
                          location: locationData,
                          timestamp: timestamp.toISOString(),
                        },
                      };

                      // Use supabase.functions.invoke() - handles authentication automatically
                      const { data: pushResult, error: functionError } = await supabase.functions.invoke(
                        'send-push-notification',
                        {
                          body: pushNotificationBody,
                        }
                      );

                      if (functionError) {
                        console.error('❌ Error calling push notification function:', {
                          error: functionError,
                          message: functionError.message,
                          details: functionError.details,
                          status: functionError.status,
                        });
                        Alert.alert(
                          'Push Notification Error',
                          `Failed to send push notifications: ${functionError.message || 'Unknown error'}\n\nCheck Edge Function logs for details.`
                        );
                      } else if (pushResult) {
                        const sentCount = pushResult.sent || 0;
                        const failedCount = pushResult.failed || 0;
                        const total = pushResult.total || connectedUserIds.length;
                        const message = pushResult.message || '';
                        
                        console.log('📊 Push notification result:', {
                          sent: sentCount,
                          failed: failedCount,
                          total: total,
                          message: message,
                          requested_users: connectedUserIds.length,
                        });
                        
                        if (sentCount > 0) {
                          console.log(`✅ Push notifications sent: ${sentCount} successful, ${failedCount} failed`);
                        } else if (message) {
                          console.warn(`⚠️ Push notifications: ${message}`);
                          // Show alert if no tokens found
                          if (message.includes('No push tokens found')) {
                            Alert.alert(
                              'No Push Tokens',
                              `None of the ${total} connected users have push tokens registered.\n\nThey need to log in and grant notification permission.`
                            );
                          }
                        } else {
                          console.log('✅ Push notification request completed');
                        }
                      }
                    } catch (invokeError: any) {
                      console.error('Exception calling push notification function:', {
                        error: invokeError,
                        message: invokeError?.message,
                        stack: invokeError?.stack,
                      });
                    }
                  } catch (error: any) {
                    console.error('Error sending push notifications:', {
                      message: error?.message,
                      error: error,
                    });
                    // Don't fail the emergency alert if push notifications fail
                  }
                }

                // Emergency alerts sent
                const successful = connections.length;
                const failed = 0;

                if (successful > 0) {
                  // Start SOS location tracking (every 3 seconds, circular buffer of 5 rows)
                  if (user?.id) {
                    try {
                      await locationService.startSOSLocationTracking(user.id);
                      console.log('SOS location tracking started');
                    } catch (error) {
                      console.error('Error starting SOS location tracking:', error);
                      // Don't fail the alert if tracking fails to start
                    }
                  }

                  // Start emergency location tracking (every 1 hour)
                  if (user?.id) {
                    try {
                      await locationService.startEmergencyLocationTracking(user.id);
                      console.log('Emergency location tracking started');
                    } catch (error) {
                      console.error('Error starting emergency location tracking:', error);
                      // Don't fail the alert if tracking fails to start
                    }
                  }

                  // Lock the user after emergency alert
                  if (user?.id) {
                    try {
                      const { error: lockError } = await supabase
                        .from('users')
                        .update({ is_locked: true })
                        .eq('id', user.id);

                      if (lockError) {
                        console.error('Error locking user:', lockError);
                      } else {
                        console.log('User locked after emergency alert');
                      }
                    } catch (error) {
                      console.error('Error locking user:', error);
                    }
                  }

                  // Show modern confirmation alert
                  setShowEmergencySentAlert(true);
                  Animated.parallel([
                    Animated.spring(alertScale, {
                      toValue: 1,
                      useNativeDriver: true,
                      tension: 50,
                      friction: 7,
                    }),
                    Animated.timing(alertOpacity, {
                      toValue: 1,
                      duration: 300,
                      useNativeDriver: true,
                    }),
                  ]).start();

                  // Auto-dismiss and navigate after 4 seconds
                  emergencyNavigationTimeoutRef.current = setTimeout(() => {
                    // Prevent duplicate navigation
                    if (hasNavigatedToLockedRef.current) {
                      return;
                    }

                    Animated.parallel([
                      Animated.timing(alertScale, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                      }),
                      Animated.timing(alertOpacity, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                      }),
                    ]).start(() => {
                      setShowEmergencySentAlert(false);
                      // Navigate to locked screen only if not already navigated
                      if (!hasNavigatedToLockedRef.current) {
                        hasNavigatedToLockedRef.current = true;
                        navigation.navigate('Locked');
                      }
                    });
                  }, 4000);
                } else {
                  Alert.alert(
                    'Emergency Alert Failed',
                    'Unable to send emergency alerts. Please check your connection and try again.',
                    [{ text: 'OK' }]
                  );
                }
              } catch (error) {
                console.error('Error sending SOS alerts:', error);
                Alert.alert(
                  'Error',
                  'Failed to send emergency alerts. Please try again.',
                  [{ text: 'OK' }]
                );
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error in handleSOS:', error);
      Alert.alert(
        'Error',
        'An error occurred. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Modern Header */}
      <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle}>FamGuard</Text>
                <View style={[
                  styles.statusDot,
                  locationSharingEnabled && styles.statusDotActive
                ]} />
              </View>
              <View style={styles.headerSubtitleContainer}>
                <View style={styles.statusRow}>
                  <Ionicons 
                    name={locationSharingEnabled ? "eye" : "eye-off"} 
                  size={12} 
                  color={locationSharingEnabled ? "#10B981" : "#94A3B8"} 
                  />
                  <Text style={[
                    styles.headerSubtitle,
                    locationSharingEnabled && styles.headerSubtitleActive
                  ]}>
                    {locationSharingEnabled ? 'Visible to connections' : 'Hidden from connections'}
                  </Text>
                </View>
                <View style={styles.connectionsRow}>
                <Ionicons name="people" size={12} color="#6366F1" />
                  <Text style={styles.connectionsText}>
                    {connections.length} connection{connections.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={22} color="#1E293B" />
              {unreadNotificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView 
        style={styles.mainContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Status Overview Cards */}
        <View style={styles.statusGrid}>
          {/* Location Status Card */}
          <View style={[styles.statusCard, locationSharingEnabled && styles.statusCardActive]}>
            <View style={styles.statusCardTop}>
              <View style={[
                styles.statusCardIconContainer,
                locationSharingEnabled && styles.statusCardIconContainerActive
              ]}>
              <Ionicons 
                name={locationSharingEnabled ? "location" : "location-outline"} 
                  size={20} 
                  color={locationSharingEnabled ? "#10B981" : "#94A3B8"} 
              />
              </View>
              <TouchableOpacity
                style={[
                  styles.miniToggle,
                  locationSharingEnabled && styles.miniToggleActive,
                  togglingLocation && styles.miniToggleDisabled
                ]}
                onPress={handleToggleLocationSharing}
                disabled={togglingLocation}
                activeOpacity={0.8}
              >
                {togglingLocation ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={[
                    styles.miniToggleThumb,
                    locationSharingEnabled && styles.miniToggleThumbActive
                  ]} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.statusCardTitle}>Location</Text>
            <Text style={[styles.statusCardValue, locationSharingEnabled && styles.statusCardValueActive]}>
              {togglingLocation 
                ? 'Updating...' 
                : locationSharingEnabled 
                  ? 'Sharing' 
                  : 'Hidden'}
            </Text>
          </View>

          {/* Connections Status Card */}
          <TouchableOpacity 
            style={styles.statusCard}
            onPress={() => navigation.navigate('Connections')}
            activeOpacity={0.7}
          >
            <View style={styles.statusCardTop}>
              <View style={styles.statusCardIconContainer}>
                <Ionicons name="people-outline" size={20} color="#6366F1" />
              </View>
            </View>
            <Text style={styles.statusCardTitle}>Connections</Text>
            <Text style={styles.statusCardValue}>
              {connections.length}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Location Sharing Off Banner */}
        {!locationSharingEnabled && (
          <View style={styles.locationSharingBanner}>
            <View style={styles.locationSharingBannerContent}>
              <View style={styles.locationSharingBannerIcon}>
                <Ionicons name="location-outline" size={24} color="#F59E0B" />
              </View>
              <View style={styles.locationSharingBannerText}>
                <Text style={styles.locationSharingBannerTitle}>
                  Location Sharing is Off
                </Text>
                <Text style={styles.locationSharingBannerMessage}>
                  Turn on location sharing so your connections can see your location and respond to emergencies.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.locationSharingBannerButton}
              onPress={handleToggleLocationSharing}
              disabled={togglingLocation}
              activeOpacity={0.8}
            >
              {togglingLocation ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.locationSharingBannerButtonText}>
                  Turn On
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Emergency Actions Section */}
        <View style={styles.emergencySection}>
          <Text style={styles.sectionTitle}>Emergency</Text>
          
          <View style={styles.emergencyGrid}>
          <TouchableOpacity
            style={styles.emergencyButton}
            onPress={handleSOS}
              activeOpacity={0.85}
          >
            <View style={styles.emergencyButtonContent}>
              <View style={styles.emergencyIconContainer}>
                  <Ionicons name="warning" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.emergencyTextContainer}>
                  <Text style={styles.emergencyButtonTitle}>Emergency Alert</Text>
                <Text style={styles.emergencyButtonSubtitle}>
                    Alert {connections.length} connection{connections.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.offlineEmergencyButton}
            onPress={handleOfflineEmergency}
              activeOpacity={0.85}
          >
            <View style={styles.offlineEmergencyButtonContent}>
              <View style={styles.offlineEmergencyIconContainer}>
                  <Ionicons name="phone-portrait-outline" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.offlineEmergencyTextContainer}>
                  <Text style={styles.offlineEmergencyButtonTitle}>SMS Emergency</Text>
                <Text style={styles.offlineEmergencyButtonSubtitle}>
                    Send via text message
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions Grid */}
        {!hideReportIncident && (
          <View style={styles.quickActionsSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('ReportIncident')}
                activeOpacity={0.7}
              >
                <View style={styles.actionCardIcon}>
                  <Ionicons name="alert-circle" size={24} color="#EF4444" />
                </View>
                <Text style={styles.actionCardTitle}>Report Incident</Text>
                <Text style={styles.actionCardSubtitle}>Report safety concern</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => navigation.navigate('CheckIn')}
                activeOpacity={0.7}
              >
                <View style={styles.actionCardIcon}>
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                </View>
                <Text style={styles.actionCardTitle}>Safety Check-in</Text>
                <Text style={styles.actionCardSubtitle}>Let contacts know you're safe</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Modern Emergency Sent Alert Modal */}
      <Modal
        visible={showEmergencySentAlert}
        transparent={true}
        animationType="none"
        onRequestClose={() => {}}
      >
        <View style={styles.alertOverlay}>
          <Animated.View
            style={[
              styles.alertContainer,
              {
                transform: [{ scale: alertScale }],
                opacity: alertOpacity,
              },
            ]}
          >
            <View style={styles.alertIconContainer}>
              <View style={styles.alertIconBackground}>
                <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              </View>
            </View>
            <Text style={styles.alertTitle}>Emergency Sent</Text>
            <Text style={styles.alertMessage}>
              Your emergency alert has been sent successfully to your connections.
            </Text>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
    marginRight: 16,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  statusDotActive: {
    backgroundColor: '#10B981',
  },
  headerSubtitleContainer: {
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  headerSubtitleActive: {
    color: '#10B981',
    fontWeight: '600',
  },
  connectionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  connectionsText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 2,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#FAFBFC',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  statusGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 12,
  },
  statusCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
  },
  statusCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  statusCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusCardIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCardIconContainerActive: {
    backgroundColor: '#D1FAE5',
  },
  statusCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusCardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  statusCardValueActive: {
    color: '#10B981',
  },
  miniToggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#CBD5E1',
    justifyContent: 'center',
    padding: 2,
  },
  miniToggleActive: {
    backgroundColor: '#10B981',
  },
  miniToggleDisabled: {
    opacity: 0.5,
  },
  miniToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  miniToggleThumbActive: {
    alignSelf: 'flex-end',
  },
  emergencySection: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  emergencyGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  emergencyButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 20,
    overflow: 'hidden',
  },
  emergencyButtonContent: {
    padding: 16,
    alignItems: 'center',
  },
  emergencyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emergencyTextContainer: {
    alignItems: 'center',
  },
  emergencyButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  emergencyButtonSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
  offlineEmergencyButton: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 20,
    overflow: 'hidden',
  },
  offlineEmergencyButtonContent: {
    padding: 16,
    alignItems: 'center',
  },
  offlineEmergencyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  offlineEmergencyTextContainer: {
    alignItems: 'center',
  },
  offlineEmergencyButtonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  offlineEmergencyButtonSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
  quickActionsSection: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
  },
  actionCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 4,
  },
  actionCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  bottomSpacing: {
    height: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  alertIconContainer: {
    marginBottom: 24,
  },
  alertIconBackground: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  locationSharingBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
  },
  locationSharingBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  locationSharingBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  locationSharingBannerText: {
    flex: 1,
  },
  locationSharingBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  locationSharingBannerMessage: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  locationSharingBannerButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  locationSharingBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

