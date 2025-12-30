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
import * as Notifications from 'expo-notifications';
import * as ExpoLocation from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useConnection } from '../context/ConnectionContext';
import { useAuth } from '../context/AuthContext';
import { useAppSetting } from '../context/AppSettingContext';
import { locationService } from '../services/locationService';
import { notificationService } from '../services/notificationService';
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
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [togglingLocation, setTogglingLocation] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<Location>({
    latitude: 37.78825,
    longitude: -122.4324,
  });
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [locationLoading, setLocationLoading] = useState<boolean>(true);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const locationUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<Location | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(0.002);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);
  const notificationChannelRef = useRef<any>(null);
  const isSubscriptionActiveRef = useRef<boolean>(false);
  const locationWatchSubscriptionRef = useRef<ExpoLocation.LocationSubscription | null>(null);
  const locationHistoryChannelRef = useRef<any>(null);
  const [showEmergencySentAlert, setShowEmergencySentAlert] = useState<boolean>(false);
  const alertScale = useRef(new Animated.Value(0)).current;
  const alertOpacity = useRef(new Animated.Value(0)).current;
  const emergencyNavigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasNavigatedToLockedRef = useRef<boolean>(false);

  useEffect(() => {
    loadUserLocation();
  }, []);

  const loadUnreadCount = useCallback(async (hardRefresh: boolean = false) => {
    if (!user?.id) return;

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

      const newCount = count || 0;
      
      // If subscription is active and count is 0, ensure we show 0
      if (isSubscriptionActiveRef.current && newCount === 0) {
        setUnreadNotificationCount(0);
      } else {
        setUnreadNotificationCount(newCount);
      }

      if (hardRefresh) {
        console.log('Hard refresh: Unread notification count updated to', newCount);
      }
    } catch (error) {
      console.error('Error in loadUnreadCount:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    // Initial load with hard refresh
    loadUnreadCount(true);

    // Set up real-time subscription
    const channelName = `notification-count:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Realtime notification change detected:', payload.eventType);
          // Reload count when any change occurs
          loadUnreadCount();
        }
      )
      .subscribe((status) => {
        console.log('Notification subscription status:', status);
        isSubscriptionActiveRef.current = status === 'SUBSCRIBED';
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to notification real-time updates');
          // When subscription is active, refresh count to ensure accuracy
          loadUnreadCount(true);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to notification real-time updates');
          isSubscriptionActiveRef.current = false;
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Notification subscription timed out');
          isSubscriptionActiveRef.current = false;
        } else if (status === 'CLOSED') {
          console.log('Notification subscription closed');
          isSubscriptionActiveRef.current = false;
        }
      });

    notificationChannelRef.current = channel;

    // Listen for push notifications
    const subscription = Notifications.addNotificationReceivedListener(() => {
      console.log('Push notification received, refreshing count');
      loadUnreadCount(true);
    });

    return () => {
      subscription.remove();
      if (notificationChannelRef.current) {
        supabase.removeChannel(notificationChannelRef.current);
        notificationChannelRef.current = null;
      }
      isSubscriptionActiveRef.current = false;
    };
  }, [user?.id, loadUnreadCount]);

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
        const initialLocation = await locationService.getHighAccuracyLocation();
        if (initialLocation && isMounted) {
          // Will insert if no entry exists, or update if entry already exists
          await locationService.saveLocationToHistory(user.id, initialLocation);
          updateUserLocationDebounced(initialLocation);
          
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
            const currentLocation = await locationService.getCurrentLocation();
            if (currentLocation) {
              // Will update existing row or insert if doesn't exist
              await locationService.saveLocationToHistory(user.id, currentLocation);
              updateUserLocationDebounced(currentLocation);
              
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

    return () => {
      isMounted = false;
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

  const loadUserLocation = async (): Promise<void> => {
    try {
      setLocationLoading(true);
      const location = await locationService.getCurrentLocation();
      
      if (location) {
        updateUserLocationDebounced(location);
        
        if (!mapRegion || refreshing) {
          const streetLevelZoom = 0.002;
          const initialRegion = {
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: streetLevelZoom,
            longitudeDelta: streetLevelZoom,
          };
          setMapRegion(initialRegion);
          setCurrentZoom(streetLevelZoom);
          
          if (Platform.OS === 'android' && mapRef.current && mapReady) {
            setTimeout(() => {
              if (mapRef.current) {
                mapRef.current.animateToRegion(initialRegion, 500);
              }
            }, 300);
          }
        }
        lastLocationRef.current = location;
      }
    } catch (error) {
      console.error('Error loading user location:', error);
      Alert.alert(
        'Location Error',
        'Unable to get your location. Please enable location permissions in settings.',
        [
          { text: 'OK' },
          { text: 'Settings', onPress: () => Linking.openSettings() },
        ]
      );
    } finally {
      setLocationLoading(false);
    }
  };

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await loadUserLocation();
      // Hard refresh notification count
      await loadUnreadCount(true);
    } finally {
      setRefreshing(false);
    }
  };

  // Hard refresh notifications when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadUnreadCount(true);
      }
    }, [user?.id, loadUnreadCount])
  );

  const handleToggleLocationSharing = async (): Promise<void> => {
    try {
      setTogglingLocation(true);

      if (!locationSharingEnabled) {
        const hasPermission = await locationService.checkPermissions();
        if (!hasPermission) {
          const granted = await locationService.requestPermissions();
          if (!granted) {
            Alert.alert(
              'Permission Required',
              'Location permission is required to share your location with connections.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Settings', onPress: () => Linking.openSettings() },
              ]
            );
            setTogglingLocation(false);
            return;
          }
        }

        const initialLocation = await locationService.getHighAccuracyLocation();
        if (!initialLocation) {
          Alert.alert(
            'Location Error',
            'Unable to get your location. Please check your location settings.',
            [{ text: 'OK' }]
          );
          setTogglingLocation(false);
          return;
        }

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
    }
  };

  const handleDirections = (member: FamilyMember): void => {
    navigation.navigate('MapView', {
      location: member.location,
      title: member.name,
      showUserLocation: true,
      userId: member.userId,
    });
  };

  const handleMarkerPress = (member: FamilyMember): void => {
    Alert.alert(
      member.name,
      `${member.relationship}\n${(member.isOnline && member.shareLocation) ? 'Online' : !member.shareLocation ? 'Offline' : 'Last seen: ' + new Date(member.lastSeen).toLocaleTimeString()}\nBattery: ${member.batteryLevel}%`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Directions', onPress: () => handleDirections(member) },
      ]
    );
  };

  const handleZoomIn = (): void => {
    if (mapRef.current && mapRegion) {
      const newZoom = Math.max(currentZoom * 0.5, 0.001);
      setCurrentZoom(newZoom);
      mapRef.current.animateToRegion({
        ...mapRegion,
        latitudeDelta: newZoom,
        longitudeDelta: newZoom,
      }, 300);
    }
  };

  const handleZoomOut = (): void => {
    if (mapRef.current && mapRegion) {
      const newZoom = Math.min(currentZoom * 2, 0.5);
      setCurrentZoom(newZoom);
      mapRef.current.animateToRegion({
        ...mapRegion,
        latitudeDelta: newZoom,
        longitudeDelta: newZoom,
      }, 300);
    }
  };

  const handleZoomToStreetLevel = (): void => {
    const streetLevelZoom = 0.002;
    
    if (mapRef.current && userLocation) {
      setCurrentZoom(streetLevelZoom);
      const region = {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: streetLevelZoom,
        longitudeDelta: streetLevelZoom,
      };
      
      const duration = Platform.OS === 'android' ? 600 : 500;
      mapRef.current.animateToRegion(region, duration);
      setMapRegion(region);
    } else if (mapRef.current && mapRegion) {
      setCurrentZoom(streetLevelZoom);
      const region = {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude,
        latitudeDelta: streetLevelZoom,
        longitudeDelta: streetLevelZoom,
      };
      const duration = Platform.OS === 'android' ? 600 : 500;
      mapRef.current.animateToRegion(region, duration);
      setMapRegion(region);
    }
  };

  const handleZoomToExactLocation = async (): Promise<void> => {
    try {
      setLocationLoading(true);
      const freshLocation = await locationService.getHighAccuracyLocation();
      if (freshLocation) {
        setUserLocation(freshLocation);
        lastLocationRef.current = freshLocation;
      }
      setLocationLoading(false);

      const locationToUse = freshLocation || lastLocationRef.current || userLocation;
      
      if (mapRef.current && locationToUse) {
        const exactZoom = 0.0005;
        setCurrentZoom(exactZoom);
        
        if (Platform.OS === 'android') {
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: locationToUse.latitude,
                longitude: locationToUse.longitude,
                latitudeDelta: exactZoom,
                longitudeDelta: exactZoom,
              }, 800);
            }
          }, 200);
        } else {
          mapRef.current.animateToRegion({
            latitude: locationToUse.latitude,
            longitude: locationToUse.longitude,
            latitudeDelta: exactZoom,
            longitudeDelta: exactZoom,
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error zooming to exact location:', error);
      setLocationLoading(false);
      if (mapRef.current && userLocation) {
        const exactZoom = 0.0005;
        setCurrentZoom(exactZoom);
        mapRef.current.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: exactZoom,
          longitudeDelta: exactZoom,
        }, 500);
      }
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
                const currentLocation = await locationService.getCurrentLocation();
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

                const notificationPromises = connections.map(async (connection) => {
                  if (!connection.userId) {
                    console.warn('Connection missing userId:', connection.id);
                    return { success: false, connectionName: connection.name };
                  }

                  try {
                    const notificationBody = locationData
                      ? `${userName} needs help!${locationInfo}\n\nTap to view on map.`
                      : `${userName} needs help! Tap to view location.`;

                    await notificationService.sendPushNotification(connection.userId, {
                      title: '🚨 Emergency Alert',
                      body: notificationBody,
                      data: {
                        type: 'sos_alert',
                        fromUserId: user?.id,
                        fromUserName: userName,
                        location: locationData,
                        timestamp: timestamp.toISOString(),
                        formattedTime: timestamp.toLocaleString(),
                      },
                      sound: true,
                      priority: 'high',
                    });

                    return { success: true, connectionName: connection.name };
                  } catch (error) {
                    console.error(`Error sending emergency alert to ${connection.name}:`, error);
                    return { success: false, connectionName: connection.name };
                  }
                });

                const results = await Promise.allSettled(notificationPromises);
                
                const successful = results.filter(
                  (r) => r.status === 'fulfilled' && r.value.success
                ).length;
                const failed = results.length - successful;

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
                        navigation.reset({
                          index: 0,
                          routes: [{ name: 'Locked' }],
                        });
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

  const handleFitToMarkers = (): void => {
    if (mapRef.current && connections.length > 0) {
      const visibleMembers = connections.filter(m => m.shareLocation && m.location);
      
      if (visibleMembers.length === 0 && userLocation) {
        mapRef.current.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 300);
        setCurrentZoom(0.05);
        return;
      }

      if (visibleMembers.length > 0) {
        const latitudes = visibleMembers.map(m => m.location.latitude);
        const longitudes = visibleMembers.map(m => m.location.longitude);
        
        if (userLocation) {
          latitudes.push(userLocation.latitude);
          longitudes.push(userLocation.longitude);
        }

        const minLat = Math.min(...latitudes);
        const maxLat = Math.max(...latitudes);
        const minLng = Math.min(...longitudes);
        const maxLng = Math.max(...longitudes);

        const latDelta = (maxLat - minLat) * 1.5;
        const lngDelta = (maxLng - minLng) * 1.5;

        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;

        const newZoom = Math.max(latDelta, lngDelta, 0.01);
        setCurrentZoom(newZoom);

        mapRef.current.animateToRegion({
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: newZoom,
          longitudeDelta: newZoom,
        }, 500);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Modern Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Map</Text>
            <Text style={styles.headerSubtitle}>
              {connections.filter(m => m.shareLocation && m.isOnline).length} active
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              style={styles.iconButton}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={22} color="#374151" />
              {unreadNotificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={handleRefresh} 
              style={styles.iconButton}
              activeOpacity={0.7}
            >
              <Ionicons
                name="refresh"
                size={22}
                color="#374151"
                style={refreshing ? styles.refreshing : undefined}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Map View */}
      {locationLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading your location...</Text>
        </View>
      ) : (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={mapRegion || {
              latitude: 37.78825,
              longitude: -122.4324,
              latitudeDelta: 0.002,
              longitudeDelta: 0.002,
            }}
            showsUserLocation={locationSharingEnabled}
            showsMyLocationButton={true}
            followsUserLocation={false}
            userLocationPriority="high"
            userLocationUpdateInterval={10000}
            minZoomLevel={10}
            maxZoomLevel={20}
            moveOnMarkerPress={false}
            loadingEnabled={!mapReady}
            loadingIndicatorColor="#3B82F6"
            cacheEnabled={Platform.OS === 'android'}
            mapPadding={Platform.OS === 'android' ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined}
            onMapReady={() => {
              setMapReady(true);
              if (Platform.OS === 'android' && mapRef.current && mapRegion) {
                if (mapRegion.latitudeDelta > 0.002) {
                  const streetLevelZoom = 0.002;
                  setTimeout(() => {
                    if (mapRef.current) {
                      mapRef.current.animateToRegion({
                        latitude: mapRegion.latitude,
                        longitude: mapRegion.longitude,
                        latitudeDelta: streetLevelZoom,
                        longitudeDelta: streetLevelZoom,
                      }, 500);
                      setCurrentZoom(streetLevelZoom);
                    }
                  }, 100);
                }
              }
            }}
            onRegionChangeComplete={(region) => {
              if (region) {
                setMapRegion(region);
                setCurrentZoom(region.latitudeDelta);
              }
            }}
          >
            {!locationSharingEnabled && (
              <Marker
                key="user-marker"
                coordinate={userLocation}
                title="You"
                description="Your location"
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.userMarker}>
                  <Ionicons name="person" size={18} color="#FFFFFF" />
                </View>
              </Marker>
            )}

            {connections
              .filter(m => m.shareLocation && m.location && m.location.latitude !== 0 && m.location.longitude !== 0 && m.userId !== user?.id)
              .map((member) => (
                <Marker
                  key={member.id}
                  coordinate={{
                    latitude: member.location.latitude,
                    longitude: member.location.longitude,
                  }}
                  title={member.name}
                  description={member.relationship}
                  onPress={() => handleMarkerPress(member)}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.memberMarker}>
                    <View style={[
                      styles.markerStatusDot, 
                      { backgroundColor: (member.isOnline && member.shareLocation) ? '#10B981' : '#6B7280' }
                    ]} />
                    <Text style={styles.markerInitial}>{member.name.charAt(0).toUpperCase()}</Text>
                  </View>
                </Marker>
              ))}
          </MapView>

          {/* Modern Map Controls */}
          <View style={styles.mapControls}>
            <View style={styles.zoomControls}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleZoomIn}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={20} color="#1F2937" />
              </TouchableOpacity>
              <View style={styles.controlDivider} />
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleZoomOut}
                activeOpacity={0.8}
              >
                <Ionicons name="remove" size={20} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleFitToMarkers}
              activeOpacity={0.8}
            >
              <Ionicons name="expand-outline" size={20} color="#1F2937" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomToStreetLevel}
              activeOpacity={0.8}
            >
              <Ionicons name="location-outline" size={20} color="#1F2937" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleZoomToExactLocation}
              activeOpacity={0.8}
            >
              <Ionicons name="locate" size={20} color="#1F2937" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modern Controls Panel */}
      <ScrollView 
        style={styles.controlsPanel}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        {/* Location Sharing Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderContent}>
              <Ionicons 
                name={locationSharingEnabled ? "location" : "location-outline"} 
                size={20} 
                color={locationSharingEnabled ? "#10B981" : "#6B7280"} 
              />
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardTitle}>Location Sharing</Text>
                <Text style={styles.cardSubtitle}>
                  {togglingLocation 
                    ? 'Updating...' 
                    : locationSharingEnabled 
                      ? 'Visible to connections' 
                      : 'Hidden from connections'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.toggleSwitch,
                locationSharingEnabled && styles.toggleSwitchActive,
                togglingLocation && styles.toggleSwitchDisabled
              ]}
              onPress={handleToggleLocationSharing}
              disabled={togglingLocation}
              activeOpacity={0.8}
            >
              {togglingLocation ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={[
                  styles.toggleThumb,
                  locationSharingEnabled && styles.toggleThumbActive
                ]} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.emergencyButton]}
            onPress={handleSOS}
            activeOpacity={0.9}
          >
            <View style={styles.actionButtonContent}>
              <View style={styles.actionIconContainer}>
                <Ionicons name="warning" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.actionTextContainer}>
                <Text style={[styles.actionButtonTitle, styles.emergencyButtonText]}>Emergency Alert</Text>
                <Text style={[styles.actionButtonSubtitle, styles.emergencyButtonSubtext]}>
                  Send alert to {connections.length} connection{connections.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" style={styles.actionChevron} />
            </View>
          </TouchableOpacity>

          {!hideReportIncident && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('ReportIncident')}
              activeOpacity={0.8}
            >
              <View style={styles.actionButtonContent}>
                <View style={[styles.actionIconContainer, styles.actionIconContainerSecondary]}>
                  <Ionicons name="alert-circle-outline" size={24} color="#EF4444" />
                </View>
                <View style={styles.actionTextContainer}>
                  <Text style={styles.actionButtonTitle}>Report Incident</Text>
                  <Text style={styles.actionButtonSubtitle}>Report a safety concern</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" style={styles.actionChevron} />
              </View>
            </TouchableOpacity>
          )}
        </View>
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
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
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
  refreshing: {
    transform: [{ rotate: '180deg' }],
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    top: 16,
    gap: 8,
  },
  zoomControls: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  controlButton: {
    width: 48,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  controlDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  userMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  memberMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  markerStatusDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  markerInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  controlsPanel: {
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    maxHeight: 400,
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  toggleSwitch: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    padding: 3,
  },
  toggleSwitchActive: {
    backgroundColor: '#10B981',
  },
  toggleSwitchDisabled: {
    opacity: 0.6,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emergencyButton: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  emergencyButtonText: {
    color: '#FFFFFF',
  },
  emergencyButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionIconContainerSecondary: {
    backgroundColor: '#FEE2E2',
  },
  actionTextContainer: {
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  actionButtonSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  actionChevron: {
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
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
    borderRadius: 24,
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
});
