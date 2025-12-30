import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useIncidents } from '../context/IncidentContext';
import type { RootStackParamList } from '../types';

type IncidentDetailScreenRouteProp = RouteProp<RootStackParamList, 'IncidentDetail'>;
type IncidentDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'IncidentDetail'>;

interface IncidentDetailScreenProps {
  route: IncidentDetailScreenRouteProp;
  navigation: IncidentDetailScreenNavigationProp;
}

export default function IncidentDetailScreen({ route, navigation }: IncidentDetailScreenProps) {
  const { incident } = route.params;
  const { upvoteIncident, userLocation, calculateDistance } = useIncidents();

  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    incident.location.latitude,
    incident.location.longitude
  );

  const getTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now.getTime() - time.getTime()) / 1000 / 60);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} minutes ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} hours ago`;
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

  const handleDirections = (): void => {
    navigation.navigate('MapView', {
      location: incident.location,
      title: incident.title,
      showUserLocation: true,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Incident Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.incidentHeader}>
          <View style={[styles.categoryIcon, { backgroundColor: getCategoryColor(incident.category) + '20' }]}>
            <Ionicons
              name={getCategoryIcon(incident.category)}
              size={32}
              color={getCategoryColor(incident.category)}
            />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>{incident.title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.category}>{incident.category}</Text>
              {incident.confirmed && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{incident.description}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color="#8E8E93" />
            <Text style={styles.infoText}>{getTimeAgo(incident.createdAt)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#8E8E93" />
            <Text style={styles.infoText}>{distance.toFixed(1)} km away</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={20} color="#8E8E93" />
            <Text style={styles.infoText}>
              Reported by {incident.reporter.isAnonymous ? 'Anonymous' : incident.reporter.name}
            </Text>
          </View>
        </View>

        <View style={styles.mapContainer}>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: incident.location.latitude,
              longitude: incident.location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <Marker
              coordinate={incident.location}
              title={incident.title}
            >
              <View style={[styles.incidentMarker, { backgroundColor: getCategoryColor(incident.category) }]}>
                <Ionicons
                  name={getCategoryIcon(incident.category)}
                  size={20}
                  color="#FFFFFF"
                />
              </View>
            </Marker>
            <Marker
              coordinate={userLocation}
              title="You"
            >
              <View style={styles.userMarker}>
                <Ionicons name="person" size={16} color="#FFFFFF" />
              </View>
            </Marker>
          </MapView>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.upvoteButton}
            onPress={() => upvoteIncident(incident.id)}
          >
            <Ionicons name="arrow-up" size={20} color="#007AFF" />
            <Text style={styles.upvoteText}>{incident.upvotes} upvotes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.directionsButton}
            onPress={handleDirections}
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
            <Text style={styles.directionsButtonText}>Get Directions</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  incidentHeader: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  category: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '500',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  mapContainer: {
    height: 300,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  incidentMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
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
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  upvoteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  upvoteText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  directionsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  directionsButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

