import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { useIncidents } from '../context/IncidentContext';
import { useAuth } from '../context/AuthContext';
import { locationService } from '../services/locationService';
import { supabase } from '../lib/supabase';
import type { RootStackParamList, Location } from '../types';

type MapScreenRouteProp = RouteProp<RootStackParamList, 'MapView'>;
type MapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'MapView'>;

interface MapScreenProps {
  route: MapScreenRouteProp;
  navigation: MapScreenNavigationProp;
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const HISTORY_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;
const HISTORY_SHEET_MIN_HEIGHT = 100;

export default function MapScreen({ route, navigation }: MapScreenProps) {
  const { location, title, showUserLocation = true, userId } = route.params;
  const { userLocation: incidentUserLocation } = useIncidents();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);
  
  // Use passed userId if provided, otherwise use current user's id
  const targetUserId = userId || user?.id;
  
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [locationHistory, setLocationHistory] = useState<Array<Location & { timestamp: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<number | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });


  useEffect(() => {
    if (showUserLocation) {
      const fetchUserLocation = async () => {
        try {
          const currentLocation = await locationService.getCurrentLocation();
          if (currentLocation) {
            setUserLocation(currentLocation);
          } else if (incidentUserLocation) {
            setUserLocation(incidentUserLocation);
          }
        } catch (error) {
          console.error('Error fetching user location:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchUserLocation();
    } else {
      setLoading(false);
    }
  }, [showUserLocation, incidentUserLocation]);

  // Fetch location history for selected date
  const fetchLocationHistory = async (date: Date) => {
    if (!targetUserId) {
      return;
    }

    setHistoryLoading(true);
    try {
      // Get start and end of selected date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Calculate hours from now to start of day (to fetch enough data)
      const now = new Date();
      const hoursSinceStartOfDay = Math.ceil((now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60));
      // Add some buffer (fetch 7 days worth to ensure we get all data for the selected date)
      const hoursToFetch = Math.max(hoursSinceStartOfDay, 168); // 168 hours = 7 days

      // Fetch history
      const allHistory = await locationService.getLocationHistory(targetUserId, hoursToFetch);
      
      // Filter by selected date
      let filteredHistory = allHistory.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate >= startOfDay && itemDate <= endOfDay;
      });

      // Sort by timestamp descending (most recent first)
      filteredHistory.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Try to fetch addresses for entries without addresses (in background, don't block)
      const entriesWithoutAddress = filteredHistory.filter(item => !item.address);
      if (entriesWithoutAddress.length > 0) {
        // Fetch addresses for entries without addresses (limit to first 10 to avoid too many requests)
        Promise.all(
          entriesWithoutAddress.slice(0, 10).map(async (item) => {
            try {
              const address = await locationService.reverseGeocode(
                item.latitude,
                item.longitude
              );
              if (address) {
                // Update the address in the history array
                const index = filteredHistory.findIndex(
                  h => h.latitude === item.latitude && 
                       h.longitude === item.longitude && 
                       h.timestamp === item.timestamp
                );
                if (index !== -1) {
                  filteredHistory[index].address = address;
                  // Update state
                  setLocationHistory([...filteredHistory]);
                }
              }
            } catch (error) {
              // Silently fail - address fetching is optional
            }
          })
        ).catch(() => {
          // Silently fail
        });
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
  }, [targetUserId, selectedDate]);

  // Set up real-time subscription for location history
  useEffect(() => {
    if (!targetUserId) {
      return;
    }

    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    // Subscribe to location_history table changes
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
          console.log('New location history entry received:', payload);
          
          // Check if the new entry is for the selected date
          const newEntry = payload.new;
          if (newEntry && newEntry.created_at) {
            const entryDate = new Date(newEntry.created_at);
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);

            // Only add if it's for the selected date
            if (entryDate >= startOfDay && entryDate <= endOfDay) {
              const newLocation: Location & { timestamp: string } = {
                latitude: newEntry.latitude,
                longitude: newEntry.longitude,
                address: newEntry.address || undefined,
                timestamp: newEntry.created_at,
              };

              // Add to the beginning of the array (most recent first)
              setLocationHistory((prev) => [newLocation, ...prev]);
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
          console.log('Location history entry deleted:', payload);
          // Remove from local state if it exists
          if (payload.old && payload.old.id) {
            setLocationHistory((prev) => 
              prev.filter((item) => {
                // Since we don't have id in our Location type, we'll match by timestamp and coordinates
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to location_history real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to location_history real-time updates');
        }
      });

    realtimeChannelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [targetUserId, selectedDate]);

  // Refresh location history when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      if (targetUserId) {
        fetchLocationHistory(selectedDate);
      }
    }, [targetUserId, selectedDate])
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
        latitudeDelta: Math.max(latDelta, 0.01),
        longitudeDelta: Math.max(lngDelta, 0.01),
      });
    }
  }, [userLocation, location, showUserLocation]);

  const polylineCoordinates = useMemo(() => {
    // Always show location history polyline, regardless of showUserLocation
    const coordinates = locationHistory.length > 0
      ? [...locationHistory].reverse().map((loc) => ({
          latitude: loc.latitude,
          longitude: loc.longitude,
        }))
      : [];
    
    // Only add current user location if showUserLocation is true
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

  const formatFullTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
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

  // Calculate time difference in seconds
  const calculateTimeDiff = (timestamp1: string, timestamp2: string): number => {
    const date1 = new Date(timestamp1);
    const date2 = new Date(timestamp2);
    return Math.abs(date2.getTime() - date1.getTime()) / 1000; // in seconds
  };

  // Format date for display
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

  // Navigate to previous/next day
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  // Calculate summary statistics
  const calculateSummary = () => {
    if (locationHistory.length === 0) {
      return { totalDistance: 0, totalTime: 0, visits: 0 };
    }

    let totalDistance = 0;
    let totalTime = 0;
    const visits = new Set<string>();

    for (let i = 1; i < locationHistory.length; i++) {
      const prev = locationHistory[i - 1];
      const curr = locationHistory[i];
      
      const distance = calculateDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude
      );
      totalDistance += distance;

      const timeDiff = calculateTimeDiff(prev.timestamp, curr.timestamp);
      totalTime += timeDiff;

      // Count unique locations (visits)
      const locationKey = `${curr.latitude.toFixed(4)},${curr.longitude.toFixed(4)}`;
      visits.add(locationKey);
    }

    return {
      totalDistance,
      totalTime,
      visits: visits.size + 1, // +1 for first location
    };
  };

  const summary = calculateSummary();

  // Format time for activity entries
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

  // Format activity duration
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const focusOnLocation = (lat: number, lng: number) => {
    const newRegion: Region = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    
    mapRef.current?.animateToRegion(newRegion, 500);
    setMapRegion(newRegion);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title || 'Location Timeline'}</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Map View - Top Section */}
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
          onRegionChangeComplete={(region) => {
            if (region) {
              setMapRegion(region);
            }
          }}
        >
          {/* Location History Polyline */}
          {polylineCoordinates.length > 1 && (
            <Polyline
              coordinates={polylineCoordinates}
              strokeColor="#007AFF"
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {/* History Location Markers */}
          {locationHistory.length > 0 && 
            locationHistory.map((item, index) => (
              <Marker
                key={index}
                coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => {
                  setSelectedHistoryItem(index);
                  focusOnLocation(item.latitude, item.longitude);
                }}
              >
                <View style={[
                  styles.timelineMarker,
                  selectedHistoryItem === index && styles.timelineMarkerSelected
                ]}>
                  <View style={styles.timelineMarkerDot} />
                </View>
              </Marker>
            ))
          }

          {/* Destination Marker */}
          <Marker
            coordinate={location}
            title={title || 'Location'}
            description={location.address || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.destinationMarker}>
              <View style={styles.destinationMarkerInner}>
                <Ionicons name="location" size={28} color="#FF3B30" />
              </View>
            </View>
          </Marker>
        </MapView>
      </View>

      {/* Date Selector */}
      {targetUserId && (
        <View style={styles.dateSelector}>
          <TouchableOpacity
            style={styles.dateNavButton}
            onPress={() => navigateDate('prev')}
          >
            <Ionicons name="chevron-back" size={20} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateDisplay}>
            <Text style={styles.dateDisplayText}>{formatDateDisplay(selectedDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateNavButton}
            onPress={() => navigateDate('next')}
            disabled={selectedDate.toDateString() === new Date().toDateString()}
          >
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={selectedDate.toDateString() === new Date().toDateString() ? "#C7C7CC" : "#007AFF"} 
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Summary Statistics */}
      {targetUserId && locationHistory.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Ionicons name="walk" size={18} color="#8E8E93" />
            <Text style={styles.summaryText}>
              {summary.totalDistance < 0.001 
                ? '< 1 m' 
                : summary.totalDistance < 1 
                  ? `${(summary.totalDistance * 1000).toFixed(0)} m`
                  : `${summary.totalDistance.toFixed(2)} km`}
            </Text>
            {summary.totalTime > 0 && (
              <Text style={styles.summarySubtext}>
                {formatDuration(summary.totalTime)}
              </Text>
            )}
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="location" size={18} color="#8E8E93" />
            <Text style={styles.summaryText}>
              {summary.visits} {summary.visits === 1 ? 'visit' : 'visits'}
            </Text>
          </View>
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
              <Ionicons name="location-outline" size={48} color="#C7C7CC" />
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
                
                // Calculate activity info
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

                // Determine if this is a location entry or activity entry
                const isActivity = prevItem && distance > 0.01; // More than 10m movement
                
                return (
                  <View key={index} style={styles.timelineItem}>
                    {/* Timeline Line and Dot */}
                    <View style={styles.timelineIndicator}>
                      {!isLast && <View style={styles.timelineLine} />}
                      <View style={[
                        styles.timelineDot,
                        isActivity && styles.timelineDotActivity
                      ]}>
                        {isActivity ? (
                          <Ionicons name="walk" size={12} color="#FFFFFF" />
                        ) : (
                          <View style={styles.timelineDotInner} />
                        )}
                      </View>
                    </View>

                    {/* Timeline Content */}
                    <View style={styles.timelineItemContent}>
                      {isActivity && prevItem ? (
                        // Activity Entry (Walking/Moving)
                        <TouchableOpacity
                          style={styles.timelineActivityEntry}
                          onPress={() => {
                            setSelectedHistoryItem(index);
                            focusOnLocation(item.latitude, item.longitude);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.timelineActivityHeader}>
                            <Ionicons name="walk" size={16} color="#34C759" />
                            <Text style={styles.timelineActivityType}>Walking</Text>
                          </View>
                          <View style={styles.timelineActivityDetails}>
                            <Text style={styles.timelineActivityDistance}>
                              {distance < 0.001 
                                ? '< 1 m' 
                                : distance < 1 
                                  ? `${(distance * 1000).toFixed(0)} m`
                                  : `${distance.toFixed(2)} km`}
                            </Text>
                            <Text style={styles.timelineActivityDuration}>
                              {formatDuration(timeDiff)}
                            </Text>
                          </View>
                          <Text style={styles.timelineActivityCoordinates}>
                            {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                          </Text>
                          <Text style={styles.timelineActivityTime}>
                            {formatTimeRange(prevItem.timestamp, item.timestamp)}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        // Location Entry
                        <TouchableOpacity
                          style={styles.timelineLocationEntry}
                          onPress={() => {
                            setSelectedHistoryItem(index);
                            focusOnLocation(item.latitude, item.longitude);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.timelineLocationTitle}>
                            {item.address ? item.address.split(',')[0] : 'Unknown Location'}
                          </Text>
                          {item.address && (
                            <Text style={styles.timelineLocationAddress} numberOfLines={2}>
                              {item.address}
                            </Text>
                          )}
                          <Text style={styles.timelineLocationCoordinates}>
                            {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                          </Text>
                          <Text style={styles.timelineLocationTime}>
                            {isFirst ? 'Arrived' : 'Left'} at {new Date(item.timestamp).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            }).toLowerCase()}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
    textAlign: 'center',
  },
  historyHeaderButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  historyBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  historyBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  mapSection: {
    height: SCREEN_HEIGHT * 0.4, // 40% of screen height
    width: '100%',
  },
  map: {
    flex: 1,
  },
  mapInfoCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
    minWidth: 140,
  },
  mapInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapInfoText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  mapInfoDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 8,
  },
  destinationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationMarkerInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
    borderWidth: 3,
    borderColor: '#FF3B30',
  },
  userMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  historyMapMarker: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyMapMarkerSelected: {
    width: 28,
    height: 28,
  },
  historyMapMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  overlayTouchable: {
    flex: 1,
  },
  historySheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: HISTORY_SHEET_MAX_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  sheetHandleContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#C7C7CC',
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  sheetHeaderContent: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '400',
  },
  sheetCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
  },
  timeFilterContainer: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  timeFilterScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  timeFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  timeFilterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  timeFilterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  timeFilterTextActive: {
    color: '#FFFFFF',
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    paddingBottom: 20,
  },
  historyLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  historyLoadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#8E8E93',
  },
  emptyHistoryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyHistoryIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyHistoryTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  emptyHistoryText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  historyItemSelected: {
    backgroundColor: '#F0F9FF',
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  historyItemTimeline: {
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  historyItemBadge: {
    position: 'absolute',
    top: -10,
    left: -24,
    backgroundColor: '#007AFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 1,
  },
  historyItemBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  historyItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyItemIconActive: {
    backgroundColor: '#007AFF',
  },
  historyItemLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E5EA',
    marginTop: 4,
    minHeight: 40,
  },
  historyItemContent: {
    flex: 1,
    gap: 12,
  },
  historyItemTimeContainer: {
    marginBottom: 4,
  },
  historyItemTimeMain: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  historyItemDateTime: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '400',
  },
  historyItemAddressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  historyItemAddress: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
    lineHeight: 20,
  },
  historyItemCoordinatesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  historyItemCoordinatesText: {
    fontSize: 11,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  historyItemMovementContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  historyItemMovementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyItemMovementText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  historyItemAction: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historySection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  historySectionHeaderLeft: {
    flex: 1,
  },
  historySectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  historySectionSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  historySectionExpandButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F0F9FF',
  },
  historySectionTimeFilters: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  historySectionTimeFilterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  historySectionTimeFilterButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  historySectionTimeFilterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  historySectionTimeFilterText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  historySectionTimeFilterTextActive: {
    color: '#FFFFFF',
  },
  historySectionLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  historySectionLoadingText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  historySectionEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  historySectionEmptyText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  historySectionList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  historySectionItem: {
    width: 140,
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  historySectionItemIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  historySectionItemIconActive: {
    backgroundColor: '#007AFF',
  },
  historySectionItemTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  historySectionItemAddress: {
    fontSize: 11,
    color: '#8E8E93',
    lineHeight: 16,
  },
  historySectionViewAll: {
    width: 140,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historySectionViewAllContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historySectionViewAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#007AFF',
  },
  // New Timeline Styles
  map: {
    flex: 1,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  dateNavButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  dateDisplayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  summarySubtext: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 4,
  },
  timelineContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  timelineEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
  },
  timelineEmptyText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  timelineList: {
    paddingHorizontal: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  timelineIndicator: {
    width: 24,
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 11,
    top: 24,
    width: 2,
    backgroundColor: '#007AFF',
    flex: 1,
    minHeight: 40,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  timelineDotActivity: {
    backgroundColor: '#34C759',
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  timelineItemContent: {
    flex: 1,
    paddingBottom: 16,
  },
  timelineLocationEntry: {
    paddingVertical: 8,
  },
  timelineLocationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  timelineLocationAddress: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginBottom: 4,
  },
  timelineLocationTime: {
    fontSize: 13,
    color: '#8E8E93',
  },
  timelineLocationCoordinates: {
    fontSize: 12,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
    marginBottom: 4,
  },
  timelineActivityEntry: {
    paddingVertical: 8,
  },
  timelineActivityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  timelineActivityType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  timelineActivityDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  timelineActivityDistance: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  timelineActivityDuration: {
    fontSize: 14,
    color: '#8E8E93',
  },
  timelineActivityCoordinates: {
    fontSize: 12,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
    marginBottom: 4,
  },
  timelineActivityTime: {
    fontSize: 13,
    color: '#8E8E93',
  },
  timelineMarker: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineMarkerSelected: {
    width: 24,
    height: 24,
  },
});

