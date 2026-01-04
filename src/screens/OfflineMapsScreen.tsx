import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';
import { offlineMapsService } from '../services/offlineMapsService';
import { locationService } from '../services/locationService';
import type { OfflineMap, OfflineMapDownloadProgress, Location } from '../types';

type OfflineMapsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'OfflineMaps'>;

interface OfflineMapsScreenProps {
  navigation: OfflineMapsScreenNavigationProp;
}

export default function OfflineMapsScreen({ navigation }: OfflineMapsScreenProps) {
  const [offlineMaps, setOfflineMaps] = useState<OfflineMap[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<OfflineMapDownloadProgress | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState<boolean>(false);
  const [mapName, setMapName] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [totalStorage, setTotalStorage] = useState<number>(0);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    loadOfflineMaps();
    loadUserLocation();
  }, []);

  const loadOfflineMaps = async () => {
    try {
      setLoading(true);
      const maps = await offlineMapsService.getOfflineMaps();
      setOfflineMaps(maps);
      
      const storage = await offlineMapsService.getTotalStorageUsed();
      setTotalStorage(storage);
    } catch (error) {
      console.error('Error loading offline maps:', error);
      Alert.alert('Error', 'Failed to load offline maps.');
    } finally {
      setLoading(false);
    }
  };

  const loadUserLocation = async () => {
    try {
      const location = await locationService.getCurrentLocation();
      if (location) {
        setUserLocation(location);
        const region: Region = {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };
        setSelectedRegion(region);
      }
    } catch (error) {
      console.error('Error loading user location:', error);
    }
  };

  const handleDownloadMap = async () => {
    if (!mapName.trim()) {
      Alert.alert('Error', 'Please enter a name for the map.');
      return;
    }

    if (!selectedRegion) {
      Alert.alert('Error', 'Please select a region on the map.');
      return;
    }

    try {
      setDownloading(true);
      setDownloadProgress({
        mapId: 'temp',
        downloadedTiles: 0,
        totalTiles: 0,
        percentage: 0,
      });

      const map = await offlineMapsService.downloadOfflineMap(
        mapName.trim(),
        selectedRegion.latitude,
        selectedRegion.longitude,
        selectedRegion.latitudeDelta,
        selectedRegion.longitudeDelta,
        13, // Default zoom level
        (progress) => {
          setDownloadProgress(progress);
        }
      );

      Alert.alert('Success', `Map "${map.name}" downloaded successfully!`);
      setShowDownloadModal(false);
      setMapName('');
      setDownloadProgress(null);
      await loadOfflineMaps();
    } catch (error: any) {
      console.error('Error downloading map:', error);
      Alert.alert('Error', error.message || 'Failed to download map. Please try again.');
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleDeleteMap = (map: OfflineMap) => {
    Alert.alert(
      'Delete Map',
      `Are you sure you want to delete "${map.name}"? This will free up ${formatBytes(map.sizeBytes)} of storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await offlineMapsService.deleteOfflineMap(map.id);
              await loadOfflineMaps();
            } catch (error) {
              console.error('Error deleting map:', error);
              Alert.alert('Error', 'Failed to delete map.');
            }
          },
        },
      ]
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleRegionChangeComplete = (region: Region) => {
    setSelectedRegion(region);
  };

  const handleUseCurrentLocation = async () => {
    try {
      const location = await locationService.getHighAccuracyLocation();
      if (location) {
        const region: Region = {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };
        setSelectedRegion(region);
        if (mapRef.current) {
          mapRef.current.animateToRegion(region, 1000);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location.');
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
            <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Offline Maps</Text>
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
        <Text style={styles.headerTitle}>Offline Maps</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowDownloadModal(true)}
        >
          <Ionicons name="download-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Storage Info */}
      <View style={styles.storageInfo}>
        <Ionicons name="server-outline" size={20} color="#8E8E93" />
        <Text style={styles.storageText}>
          Total Storage: {formatBytes(totalStorage)}
        </Text>
      </View>

      {/* Maps List */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {offlineMaps.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="map-outline" size={64} color="#C7C7CC" />
            <Text style={styles.emptyTitle}>No Offline Maps</Text>
            <Text style={styles.emptyText}>
              Download maps for areas with poor connectivity to use them offline.
            </Text>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => setShowDownloadModal(true)}
            >
              <Ionicons name="download" size={20} color="#FFFFFF" />
              <Text style={styles.downloadButtonText}>Download Your First Map</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.mapsList}>
            {offlineMaps.map((map) => (
              <View key={map.id} style={styles.mapCard}>
                <View style={styles.mapCardHeader}>
                  <View style={styles.mapCardIcon}>
                    <Ionicons name="map" size={24} color="#007AFF" />
                  </View>
                  <View style={styles.mapCardInfo}>
                    <Text style={styles.mapCardName}>{map.name}</Text>
                    <Text style={styles.mapCardDetails}>
                      {formatBytes(map.sizeBytes)} • {map.tileCount} tiles
                    </Text>
                    <Text style={styles.mapCardDate}>
                      Downloaded {new Date(map.downloadedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteMap(map)}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Download Modal */}
      <Modal
        visible={showDownloadModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !downloading && setShowDownloadModal(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Download Offline Map</Text>
            {!downloading && (
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowDownloadModal(false)}
              >
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Map Name Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Map Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Home Area, Work Route"
                value={mapName}
                onChangeText={setMapName}
                editable={!downloading}
                autoCapitalize="words"
              />
            </View>

            {/* Map Preview */}
            <View style={styles.mapContainer}>
              <Text style={styles.mapLabel}>Select Region</Text>
              <Text style={styles.mapHint}>
                Pan and zoom to select the area you want to download
              </Text>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={selectedRegion || {
                  latitude: 37.78825,
                  longitude: -122.4324,
                  latitudeDelta: 0.1,
                  longitudeDelta: 0.1,
                }}
                onRegionChangeComplete={handleRegionChangeComplete}
                scrollEnabled={!downloading}
                zoomEnabled={!downloading}
                rotateEnabled={!downloading}
              />
              <TouchableOpacity
                style={styles.locationButton}
                onPress={handleUseCurrentLocation}
                disabled={downloading}
              >
                <Ionicons name="locate" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            {/* Download Progress */}
            {downloading && downloadProgress && (
              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressText}>Downloading...</Text>
                  <Text style={styles.progressPercentage}>
                    {downloadProgress.percentage}%
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${downloadProgress.percentage}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressDetails}>
                  {downloadProgress.downloadedTiles} / {downloadProgress.totalTiles} tiles
                </Text>
              </View>
            )}

            {/* Download Button */}
            {!downloading && (
              <TouchableOpacity
                style={[
                  styles.downloadButton,
                  (!mapName.trim() || !selectedRegion) && styles.downloadButtonDisabled,
                ]}
                onPress={handleDownloadMap}
                disabled={!mapName.trim() || !selectedRegion}
              >
                <Ionicons name="download" size={20} color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>Download Map</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  },
  storageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    gap: 8,
  },
  storageText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  mapsList: {
    padding: 16,
    gap: 12,
  },
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  mapCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapCardInfo: {
    flex: 1,
  },
  mapCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  mapCardDetails: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 2,
  },
  mapCardDate: {
    fontSize: 12,
    color: '#C7C7CC',
  },
  deleteButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapContainer: {
    marginBottom: 24,
  },
  mapLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  mapHint: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
  },
  map: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
  },
  locationButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  progressContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  progressPercentage: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressDetails: {
    fontSize: 13,
    color: '#8E8E93',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  downloadButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

