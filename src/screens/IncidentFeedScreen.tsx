import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useIncidents } from '../context/IncidentContext';
import { useAppSetting } from '../context/AppSettingContext';
import { locationService } from '../services/locationService';
import { incidentProximityService } from '../services/incidentProximityService';
import { supabase } from '../lib/supabase';
import type { MainTabParamList, RootStackParamList, Incident, TimeFilter, DistanceFilter } from '../types';

type IncidentFeedScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Incidents'>,
  StackNavigationProp<RootStackParamList>
>;

interface IncidentFeedScreenProps {
  navigation: IncidentFeedScreenNavigationProp;
}

type ViewMode = 'list' | 'map';

// Define time filters locally
const timeFilters: TimeFilter[] = [
  { label: '5 min', value: '5min' },
  { label: '30 min', value: '30min' },
  { label: '1 hr', value: '1hr' },
  { label: '24 hr', value: '24hr' },
];

// Define distance filters locally
const distanceFilters: DistanceFilter[] = [
  { label: '1 km', value: 1 },
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: 'City', value: 50 },
];

export default function IncidentFeedScreen({ navigation }: IncidentFeedScreenProps) {
  const { incidents, fetchNearbyIncidents, userLocation, setUserLocation, calculateDistance, loading } = useIncidents();
  const { hideReportIncident } = useAppSetting();
  const [timeFilter, setTimeFilter] = useState<string>('1hr');
  const [distanceFilter, setDistanceFilter] = useState<number>(5);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [locationFetched, setLocationFetched] = useState<boolean>(false);

  // Fetch user's actual location when screen loads
  useEffect(() => {
    const loadUserLocation = async () => {
      try {
        // Check if we have permission
        const hasPermission = await locationService.checkPermissions();
        if (hasPermission) {
          // Get current location (don't request permission if not granted)
          const location = await locationService.getCurrentLocation(false);
          if (location) {
            setUserLocation(location);
            setLocationFetched(true);
            console.log('User location loaded for incident feed:', location);
          } else {
            // If location unavailable, still try to fetch with default location
            setLocationFetched(true);
            console.log('Location unavailable, using default location');
          }
        } else {
          // No permission, use default location but still fetch
          setLocationFetched(true);
          console.log('Location permission not granted, using default location');
        }
      } catch (error) {
        console.error('Error loading user location:', error);
        setLocationFetched(true); // Still try to fetch with default location
      }
    };

    loadUserLocation();
  }, [setUserLocation]);

  // Fetch incidents when filters or user location changes
  useEffect(() => {
    // Only fetch if location has been checked (either fetched or determined unavailable)
    if (locationFetched && userLocation.latitude && userLocation.longitude) {
      console.log(`Fetching incidents: timeFilter=${timeFilter}, distanceFilter=${distanceFilter}km`);
      fetchNearbyIncidents(timeFilter, distanceFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter, distanceFilter, userLocation.latitude, userLocation.longitude, locationFetched]);

  // Start incident proximity checking service
  useEffect(() => {
    // Start periodic checking for incident proximity (checks every 15 minutes)
    incidentProximityService.startPeriodicChecking();

    return () => {
      // Stop periodic checking when component unmounts
      incidentProximityService.stopPeriodicChecking();
    };
  }, []);

  // Set up real-time subscription for incidents
  useEffect(() => {
    if (!locationFetched) return; // Wait for location to be fetched first

    console.log('Setting up real-time subscription for incidents');

    // Create a unique channel name for this screen instance
    const channelName = `incident_feed_${Date.now()}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'incidents',
        },
        async (payload) => {
          const incidentId = (payload.new as any)?.id || (payload.old as any)?.id;
          const eventType = payload.eventType;
          console.log('Real-time incident change detected:', eventType, incidentId);
          
          // Refresh incidents when changes occur (with current filters)
          if (locationFetched && userLocation.latitude && userLocation.longitude) {
            console.log('Refreshing incidents due to real-time update');
            fetchNearbyIncidents(timeFilter, distanceFilter);
          }

          // Trigger proximity check when a new incident is created
          // This ensures users get notified immediately if they're near the new incident
          if (eventType === 'INSERT' && payload.new) {
            console.log('New incident created, triggering proximity check...');
            // Trigger proximity check to notify nearby users
            incidentProximityService.triggerCheck().catch((error) => {
              console.error('Error triggering incident proximity check:', error);
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to incidents real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to incidents real-time updates');
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Incidents real-time subscription timed out');
        } else if (status === 'CLOSED') {
          console.log('Incidents real-time subscription closed');
        }
      });

    return () => {
      console.log('Cleaning up real-time subscription for incidents');
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFetched, timeFilter, distanceFilter, userLocation.latitude, userLocation.longitude]);

  // Use incidents directly from context (already filtered by proximity and time)
  const nearbyIncidents = incidents;

  const getTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now.getTime() - time.getTime()) / 1000 / 60);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
      Robbery: 'shield-outline',
      Kidnapping: 'warning-outline',
      Accident: 'car-outline',
      Fire: 'flame-outline',
      Protest: 'people-outline',
      Assault: 'hand-left-outline',
      Theft: 'bag-outline',
      Other: 'alert-circle-outline',
    };
    return icons[category] || 'alert-circle-outline';
  };

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      Robbery: '#FF3B30',
      Kidnapping: '#FF9500',
      Accident: '#FFCC00',
      Fire: '#FF3B30',
      Protest: '#007AFF',
      Assault: '#FF3B30',
      Theft: '#8E8E93',
      Other: '#8E8E93',
    };
    return colors[category] || '#8E8E93';
  };

  const renderIncidentCard = ({ item }: { item: Incident }) => {
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      item.location.latitude,
      item.location.longitude
    );

    return (
      <TouchableOpacity
        style={styles.incidentCard}
        onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.categoryIcon, { backgroundColor: getCategoryColor(item.category) + '20' }]}>
            <Ionicons
              name={getCategoryIcon(item.category)}
              size={24}
              color={getCategoryColor(item.category)}
            />
          </View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.cardMeta}>
              <Text style={styles.cardTime}>{getTimeAgo(item.createdAt)}</Text>
              <Text style={styles.cardDistance}>• {distance.toFixed(1)} km away</Text>
            </View>
          </View>
          {item.confirmed && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            </View>
          )}
        </View>
        <Text style={styles.cardDescription} numberOfLines={2}>
          {item.description}
        </Text>
        
        {/* Location Information */}
        {item.location.address || (item.location.latitude && item.location.longitude) ? (
          <View style={styles.locationInfo}>
            <Ionicons name="location" size={14} color="#8E8E93" />
            <View style={styles.locationDetails}>
              {item.location.address ? (
                <Text style={styles.locationAddress} numberOfLines={1}>
                  {item.location.address}
                </Text>
              ) : null}
              <Text style={styles.locationCoordinates}>
                {item.location.latitude.toFixed(6)}, {item.location.longitude.toFixed(6)}
              </Text>
            </View>
          </View>
        ) : null}
        
        <View style={styles.cardFooter}>
          <View style={styles.upvoteButton}>
            <Ionicons name="arrow-up" size={16} color="#8E8E93" />
            <Text style={styles.upvoteCount}>{item.upvotes}</Text>
          </View>
          <Text style={styles.reporterText}>
            {item.reporter.isAnonymous ? 'Anonymous' : item.reporter.name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Safety Feed</Text>
        {!hideReportIncident && (
          <TouchableOpacity
            onPress={() => navigation.navigate('ReportIncident')}
            style={styles.reportButton}
          >
            <Ionicons name="add-circle" size={28} color="#007AFF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeFilters}>
          {timeFilters.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              style={[
                styles.filterChip,
                timeFilter === filter.value && styles.filterChipActive,
              ]}
              onPress={() => setTimeFilter(filter.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  timeFilter === filter.value && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewButton, viewMode === 'list' && styles.viewButtonActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons
              name="list"
              size={20}
              color={viewMode === 'list' ? '#007AFF' : '#8E8E93'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewButton, viewMode === 'map' && styles.viewButtonActive]}
            onPress={() => setViewMode('map')}
          >
            <Ionicons
              name="map"
              size={20}
              color={viewMode === 'map' ? '#007AFF' : '#8E8E93'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {viewMode === 'map' ? (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
        >
          <Marker
            coordinate={userLocation}
            title="You"
          >
            <View style={styles.userMarker}>
              <Ionicons name="person" size={16} color="#FFFFFF" />
            </View>
          </Marker>

          {nearbyIncidents.map((incident) => (
            <Marker
              key={incident.id}
              coordinate={{
                latitude: incident.location.latitude,
                longitude: incident.location.longitude,
              }}
              title={incident.title}
              description={incident.location.address || `${incident.location.latitude.toFixed(6)}, ${incident.location.longitude.toFixed(6)}`}
              onPress={() => navigation.navigate('IncidentDetail', { incident })}
            >
              <View style={[styles.incidentMarker, { backgroundColor: getCategoryColor(incident.category) }]}>
                <Ionicons
                  name={getCategoryIcon(incident.category)}
                  size={16}
                  color="#FFFFFF"
                />
              </View>
            </Marker>
          ))}
        </MapView>
      ) : (
        <View style={styles.content}>
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Loading incidents...</Text>
            </View>
          ) : nearbyIncidents.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#34C759" />
              <Text style={styles.emptyStateTitle}>No Recent Reports</Text>
              <Text style={styles.emptyStateText}>
                There are no recent incidents reported in your area. Stay safe!
              </Text>
            </View>
          ) : (
            <FlatList
              data={nearbyIncidents}
              renderItem={renderIncidentCard}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* Floating Add Button */}
      {!hideReportIncident && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('ReportIncident')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  reportButton: {
    padding: 4,
  },
  filters: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  timeFilters: {
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 4,
    alignSelf: 'flex-end',
  },
  viewButton: {
    padding: 8,
    borderRadius: 6,
  },
  viewButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  map: {
    flex: 1,
  },
  userMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  incidentMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  incidentCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  cardDistance: {
    fontSize: 12,
    color: '#8E8E93',
  },
  verifiedBadge: {
    marginLeft: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginBottom: 12,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  locationDetails: {
    flex: 1,
    marginLeft: 8,
  },
  locationAddress: {
    fontSize: 13,
    color: '#000000',
    fontWeight: '500',
    marginBottom: 4,
  },
  locationCoordinates: {
    fontSize: 11,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upvoteCount: {
    fontSize: 14,
    color: '#8E8E93',
  },
  reporterText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
});

