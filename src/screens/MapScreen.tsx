import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import * as ExpoLocation from 'expo-location';
import { useIncidents } from '../context/IncidentContext';
import { useAuth } from '../context/AuthContext';
import { locationService } from '../services/locationService';
import { offlineMapsService } from '../services/offlineMapsService';
import { supabase } from '../lib/supabase';
import type { RootStackParamList, Location } from '../types';

type MapScreenRouteProp = RouteProp<RootStackParamList, 'MapView'>;
type MapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MapView'>;

interface MapScreenProps {
  route: MapScreenRouteProp;
  navigation: MapScreenNavigationProp;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MapScreen({ route, navigation }: MapScreenProps) {
  const { location, title, showUserLocation = true, userId } = route.params;
  const { userLocation: incidentUserLocation } = useIncidents();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);
  
  // targetUserId is the user whose location we're viewing
  // If userId is provided (viewing someone else), use that
  // Otherwise, use current user's ID (viewing own location)
  const targetUserId = userId || user?.id;
  
  if (__DEV__) {
    console.log('MapScreen initialized:', {
      targetUserId,
      userId,
      currentUserId: user?.id,
      showUserLocation,
      hasLocation: !!location,
    });
  }
  
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<Location>(location); // Live location of the connected user (or current user if viewing own location)
  const [locationHistory, setLocationHistory] = useState<Array<Location & { timestamp: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<number | null>(null);
  const [hasOfflineMap, setHasOfflineMap] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(false);
  const [pendingUpdatesCount, setPendingUpdatesCount] = useState<number>(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tracksViewChanges, setTracksViewChanges] = useState<boolean>(true);
  const [hasLocationHistory, setHasLocationHistory] = useState<boolean>(true); // Track if location_history exists for target user
  const realtimeChannelRef = useRef<any>(null);
  const connectionsRealtimeChannelRef = useRef<any>(null);
  const pendingUpdatesRef = useRef<Array<Location & { timestamp: string }>>([]);
  const locationWatchSubscriptionRef = useRef<ExpoLocation.LocationSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasRequestedBackgroundPermissionRef = useRef<boolean>(false);
  const lastDestinationLocationRef = useRef<Location | null>(null);
  const lastUserLocationRef = useRef<Location | null>(null);
  const locationHistoryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationHistorySaveRef = useRef<number>(0);
  const hasInitializedLocationRef = useRef<boolean>(false);
  const hasInitializedSubscriptionsRef = useRef<boolean>(false);
  const isFetchingLocationRef = useRef<boolean>(false);
  
  const [mapRegion, setMapRegion] = useState<Region>(() => {
    // Initialize map region to destination location (connected user's location)
    // Use tight zoom to show exact location
    if (location && location.latitude && location.longitude) {
      return {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
        longitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
      };
    }
    // Fallback to default region
    return {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.0006,
      longitudeDelta: 0.0006,
    };
  });

  useEffect(() => {
    const checkOfflineMap = async () => {
      if (location && location.latitude && location.longitude) {
        const isCovered = await offlineMapsService.isLocationCovered(
          location.latitude,
          location.longitude
        );
        setHasOfflineMap(isCovered);
      }
    };
    checkOfflineMap();
  }, [location]);

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = React.useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Function to fetch user location (can be called from multiple places)
  const fetchUserLocation = React.useCallback(async (forceRefresh: boolean = false) => {
    // Don't show current user location if viewing another user and they have no location_history
    if (!showUserLocation || (userId && userId !== user?.id && !hasLocationHistory)) return;

    // Prevent concurrent fetches
    if (isFetchingLocationRef.current && !forceRefresh) {
      if (__DEV__) {
        console.log('Location fetch already in progress, skipping...');
      }
      return;
    }

    isFetchingLocationRef.current = true;

    try {
      // Check if location services are enabled (especially important on iOS)
      const servicesEnabled = await ExpoLocation.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        console.warn('Location services are disabled. Please enable them in Settings.');
        setLoading(false);
        return;
      }

      // Request permissions first (foreground and background)
      const permissionResult = await locationService.requestPermissions();
      if (!permissionResult.granted) {
        console.warn('Location permission not granted:', permissionResult.message);
        setLoading(false);
        return;
      }

      // Request background permissions if not already requested (for getting location in background)
      if (!hasRequestedBackgroundPermissionRef.current && Platform.OS === 'android') {
        try {
          const { status: backgroundStatus } = await ExpoLocation.requestBackgroundPermissionsAsync();
          if (backgroundStatus === 'granted') {
            console.log('Background location permission granted');
          } else {
            console.warn('Background location permission denied - location will still work in foreground');
          }
          hasRequestedBackgroundPermissionRef.current = true;
        } catch (bgError) {
          console.warn('Background permission request failed:', bgError);
        }
      } else if (!hasRequestedBackgroundPermissionRef.current && Platform.OS === 'ios') {
        try {
          const { status: backgroundStatus } = await ExpoLocation.requestBackgroundPermissionsAsync();
          if (backgroundStatus === 'granted') {
            console.log('Background location permission granted on iOS');
          } else {
            console.warn('Background location permission denied on iOS - location will still work in foreground');
          }
          hasRequestedBackgroundPermissionRef.current = true;
        } catch (bgError) {
          console.warn('Background permission request failed on iOS:', bgError);
        }
      }

      // Use high accuracy location for exact positioning (works in both foreground and background)
      // On iOS, request location with best accuracy
      const currentLocation = await locationService.getHighAccuracyLocation(true);
      if (currentLocation) {
        setUserLocation(currentLocation);
        lastUserLocationRef.current = currentLocation; // Initialize last location
        
        // Log location accuracy for debugging
        if (__DEV__) {
          console.log('Current user location fetched (foreground/background):', {
            lat: currentLocation.latitude.toFixed(6),
            lng: currentLocation.longitude.toFixed(6),
            platform: Platform.OS,
            appState: appStateRef.current,
          });
        }
        
        // Update map region to show both current user and destination locations
        // If both locations are close, zoom in to show exact location
        if (destinationLocation && destinationLocation.latitude && destinationLocation.longitude) {
          const minLat = Math.min(currentLocation.latitude, destinationLocation.latitude);
          const maxLat = Math.max(currentLocation.latitude, destinationLocation.latitude);
          const minLng = Math.min(currentLocation.longitude, destinationLocation.longitude);
          const maxLng = Math.max(currentLocation.longitude, destinationLocation.longitude);
          const latDelta = (maxLat - minLat) * 1.5;
          const lngDelta = (maxLng - minLng) * 1.5;
          
          // If locations are very close, use tight zoom for exact location
          // Otherwise, show both locations but still zoomed in
          const isClose = latDelta < 0.001 && lngDelta < 0.001;
          const currentRegion = {
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2,
            latitudeDelta: isClose 
              ? (Platform.OS === 'ios' ? 0.0006 : 0.001) // Zoomed in for exact location
              : Math.max(latDelta, Platform.OS === 'ios' ? 0.0006 : 0.001), // Still zoomed in
            longitudeDelta: isClose
              ? (Platform.OS === 'ios' ? 0.0006 : 0.001) // Zoomed in for exact location
              : Math.max(lngDelta, Platform.OS === 'ios' ? 0.0006 : 0.001), // Still zoomed in
          };
          setMapRegion(currentRegion);
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion(currentRegion, 1000);
            }
          }, 500);
        } else {
          // Only current user location available
          const currentRegion = {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: Platform.OS === 'ios' ? 0.004 : 0.01,
            longitudeDelta: Platform.OS === 'ios' ? 0.004 : 0.01,
          };
          setMapRegion(currentRegion);
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion(currentRegion, 1000);
            }
          }, 500);
        }
      } else if (incidentUserLocation) {
        setUserLocation(incidentUserLocation);
      }

      // Start watching location changes for real-time updates (works in both foreground and background)
      // Use iOS-specific settings for better accuracy
      if (locationWatchSubscriptionRef.current) {
        locationWatchSubscriptionRef.current.remove();
      }

      // High-accuracy GPS settings optimized for Nigeria and regions with GPS challenges
      // Use maximumAge: 0 to prevent cached location data
      const watchOptions = Platform.OS === 'ios' 
        ? {
            accuracy: ExpoLocation.Accuracy.BestForNavigation, // Best accuracy for iOS
            timeInterval: 2000, // Update every 2 seconds on iOS for real-time tracking
            distanceInterval: 1, // Update every 1 meter on iOS for precise tracking
            mayShowUserSettings: false, // Don't show settings dialog
          }
        : {
            accuracy: ExpoLocation.Accuracy.Highest, // Highest accuracy for Android
            timeInterval: 3000, // Update every 3 seconds on Android (reduced from 5s for better accuracy)
            distanceInterval: 1, // Update every 1 meter on Android (reduced from 5m for better accuracy)
            mayShowUserSettings: false, // Don't show settings dialog
          };

      locationWatchSubscriptionRef.current = await ExpoLocation.watchPositionAsync(
        watchOptions,
        (newLocation) => {
          // Use ref to get current userLocation to avoid closure issues
          const currentUserLocation = lastUserLocationRef.current;
          const updatedLocation: Location = {
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
            address: currentUserLocation?.address, // Preserve address from ref
          };

          // Check if user has moved significantly (more than 10 meters) to avoid unnecessary updates
          const MIN_DISTANCE_THRESHOLD = 10; // 10 meters for current user
          const lastLocation = lastUserLocationRef.current;
          
          if (lastLocation) {
            const distance = calculateDistance(
              lastLocation.latitude,
              lastLocation.longitude,
              updatedLocation.latitude,
              updatedLocation.longitude
            );

            // Only update if user has moved significantly
            if (distance < MIN_DISTANCE_THRESHOLD) {
              // User hasn't moved significantly, skip update and logging
              return;
            }
          }

          // Update state and ref
          setUserLocation(updatedLocation);
          lastUserLocationRef.current = updatedLocation;
          
          // Log accuracy for debugging (only when user moves, and less frequently)
          if (__DEV__) {
            const distanceMoved = lastLocation 
              ? calculateDistance(
                  lastLocation.latitude,
                  lastLocation.longitude,
                  updatedLocation.latitude,
                  updatedLocation.longitude
                ).toFixed(1)
              : 'initial';
            // Only log if moved more than 50 meters to reduce console spam
            if (!lastLocation || parseFloat(distanceMoved) > 50) {
            console.log('Location updated (foreground/background):', {
              lat: updatedLocation.latitude.toFixed(6),
              lng: updatedLocation.longitude.toFixed(6),
              accuracy: newLocation.coords.accuracy,
              distanceMoved: `${distanceMoved}m`,
              platform: Platform.OS,
              appState: appStateRef.current,
            });
            }
          }
        }
      );
    } catch (error) {
      console.error('Error fetching user location:', error);
    } finally {
      setLoading(false);
      isFetchingLocationRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUserLocation, incidentUserLocation, location, destinationLocation, calculateDistance]);

  // Initial fetch on mount (only once)
  useEffect(() => {
    // Don't fetch user location if viewing another user without location_history
    if (showUserLocation && !hasInitializedLocationRef.current && !(userId && userId !== user?.id && !hasLocationHistory)) {
      hasInitializedLocationRef.current = true;
      fetchUserLocation();
    } else if (!showUserLocation || (userId && userId !== user?.id && !hasLocationHistory)) {
      // When viewing someone else's location, don't fetch current user's location
      // Also don't fetch if viewing another user without location_history
      setLoading(false);
      hasInitializedLocationRef.current = false; // Reset when showUserLocation changes
      // Center map on destination location only - zoomed in for exact location
      // But only if location_history exists
      if (hasLocationHistory && destinationLocation && destinationLocation.latitude && destinationLocation.longitude) {
        const region: Region = {
          latitude: destinationLocation.latitude,
          longitude: destinationLocation.longitude,
          latitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
          longitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
        };
        setMapRegion(region);
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.animateToRegion(region, 1000);
          }
        }, 500);
      } else if (userId && userId !== user?.id && !hasLocationHistory) {
        // Set default region when no location_history
        setMapRegion({
          latitude: 0,
          longitude: 0,
          latitudeDelta: 180,
          longitudeDelta: 360,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUserLocation, destinationLocation, hasLocationHistory, userId, user?.id]);

  // Handle app state changes (foreground/background) - refresh location when app comes to foreground
  useEffect(() => {
    if (!showUserLocation) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground - refresh location
        console.log('App came to foreground, refreshing location...');
        fetchUserLocation(true); // Force refresh
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [showUserLocation, fetchUserLocation]);

  // Refresh location when screen comes into focus (e.g., after device unlock or navigation)
  useFocusEffect(
    React.useCallback(() => {
      if (showUserLocation) {
        // Only fetch if not already initialized or if explicitly needed
        if (!hasInitializedLocationRef.current) {
          console.log('MapScreen focused, initializing location...');
          hasInitializedLocationRef.current = true;
        fetchUserLocation(true); // Force refresh
        } else {
          // Just refresh location without re-initializing subscriptions
          if (__DEV__) {
            console.log('MapScreen focused, location already initialized');
          }
        }
      }
      
      // Cleanup when screen loses focus
      return () => {
        if (locationHistoryIntervalRef.current) {
          clearInterval(locationHistoryIntervalRef.current);
          locationHistoryIntervalRef.current = null;
        }
        // Don't reset hasInitializedLocationRef here - keep it for the session
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showUserLocation])
  );

  // Save location to history every 10 minutes while on MapScreen
  const saveLocationToHistory = React.useCallback(async (): Promise<void> => {
    if (!user?.id || !showUserLocation) return;

    try {
      // Check if enough time has passed (prevent constant updates)
      const now = Date.now();
      const TEN_MINUTES_MS = 10 * 60 * 1000; // 10 minutes
      if (lastLocationHistorySaveRef.current > 0 && (now - lastLocationHistorySaveRef.current) < TEN_MINUTES_MS) {
        // Silently skip - don't log to reduce console spam
        return;
      }

      // Request permissions if needed
      const hasPermission = await locationService.checkPermissions();
      if (!hasPermission) {
        const permissionResult = await locationService.requestPermissions();
        if (!permissionResult.granted) {
          console.warn('Location permission not granted, cannot save to history');
          return;
        }
      }

      // Get current location with high accuracy
      const currentLocation = await locationService.getHighAccuracyLocation(true);
      if (!currentLocation || !currentLocation.latitude || !currentLocation.longitude) {
        console.warn('Could not get location for history save');
        return;
      }

      // Get accuracy from location if available
      let locationAccuracy: number | null = null;
      try {
        const locationWithAccuracy = await ExpoLocation.getCurrentPositionAsync({
          accuracy: Platform.OS === 'ios' ? ExpoLocation.Accuracy.BestForNavigation : ExpoLocation.Accuracy.Highest,
          maximumAge: 5000, // Allow 5 second old data
          timeout: 10000,
        });
        locationAccuracy = locationWithAccuracy?.coords?.accuracy !== undefined && locationWithAccuracy?.coords?.accuracy !== null
          ? locationWithAccuracy.coords.accuracy
          : null;
      } catch (accuracyError) {
        // Accuracy is optional, continue without it
        if (__DEV__) {
          console.warn('Could not get location accuracy:', accuracyError);
        }
      }

      // Get address - try to get it if not already available
      // Since we're only saving once per 10 minutes, we can try harder to get the address
      let addressToSave = currentLocation.address;
      if (!addressToSave) {
        try {
          // Try to get address from geocoding (force: true since we only do this once per 10 minutes)
          addressToSave = await locationService.getAddressFromCoordinates(
            currentLocation.latitude,
            currentLocation.longitude,
            true // Force geocoding since we only save once per 10 minutes
          );
          if (__DEV__ && addressToSave) {
            console.log('Address geocoded for location history:', addressToSave);
          }
        } catch (geocodeError) {
          // Address is optional, continue without it
          if (__DEV__) {
            console.warn('Could not geocode address for location history:', geocodeError);
          }
        }
      }

      // Insert into location_history table
      const { error } = await supabase
        .from('location_history')
        .insert({
          user_id: user.id,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          address: addressToSave || null,
          accuracy: locationAccuracy,
        });

      if (error) {
        console.error('Error saving location to history:', error);
      } else {
        lastLocationHistorySaveRef.current = Date.now();
        if (__DEV__) {
          console.log('✅ Location saved to history from MapScreen:', {
            lat: currentLocation.latitude.toFixed(6),
            lng: currentLocation.longitude.toFixed(6),
            hasAddress: !!addressToSave,
            address: addressToSave || 'No address',
            accuracy: locationAccuracy,
          });
        }
      }
    } catch (error) {
      console.error('Error in saveLocationToHistory:', error);
    }
  }, [user?.id, showUserLocation]);

  // Set up 10-minute interval for location history updates while on MapScreen
  useEffect(() => {
    if (!user?.id || !showUserLocation) {
      // Clear interval if conditions not met
      if (locationHistoryIntervalRef.current) {
        clearInterval(locationHistoryIntervalRef.current);
        locationHistoryIntervalRef.current = null;
      }
      return;
    }

    // Prevent setting up multiple intervals
    if (locationHistoryIntervalRef.current) {
      if (__DEV__) {
        console.log('Location history interval already set up, skipping...');
      }
      return;
    }

    // Save location immediately when screen is focused (only if enough time has passed)
    const now = Date.now();
    const TEN_MINUTES_MS = 10 * 60 * 1000; // 10 minutes
    if (lastLocationHistorySaveRef.current === 0 || (now - lastLocationHistorySaveRef.current) >= TEN_MINUTES_MS) {
      // Call after a small delay to ensure everything is initialized
      setTimeout(() => {
        saveLocationToHistory();
      }, 1000);
    }

    // Set up interval to save location every 10 minutes (600000 ms)
    locationHistoryIntervalRef.current = setInterval(() => {
      saveLocationToHistory();
    }, 600000); // 10 minutes

    if (__DEV__) {
      console.log('✅ Location history interval set up (10 minutes)');
    }

    // Cleanup on unmount or when conditions change
    return () => {
      if (locationHistoryIntervalRef.current) {
        clearInterval(locationHistoryIntervalRef.current);
        locationHistoryIntervalRef.current = null;
        if (__DEV__) {
          console.log('Location history interval cleared');
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, showUserLocation]);

  // Cleanup location watch and real-time subscriptions on unmount
  useEffect(() => {
    return () => {
      if (locationWatchSubscriptionRef.current) {
        locationWatchSubscriptionRef.current.remove();
        locationWatchSubscriptionRef.current = null;
      }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      if (connectionsRealtimeChannelRef.current) {
        supabase.removeChannel(connectionsRealtimeChannelRef.current);
        connectionsRealtimeChannelRef.current = null;
      }
      if (locationHistoryIntervalRef.current) {
        clearInterval(locationHistoryIntervalRef.current);
        locationHistoryIntervalRef.current = null;
      }
      // Reset initialization flags on unmount
      hasInitializedLocationRef.current = false;
      hasInitializedSubscriptionsRef.current = false;
      isFetchingLocationRef.current = false;
    };
  }, []);

  const fetchLocationHistory = async (date: Date) => {
    if (!targetUserId) {
      if (__DEV__) {
        console.warn('Cannot fetch location history: targetUserId is not set');
      }
      setLocationHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    try {
      if (__DEV__) {
        console.log('Fetching location history for user:', targetUserId, 'date:', date.toISOString());
      }

      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      const now = new Date();
      const hoursSinceStartOfDay = Math.ceil((now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60));
      const hoursToFetch = Math.max(hoursSinceStartOfDay, 168);

      const allHistory = await locationService.getLocationHistory(targetUserId, hoursToFetch);
      
      if (__DEV__) {
        console.log(`Found ${allHistory.length} total location history entries for user ${targetUserId}`);
      }

      // Check if any location_history exists at all (not just for selected date)
      // This is important when viewing another user
      if (userId && userId !== user?.id) {
        // Check if location_history exists for this user
        const lastLocation = await locationService.getLastLocationFromHistory(targetUserId);
        if (!lastLocation || !lastLocation.latitude || !lastLocation.longitude) {
          setHasLocationHistory(false);
          setLocationHistory([]);
          setHistoryLoading(false);
          // Also clear destination location since there's no valid location
          setDestinationLocation({ latitude: 0, longitude: 0 });
          if (__DEV__) {
            console.log('No location_history found for connected user');
          }
          return;
        } else {
          setHasLocationHistory(true);
          // Update destination location with the last location from history
          setDestinationLocation(lastLocation);
        }
      }

      let filteredHistory = allHistory.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= startOfDay && itemDate <= endOfDay;
      });

      if (__DEV__) {
        console.log(`Filtered to ${filteredHistory.length} entries for selected date`);
      }

      filteredHistory.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const entriesWithoutAddress = filteredHistory.filter(item => !item.address);
      if (entriesWithoutAddress.length > 0) {
        Promise.all(
          entriesWithoutAddress.slice(0, 10).map(async (item) => {
            try {
              const address = await locationService.reverseGeocode(
                item.latitude,
                item.longitude
              );
              if (address) {
                const index = filteredHistory.findIndex(
                  h => h.latitude === item.latitude && 
                       h.longitude === item.longitude && 
                       h.timestamp === item.timestamp
                );
                if (index !== -1) {
                  filteredHistory[index].address = address;
                  setLocationHistory([...filteredHistory]);
                }
              }
            } catch (error) {
              // Silently fail
            }
          })
        ).catch(() => {});
      }

      setLocationHistory(filteredHistory);
      
      if (__DEV__) {
        if (filteredHistory.length === 0) {
          console.log('No location history found for selected date. Total entries fetched:', allHistory.length);
        } else {
          console.log(`✅ Location history loaded: ${filteredHistory.length} entries`);
        }
      }
    } catch (error) {
      console.error('Error fetching location history:', error);
      setLocationHistory([]);
      // If viewing another user and error occurs, assume no location_history
      if (userId && userId !== user?.id) {
        setHasLocationHistory(false);
        setDestinationLocation({ latitude: 0, longitude: 0 });
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (targetUserId) {
      if (__DEV__) {
        console.log('Loading location history for targetUserId:', targetUserId);
      }
      // Check if viewing another user - if so, check location_history first
      if (userId && userId !== user?.id) {
        // Check for location_history before fetching
        locationService.getLastLocationFromHistory(targetUserId).then((lastLocation) => {
          if (!lastLocation || !lastLocation.latitude || !lastLocation.longitude) {
            setHasLocationHistory(false);
            setDestinationLocation({ latitude: 0, longitude: 0 });
            setLocationHistory([]);
            setHistoryLoading(false);
            setLoading(false); // Set main loading to false
            if (__DEV__) {
              console.log('No location_history found for connected user on initial load');
            }
          } else {
            setHasLocationHistory(true);
            setDestinationLocation(lastLocation);
            fetchLocationHistory(selectedDate);
          }
        }).catch((error) => {
          console.error('Error checking location_history:', error);
          setHasLocationHistory(false);
          setDestinationLocation({ latitude: 0, longitude: 0 });
          setLocationHistory([]);
          setHistoryLoading(false);
          setLoading(false); // Set main loading to false
        });
      } else {
        // Viewing own location or no userId specified
        setHasLocationHistory(true);
        fetchLocationHistory(selectedDate);
      }
      pendingUpdatesRef.current = [];
      setPendingUpdatesCount(0);
    } else {
      if (__DEV__) {
        console.warn('targetUserId is not set, cannot fetch location history');
      }
      setLocationHistory([]);
      setHasLocationHistory(true); // Default to true if no targetUserId
    }
  }, [targetUserId, selectedDate, userId, user?.id]);

  // Real-time subscription for location_history (for timeline)
  useEffect(() => {
    if (!targetUserId) return;

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`location_history_${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'location_history',
          filter: `user_id=eq.${targetUserId}`,
        },
        (payload) => {
          const newEntry = payload.new;
          if (newEntry && newEntry.created_at) {
            const entryDate = new Date(newEntry.created_at);
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);

            if (entryDate >= startOfDay && entryDate <= endOfDay) {
              const newLocation: Location & { timestamp: string } = {
                latitude: newEntry.latitude,
                longitude: newEntry.longitude,
                address: newEntry.address || undefined,
                timestamp: newEntry.created_at,
              };

              if (autoRefreshEnabled) {
                setLocationHistory((prev) => [newLocation, ...prev]);
              } else {
                pendingUpdatesRef.current.push(newLocation);
                setPendingUpdatesCount(pendingUpdatesRef.current.length);
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'location_history',
          filter: `user_id=eq.${targetUserId}`,
        },
        (payload) => {
          if (autoRefreshEnabled && payload.old && payload.old.id) {
            setLocationHistory((prev) => 
              prev.filter((item) => {
                const oldEntry = payload.old;
                return !(
                  item.latitude === oldEntry.latitude &&
                  item.longitude === oldEntry.longitude &&
                  item.timestamp === oldEntry.created_at
                );
              })
            );
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [targetUserId, selectedDate, autoRefreshEnabled]);

  // Real-time subscription for connections table to get live location updates
  // This watches for location updates from the connected user (works in both foreground and background)
  useEffect(() => {
    if (!targetUserId || !user?.id || targetUserId === user.id) {
      // Clean up if conditions not met
      if (connectionsRealtimeChannelRef.current) {
        supabase.removeChannel(connectionsRealtimeChannelRef.current);
        connectionsRealtimeChannelRef.current = null;
        hasInitializedSubscriptionsRef.current = false;
      }
      return;
    }

    // Prevent duplicate subscriptions
    if (hasInitializedSubscriptionsRef.current && connectionsRealtimeChannelRef.current) {
      if (__DEV__) {
        console.log('Connections subscription already initialized, skipping...');
      }
      return;
    }

    // Clean up existing subscription
    if (connectionsRealtimeChannelRef.current) {
      supabase.removeChannel(connectionsRealtimeChannelRef.current);
      connectionsRealtimeChannelRef.current = null;
    }

    // Subscribe to connections table updates for the target user's location
    // This watches where connected_user_id = targetUserId (location updates from the connected user)
    const connectionsChannel = supabase
      .channel(`map_connections_${targetUserId}_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'connections',
          filter: `connected_user_id=eq.${targetUserId}`,
        },
        (payload) => {
          const updatedConnection = payload.new;
          if (updatedConnection && 
              updatedConnection.location_latitude && 
              updatedConnection.location_longitude) {
            
            const newLocation: Location = {
              latitude: updatedConnection.location_latitude,
              longitude: updatedConnection.location_longitude,
              address: updatedConnection.location_address || undefined,
            };

            // Check if user has moved significantly (more than 20 meters) to avoid unnecessary updates
            const MIN_DISTANCE_THRESHOLD = 20; // 20 meters
            const lastLocation = lastDestinationLocationRef.current;
            
            if (lastLocation) {
              const distance = calculateDistance(
                lastLocation.latitude,
                lastLocation.longitude,
                newLocation.latitude,
                newLocation.longitude
              );

              // Only update if user has moved significantly
              if (distance < MIN_DISTANCE_THRESHOLD) {
                // User hasn't moved significantly, skip update and logging
                return;
              }
            }

            // Update destination location in real-time
            setDestinationLocation(newLocation);
            lastDestinationLocationRef.current = newLocation;

            // Update map region to show both locations if user location is also available
            if (userLocation) {
              const minLat = Math.min(userLocation.latitude, newLocation.latitude);
              const maxLat = Math.max(userLocation.latitude, newLocation.latitude);
              const minLng = Math.min(userLocation.longitude, newLocation.longitude);
              const maxLng = Math.max(userLocation.longitude, newLocation.longitude);
              const latDelta = (maxLat - minLat) * 1.5;
              const lngDelta = (maxLng - minLng) * 1.5;
              setMapRegion({
                latitude: (minLat + maxLat) / 2,
                longitude: (minLng + maxLng) / 2,
                latitudeDelta: Math.max(latDelta, Platform.OS === 'ios' ? 0.001 : 0.002),
                longitudeDelta: Math.max(lngDelta, Platform.OS === 'ios' ? 0.001 : 0.002),
              });
            } else {
              // Just center on the updated location - zoomed in for exact location
              const region: Region = {
                latitude: newLocation.latitude,
                longitude: newLocation.longitude,
                latitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
                longitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
              };
              setMapRegion(region);
            }

            // Animate map to new location only if user moved significantly - zoomed in for exact location
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: newLocation.latitude,
                longitude: newLocation.longitude,
                latitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
                longitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
              }, 1000);
            }

            if (__DEV__) {
              const distanceMoved = lastLocation 
                ? calculateDistance(
                    lastLocation.latitude,
                    lastLocation.longitude,
                    newLocation.latitude,
                    newLocation.longitude
                  ).toFixed(1)
                : 'initial';
              console.log('Live location updated for connected user:', {
                userId: targetUserId,
                lat: newLocation.latitude.toFixed(6),
                lng: newLocation.longitude.toFixed(6),
                address: newLocation.address || 'no address',
                distanceMoved: `${distanceMoved}m`,
                timestamp: updatedConnection.location_updated_at,
              });
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          hasInitializedSubscriptionsRef.current = true;
          console.log(`✅ Subscribed to live location updates for user: ${targetUserId}`);
        } else if (status === 'CHANNEL_ERROR') {
          hasInitializedSubscriptionsRef.current = false;
          console.error('❌ Error subscribing to connections real-time updates');
        }
      });

    connectionsRealtimeChannelRef.current = connectionsChannel;

    // Also fetch initial location from connections table
    const fetchInitialConnectionLocation = async () => {
      try {
        const { data: connectionData } = await supabase
          .from('connections')
          .select('location_latitude, location_longitude, location_address, location_updated_at')
          .eq('user_id', user.id)
          .eq('connected_user_id', targetUserId)
          .eq('status', 'connected')
          .single();

        if (connectionData && 
            connectionData.location_latitude && 
            connectionData.location_longitude) {
          const initialLocation: Location = {
            latitude: connectionData.location_latitude,
            longitude: connectionData.location_longitude,
            address: connectionData.location_address || undefined,
          };
          setDestinationLocation(initialLocation);
          lastDestinationLocationRef.current = initialLocation; // Initialize last location
          
          if (__DEV__) {
            console.log('Initial connection location fetched:', {
              lat: initialLocation.latitude.toFixed(6),
              lng: initialLocation.longitude.toFixed(6),
            });
          }
        }
      } catch (error) {
        console.warn('Error fetching initial connection location:', error);
      }
    };

    fetchInitialConnectionLocation();

      return () => {
        if (connectionsRealtimeChannelRef.current) {
          supabase.removeChannel(connectionsRealtimeChannelRef.current);
          connectionsRealtimeChannelRef.current = null;
          hasInitializedSubscriptionsRef.current = false;
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetUserId, user?.id]);

  const handleManualRefresh = React.useCallback(async () => {
    if (!targetUserId) return;

    setIsRefreshing(true);
    try {
      const pending = [...pendingUpdatesRef.current];
      pendingUpdatesRef.current = [];
      setPendingUpdatesCount(0);
      await fetchLocationHistory(selectedDate);

      if (pending.length > 0) {
        setLocationHistory((prev) => {
          const existingTimestamps = new Set(prev.map(item => item.timestamp));
          const newItems = pending.filter(item => !existingTimestamps.has(item.timestamp));
          return [...newItems, ...prev].sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
      }
    } catch (error) {
      console.error('Error refreshing location history:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [targetUserId, selectedDate]);

  useFocusEffect(
    React.useCallback(() => {
      if (targetUserId && autoRefreshEnabled) {
        fetchLocationHistory(selectedDate);
      }
    }, [targetUserId, selectedDate, autoRefreshEnabled])
  );

  useEffect(() => {
    // Don't update map region if viewing another user without location_history
    if (userId && userId !== user?.id && !hasLocationHistory) {
      // Set a default region (world view) when no location_history
      setMapRegion({
        latitude: 0,
        longitude: 0,
        latitudeDelta: 180,
        longitudeDelta: 360,
      });
      return;
    }

    if (showUserLocation && userLocation) {
      // Show both current user and destination locations
      const minLat = Math.min(destinationLocation.latitude, userLocation.latitude);
      const maxLat = Math.max(destinationLocation.latitude, userLocation.latitude);
      const minLng = Math.min(destinationLocation.longitude, userLocation.longitude);
      const maxLng = Math.max(destinationLocation.longitude, userLocation.longitude);
      const latDelta = (maxLat - minLat) * 1.5;
      const lngDelta = (maxLng - minLng) * 1.5;
      setMapRegion({
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(latDelta, Platform.OS === 'ios' ? 0.001 : 0.002),
        longitudeDelta: Math.max(lngDelta, Platform.OS === 'ios' ? 0.001 : 0.002),
      });
    } else if (!showUserLocation && destinationLocation && hasLocationHistory) {
      // Only show destination location (connected user's location) - zoomed in for exact location
      const region: Region = {
        latitude: destinationLocation.latitude,
        longitude: destinationLocation.longitude,
        latitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
        longitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in for exact location
      };
      setMapRegion(region);
      // Animate map to destination location
      if (mapRef.current) {
        setTimeout(() => {
          mapRef.current?.animateToRegion(region, 1000);
        }, 500);
      }
    }
  }, [userLocation, destinationLocation, showUserLocation, hasLocationHistory, userId, user?.id]);

  const polylineCoordinates = useMemo(() => {
    const coordinates = locationHistory.length > 0
      ? [...locationHistory].reverse().map((loc) => ({
          latitude: loc.latitude,
          longitude: loc.longitude,
        }))
      : [];
    
    if (showUserLocation && userLocation) {
      if (coordinates.length > 0) {
        const lastPoint = coordinates[coordinates.length - 1];
        const distance = Math.sqrt(
          Math.pow(userLocation.latitude - lastPoint.latitude, 2) +
          Math.pow(userLocation.longitude - lastPoint.longitude, 2)
        );
        if (distance > 0.0001) {
          coordinates.push({
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          });
        }
      } else {
        coordinates.push({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        });
      }
    }
    return coordinates;
  }, [locationHistory, userLocation, showUserLocation]);

  const historyMarkers = useMemo(() => {
    return locationHistory.map((item, index) => {
      const isSelected = selectedHistoryItem === index;
      const markerKey = `${item.latitude.toFixed(6)}-${item.longitude.toFixed(6)}-${item.timestamp}`;
      
      return (
        <Marker
          key={markerKey}
          coordinate={{ latitude: item.latitude, longitude: item.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          flat={false}
          zIndex={isSelected ? 100 : 50}
          onPress={() => {
            setSelectedHistoryItem(index);
            focusOnLocation(item.latitude, item.longitude);
          }}
        >
          <View 
            style={[
              styles.historyMarkerContainer,
              isSelected && styles.historyMarkerSelected
            ]}
            pointerEvents="none"
          >
            <View style={styles.historyMarkerDot} />
          </View>
        </Marker>
      );
    });
  }, [locationHistory, selectedHistoryItem, focusOnLocation]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  };


  const calculateTimeDiff = (timestamp1: string, timestamp2: string): number => {
    const date1 = new Date(timestamp1);
    const date2 = new Date(timestamp2);
    return Math.abs(date2.getTime() - date1.getTime()) / 1000;
  };

  const formatDateDisplay = (date: Date): string => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  const formatTimeRange = (startTime: string, endTime: string): string => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const formatTime = (date: Date) => {
      return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase();
    };
    return `${formatTime(start)} – ${formatTime(end)}`;
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const focusOnLocation = React.useCallback((lat: number, lng: number) => {
    // Zoom in 1x when address/location is pressed to view
    const newRegion: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in 1x
      longitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Zoomed in 1x
    };
    mapRef.current?.animateToRegion(newRegion, 500);
    setMapRegion(newRegion);
  }, []);

  const handleRefreshLocation = async (): Promise<void> => {
    try {
      setLoading(true);
      // Request permission if needed (foreground and background)
      const permissionResult = await locationService.requestPermissions();
      if (!permissionResult.granted) {
        console.warn('Location permission not granted:', permissionResult.message);
        setLoading(false);
        return;
      }

      // Request background permissions if not already requested
      if (!hasRequestedBackgroundPermissionRef.current) {
        try {
          const { status: backgroundStatus } = await ExpoLocation.requestBackgroundPermissionsAsync();
          if (backgroundStatus === 'granted') {
            console.log('Background location permission granted');
          }
          hasRequestedBackgroundPermissionRef.current = true;
        } catch (bgError) {
          console.warn('Background permission request failed:', bgError);
        }
      }
      
      // Get the actual current location with high accuracy (works in both foreground and background)
      const exactLocation = await locationService.getHighAccuracyLocation(true);
      
      if (exactLocation) {
        // On Android, temporarily enable tracksViewChanges to ensure marker renders
        if (Platform.OS === 'android') {
          setTracksViewChanges(true);
        }
        
        // Always set user location to show the pin
        setUserLocation(exactLocation);
        
        // Zoom to the exact location
        const exactRegion: Region = {
          latitude: exactLocation.latitude,
          longitude: exactLocation.longitude,
          latitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001, // Very tight zoom for exact location
          longitudeDelta: Platform.OS === 'ios' ? 0.0006 : 0.001,
        };
        setMapRegion(exactRegion);
        if (mapRef.current) {
          mapRef.current.animateToRegion(exactRegion, 1000);
        }
        
        // On Android, disable tracksViewChanges after a delay for performance
        if (Platform.OS === 'android') {
          setTimeout(() => {
            setTracksViewChanges(false);
          }, 1500);
        }
        
        // Log for debugging
        if (__DEV__) {
          console.log('Location updated via button:', {
            lat: exactLocation.latitude.toFixed(6),
            lng: exactLocation.longitude.toFixed(6),
            platform: Platform.OS,
          });
        }
      }
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title || 'Map View'}</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Modern Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <View style={styles.iconButton}>
            <Ionicons name="arrow-back" size={22} color="#000" />
          </View>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{title || 'Location Timeline'}</Text>
          {targetUserId && locationHistory.length > 0 && (
            <Text style={styles.headerSubtitle}>{locationHistory.length} locations</Text>
          )}
        </View>
        <View style={styles.headerRightButtons}>
          {pendingUpdatesCount > 0 && !autoRefreshEnabled && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingUpdatesCount}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleManualRefresh}
            disabled={isRefreshing || loading}
            activeOpacity={0.7}
          >
            <View style={styles.iconButton}>
              {isRefreshing || loading ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <Ionicons name="refresh" size={22} color="#007AFF" />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Map Section */}
      <View style={styles.mapSection}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={mapRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={true}
          showsScale={true}
          mapType="standard"
          zoomEnabled={true}
          scrollEnabled={true}
          rotateEnabled={true}
          onMapReady={() => {
            console.log('✅ Map is ready');
            if (Platform.OS === 'android') {
              console.log('Android Map Ready - Markers should be visible');
              console.log('Marker count:', {
                historyMarkers: locationHistory.length,
                userLocation: userLocation ? 1 : 0,
                destination: 1,
              });
              // Disable tracksViewChanges after map is ready on Android for better performance
              setTimeout(() => {
                setTracksViewChanges(false);
              }, 1000);
            } else {
              setTracksViewChanges(false);
            }
            setMapError(null);
          }}
          onError={(error) => {
            console.error('❌ Map error:', error);
            const errorMessage = error?.nativeEvent?.message || 'Map failed to load';
            setMapError(errorMessage);
            // On Android, common issues:
            // - Missing Google Play Services
            // - Invalid API key
            // - Network issues
            if (Platform.OS === 'android') {
              console.error('Android Map Error Details:', {
                error: errorMessage,
                hasGooglePlayServices: 'Check device settings',
                apiKeySet: 'Check AndroidManifest.xml',
              });
            }
          }}
          onRegionChangeComplete={(region) => {
            if (region) setMapRegion(region);
          }}
        >
          {/* Only show destination marker if location_history exists and location is valid */}
          {hasLocationHistory && destinationLocation && destinationLocation.latitude !== 0 && destinationLocation.longitude !== 0 && (
            <Marker
              key={`destination-${destinationLocation.latitude}-${destinationLocation.longitude}`}
              coordinate={destinationLocation}
              title={title || 'Location'}
              description={destinationLocation.address || `${destinationLocation.latitude.toFixed(6)}, ${destinationLocation.longitude.toFixed(6)}`}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
              flat={false}
              zIndex={999}
              onPress={() => {
                focusOnLocation(destinationLocation.latitude, destinationLocation.longitude);
              }}
            >
              <View style={styles.destinationPin} pointerEvents="none" collapsable={false}>
                <View style={styles.destinationPinHead} collapsable={false}>
                  <Ionicons name="location" size={20} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          )}
        </MapView>
        
        <TouchableOpacity
          style={styles.locateButton}
          onPress={handleRefreshLocation}
          disabled={loading}
          activeOpacity={0.8}
        >
          <View style={styles.locateButtonInner}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="locate" size={22} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>

        {hasOfflineMap && (
          <View style={styles.offlineBadge}>
            <Ionicons name="download" size={14} color="#10B981" />
            <Text style={styles.offlineBadgeText}>Offline</Text>
          </View>
        )}
        
        {mapError && (
          <View style={styles.mapErrorContainer}>
            <Ionicons name="alert-circle" size={24} color="#FF3B30" />
            <Text style={styles.mapErrorText}>Map failed to load</Text>
            <Text style={styles.mapErrorSubtext}>
              {Platform.OS === 'android' 
                ? 'Please check Google Play Services and internet connection'
                : 'Please check your internet connection'}
            </Text>
          </View>
        )}
        
        {/* Show error message when viewing another user and they have no location_history */}
        {userId && userId !== user?.id && !hasLocationHistory && !historyLoading && (
          <View style={styles.mapErrorContainer}>
            <Ionicons name="location-off" size={32} color="#FF3B30" />
            <Text style={styles.mapErrorText}>Location Not Available</Text>
            <Text style={styles.mapErrorSubtext}>
              {title || 'User'}'s location is not available. Location sharing might be turned off.
            </Text>
          </View>
        )}
      </View>

      {/* Date Selector Card - Only show if location_history exists */}
      {targetUserId && hasLocationHistory && (
        <View style={styles.dateCard}>
          <TouchableOpacity
            style={styles.dateNavButton}
            onPress={() => navigateDate('prev')}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#007AFF" />
          </TouchableOpacity>
          <View style={styles.dateDisplay}>
            <Text style={styles.dateText}>{formatDateDisplay(selectedDate)}</Text>
            <Text style={styles.dateSubtext}>
              {selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.dateNavButton}
            onPress={() => navigateDate('next')}
            disabled={selectedDate.toDateString() === new Date().toDateString()}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={selectedDate.toDateString() === new Date().toDateString() ? "#C7C7CC" : "#007AFF"} 
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Timeline List - Only show if location_history exists */}
      {targetUserId && hasLocationHistory && (
        <ScrollView 
          style={styles.timelineContainer}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={styles.timelineContent}
        >
          {historyLoading ? (
            <View style={styles.timelineLoading}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.timelineLoadingText}>Loading timeline...</Text>
            </View>
          ) : locationHistory.length === 0 ? (
            <View style={styles.timelineEmpty}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="location-outline" size={48} color="#C7C7CC" />
              </View>
              <Text style={styles.timelineEmptyTitle}>No Location History</Text>
              <Text style={styles.timelineEmptyText}>
                No location data for {formatDateDisplay(selectedDate).toLowerCase()}
              </Text>
            </View>
          ) : (
            <View style={styles.timelineList}>
              {locationHistory.map((item, index) => {
                const isFirst = index === 0;
                const isLast = index === locationHistory.length - 1;
                const prevItem = index > 0 ? locationHistory[index - 1] : null;
                
                const distance = prevItem 
                  ? calculateDistance(
                      prevItem.latitude,
                      prevItem.longitude,
                      item.latitude,
                      item.longitude
                    )
                  : 0;
                
                const timeDiff = prevItem 
                  ? calculateTimeDiff(prevItem.timestamp, item.timestamp)
                  : 0;

                const isActivity = prevItem && distance > 10; // 10 meters in meters (was 0.01 km)
                const isSelected = selectedHistoryItem === index;
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.timelineCard,
                      isSelected && styles.timelineCardSelected
                    ]}
                    onPress={() => {
                      setSelectedHistoryItem(index);
                      focusOnLocation(item.latitude, item.longitude);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.timelineCardContent}>
                      <View style={styles.timelineLeft}>
                        <View style={[
                          styles.timelineDot,
                          isActivity && styles.timelineDotActivity,
                          isSelected && styles.timelineDotSelected
                        ]}>
                          {isActivity ? (
                            <Ionicons name="walk" size={12} color="#FFFFFF" />
                          ) : (
                            <View style={styles.timelineDotInner} />
                          )}
                        </View>
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>

                      <View style={styles.timelineRight}>
                        {isActivity && prevItem ? (
                          <>
                            <View style={styles.timelineHeader}>
                              <View style={styles.activityBadge}>
                                <Ionicons name="walk" size={14} color="#34C759" />
                                <Text style={styles.activityBadgeText}>Movement</Text>
                              </View>
                              <Text style={styles.timelineTime}>
                                {formatTimeRange(prevItem.timestamp, item.timestamp)}
                              </Text>
                            </View>
                            <View style={styles.activityStats}>
                              <View style={styles.statItem}>
                                <Ionicons name="resize" size={14} color="#8E8E93" />
                                <Text style={styles.statText}>
                                  {distance < 1 
                                    ? '< 1 m' 
                                    : distance < 1000 
                                      ? `${distance.toFixed(0)} m`
                                      : `${(distance / 1000).toFixed(2)} km`}
                                </Text>
                              </View>
                              <View style={styles.statItem}>
                                <Ionicons name="time-outline" size={14} color="#8E8E93" />
                                <Text style={styles.statText}>{formatDuration(timeDiff)}</Text>
                              </View>
                            </View>
                            <Text style={styles.timelineCoordinates}>
                              {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                            </Text>
                          </>
                        ) : (
                          <>
                            <View style={styles.timelineHeader}>
                              <Text style={styles.timelineTitle}>
                                {item.address ? item.address.split(',')[0] : 'Unknown Location'}
                              </Text>
                              <Text style={styles.timelineTime}>
                                {new Date(item.timestamp).toLocaleTimeString([], {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                }).toLowerCase()}
                              </Text>
                            </View>
                            {item.address && (
                              <Text style={styles.timelineAddress} numberOfLines={2}>
                                {item.address}
                              </Text>
                            )}
                            <Text style={styles.timelineCoordinates}>
                              {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                            </Text>
                            <View style={styles.timelineFooter}>
                              <Text style={styles.timelineStatus}>
                                {isFirst ? '📍 Arrived' : '🚶 Left'}
                              </Text>
                              <Text style={styles.timelineDate}>
                                {formatTime(item.timestamp)}
                              </Text>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  pendingBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    zIndex: 1,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  pendingBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  mapSection: {
    height: SCREEN_HEIGHT * 0.45,
    width: '100%',
    backgroundColor: '#E5E5EA',
  },
  map: {
    flex: 1,
  },
  destinationPin: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    backgroundColor: 'transparent',
  },
  destinationPinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#FF3B30',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  userLocationPin: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    backgroundColor: 'transparent',
  },
  userLocationPinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  historyMarkerContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  historyMarkerSelected: {
    width: 28,
    height: 28,
  },
  historyMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  locateButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  locateButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  offlineBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  mapErrorContainer: {
    position: 'absolute',
    top: '40%',
    left: '10%',
    right: '10%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  mapErrorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginTop: 8,
    textAlign: 'center',
  },
  mapErrorSubtext: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'center',
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  dateNavButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#F5F5F7',
  },
  dateDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
  },
  dateSubtext: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  timelineContainer: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  timelineContent: {
    paddingBottom: 20,
  },
  timelineLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  timelineLoadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#8E8E93',
  },
  timelineEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  timelineEmptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  timelineEmptyText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  timelineList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  timelineCardSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOpacity: 0.2,
      },
    }),
  },
  timelineCardContent: {
    flexDirection: 'row',
    padding: 16,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  timelineDotActivity: {
    backgroundColor: '#34C759',
  },
  timelineDotSelected: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 4,
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  timelineLine: {
    position: 'absolute',
    left: 11,
    top: 24,
    width: 2,
    backgroundColor: '#E5E5EA',
    flex: 1,
    minHeight: 40,
  },
  timelineRight: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  timelineTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    flex: 1,
    letterSpacing: -0.3,
  },
  timelineTime: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  timelineAddress: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginBottom: 8,
  },
  timelineCoordinates: {
    fontSize: 11,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 8,
  },
  timelineFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  timelineStatus: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
  timelineDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  activityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  activityBadgeText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
  },
  activityStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
