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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
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
  
  const targetUserId = userId || user?.id;
  
  const [userLocation, setUserLocation] = useState<Location | null>(null);
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
  const realtimeChannelRef = useRef<any>(null);
  const pendingUpdatesRef = useRef<Array<Location & { timestamp: string }>>([]);
  const locationWatchSubscriptionRef = useRef<ExpoLocation.LocationSubscription | null>(null);
  
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.002,
    longitudeDelta: 0.002,
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

  useEffect(() => {
    if (showUserLocation) {
      const fetchUserLocation = async () => {
        try {
          // Check if location services are enabled (especially important on iOS)
          const servicesEnabled = await ExpoLocation.hasServicesEnabledAsync();
          if (!servicesEnabled) {
            console.warn('Location services are disabled. Please enable them in Settings.');
            setLoading(false);
            return;
          }

          // Request permissions first
          const permissionResult = await locationService.requestPermissions();
          if (!permissionResult.granted) {
            console.warn('Location permission not granted:', permissionResult.message);
            setLoading(false);
            return;
          }

          if (location && location.latitude && location.longitude) {
            setUserLocation(location);
            const initialRegion = {
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: Platform.OS === 'ios' ? 0.0005 : 0.001,
              longitudeDelta: Platform.OS === 'ios' ? 0.0005 : 0.001,
            };
            setMapRegion(initialRegion);
            setTimeout(() => {
              if (mapRef.current) {
                mapRef.current.animateToRegion(initialRegion, 1000);
              }
            }, 500);
          }
          
          // Use high accuracy location for exact positioning
          // On iOS, request location with best accuracy
          const currentLocation = await locationService.getHighAccuracyLocation(true);
          if (currentLocation) {
            setUserLocation(currentLocation);
            
            // Log location accuracy for debugging
            if (__DEV__) {
              console.log('Initial location fetched:', {
                lat: currentLocation.latitude.toFixed(6),
                lng: currentLocation.longitude.toFixed(6),
                platform: Platform.OS,
              });
            }
            
            if (!location || (!location.latitude && !location.longitude)) {
              const currentRegion = {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: Platform.OS === 'ios' ? 0.002 : 0.005, // Tighter zoom on iOS
                longitudeDelta: Platform.OS === 'ios' ? 0.002 : 0.005,
              };
              setMapRegion(currentRegion);
              setTimeout(() => {
                if (mapRef.current) {
                  mapRef.current.animateToRegion(currentRegion, 1000);
                }
              }, 500);
            }
          } else if (incidentUserLocation && (!location || (!location.latitude && !location.longitude))) {
            setUserLocation(incidentUserLocation);
          }

          // Start watching location changes for real-time updates
          // Use iOS-specific settings for better accuracy
          if (locationWatchSubscriptionRef.current) {
            locationWatchSubscriptionRef.current.remove();
          }

          // iOS needs more frequent updates and better accuracy settings
          // Use maximumAge: 0 to prevent cached location data on iOS
          const watchOptions = Platform.OS === 'ios' 
            ? {
                accuracy: ExpoLocation.Accuracy.BestForNavigation, // Best accuracy for iOS
                timeInterval: 2000, // Update every 2 seconds on iOS for real-time tracking
                distanceInterval: 1, // Update every 1 meter on iOS for precise tracking
                mayShowUserSettings: false, // Don't show settings dialog
              }
            : {
                accuracy: ExpoLocation.Accuracy.Highest,
                timeInterval: 5000, // Update every 5 seconds on Android
                distanceInterval: 5, // Update every 5 meters on Android
              };

          locationWatchSubscriptionRef.current = await ExpoLocation.watchPositionAsync(
            watchOptions,
            (newLocation) => {
              const updatedLocation: Location = {
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
                address: userLocation?.address, // Preserve address
              };
              setUserLocation(updatedLocation);
              
              // Log accuracy for debugging
              if (__DEV__) {
                console.log('Location updated:', {
                  lat: updatedLocation.latitude.toFixed(6),
                  lng: updatedLocation.longitude.toFixed(6),
                  accuracy: newLocation.coords.accuracy,
                  platform: Platform.OS,
                });
              }
            }
          );
        } catch (error) {
          console.error('Error fetching user location:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchUserLocation();

      // Cleanup location watch on unmount
      return () => {
        if (locationWatchSubscriptionRef.current) {
          locationWatchSubscriptionRef.current.remove();
          locationWatchSubscriptionRef.current = null;
        }
      };
    } else {
      setLoading(false);
    }
  }, [showUserLocation, incidentUserLocation, location]);

  const fetchLocationHistory = async (date: Date) => {
    if (!targetUserId) return;

    setHistoryLoading(true);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      const now = new Date();
      const hoursSinceStartOfDay = Math.ceil((now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60));
      const hoursToFetch = Math.max(hoursSinceStartOfDay, 168);

      const allHistory = await locationService.getLocationHistory(targetUserId, hoursToFetch);
      let filteredHistory = allHistory.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= startOfDay && itemDate <= endOfDay;
      });

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
    } catch (error) {
      console.error('Error fetching location history:', error);
      setLocationHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchLocationHistory(selectedDate);
    pendingUpdatesRef.current = [];
    setPendingUpdatesCount(0);
  }, [targetUserId, selectedDate]);

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
    if (userLocation && showUserLocation) {
      const minLat = Math.min(location.latitude, userLocation.latitude);
      const maxLat = Math.max(location.latitude, userLocation.latitude);
      const minLng = Math.min(location.longitude, userLocation.longitude);
      const maxLng = Math.max(location.longitude, userLocation.longitude);
      const latDelta = (maxLat - minLat) * 1.5;
      const lngDelta = (maxLng - minLng) * 1.5;
      setMapRegion({
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(latDelta, Platform.OS === 'ios' ? 0.0005 : 0.001),
        longitudeDelta: Math.max(lngDelta, Platform.OS === 'ios' ? 0.0005 : 0.001),
      });
    }
  }, [userLocation, location, showUserLocation]);

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

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
    const newRegion: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: Platform.OS === 'ios' ? 0.0003 : 0.0005,
      longitudeDelta: Platform.OS === 'ios' ? 0.0003 : 0.0005,
    };
    mapRef.current?.animateToRegion(newRegion, 500);
    setMapRegion(newRegion);
  }, []);

  const handleRefreshLocation = async (): Promise<void> => {
    try {
      setLoading(true);
      // Request permission if needed
      const permissionResult = await locationService.requestPermissions();
      if (!permissionResult.granted) {
        console.warn('Location permission not granted:', permissionResult.message);
        setLoading(false);
        return;
      }
      
      // Get the actual current location with high accuracy
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
          latitudeDelta: Platform.OS === 'ios' ? 0.0003 : 0.0005, // Very tight zoom for exact location
          longitudeDelta: Platform.OS === 'ios' ? 0.0003 : 0.0005,
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
          mapType="hybrid"
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
          {polylineCoordinates.length > 1 && (
            <Polyline
              coordinates={polylineCoordinates}
              strokeColor="#007AFF"
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {historyMarkers}
          {userLocation && (
            <Marker
              key={`user-location-${userLocation.latitude}-${userLocation.longitude}`}
              coordinate={{
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
              }}
              title="Your Location"
              description={userLocation.address || `Your exact location: ${userLocation.latitude.toFixed(6)}, ${userLocation.longitude.toFixed(6)}`}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
              flat={false}
              zIndex={1000}
              onPress={() => {
                focusOnLocation(userLocation.latitude, userLocation.longitude);
              }}
            >
              <View style={styles.userLocationPin} pointerEvents="none" collapsable={false}>
                <View style={styles.userLocationPinHead} collapsable={false}>
                  <Ionicons name="location" size={20} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          )}
          <Marker
            key={`destination-${location.latitude}-${location.longitude}`}
            coordinate={location}
            title={title || 'Location'}
            description={location.address || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={tracksViewChanges}
            flat={false}
            zIndex={999}
            onPress={() => {
              focusOnLocation(location.latitude, location.longitude);
            }}
          >
            <View style={styles.destinationPin} pointerEvents="none" collapsable={false}>
              <View style={styles.destinationPinHead} collapsable={false}>
                <Ionicons name="location" size={20} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
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
      </View>

      {/* Date Selector Card */}
      {targetUserId && (
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

      {/* Timeline List */}
      {targetUserId && (
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

                const isActivity = prevItem && distance > 0.01;
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
                                  {distance < 0.001 
                                    ? '< 1 m' 
                                    : distance < 1 
                                      ? `${(distance * 1000).toFixed(0)} m`
                                      : `${distance.toFixed(2)} km`}
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
