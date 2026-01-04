import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OfflineMap, OfflineMapDownloadProgress, Location } from '../types';

const OFFLINE_MAPS_DIR = `${FileSystem.documentDirectory}offline_maps/`;
const OFFLINE_MAPS_METADATA_KEY = '@famguard:offline_maps';
const TILES_DIR = `${OFFLINE_MAPS_DIR}tiles/`;

// OpenStreetMap tile server (legal to cache)
const TILE_SERVER_URL = 'https://tile.openstreetmap.org';

interface TileCoordinates {
  x: number;
  y: number;
  z: number;
}

class OfflineMapsService {
  private downloadProgressCallbacks: Map<string, (progress: OfflineMapDownloadProgress) => void> = new Map();
  private activeDownloads: Map<string, boolean> = new Map();

  /**
   * Initialize offline maps directory
   */
  async initialize(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(OFFLINE_MAPS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(OFFLINE_MAPS_DIR, { intermediates: true });
      }

      const tilesDirInfo = await FileSystem.getInfoAsync(TILES_DIR);
      if (!tilesDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(TILES_DIR, { intermediates: true });
      }
    } catch (error) {
      console.error('Error initializing offline maps directory:', error);
      throw error;
    }
  }

  /**
   * Convert latitude/longitude to tile coordinates
   */
  private latLonToTile(lat: number, lon: number, zoom: number): TileCoordinates {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return { x, y, z: zoom };
  }

  /**
   * Get all tiles needed for a region
   */
  private getTilesForRegion(
    centerLat: number,
    centerLon: number,
    latDelta: number,
    lonDelta: number,
    zoom: number
  ): TileCoordinates[] {
    const tiles: TileCoordinates[] = [];
    const minLat = centerLat - latDelta / 2;
    const maxLat = centerLat + latDelta / 2;
    const minLon = centerLon - lonDelta / 2;
    const maxLon = centerLon + lonDelta / 2;

    const minTile = this.latLonToTile(minLat, minLon, zoom);
    const maxTile = this.latLonToTile(maxLat, maxLon, zoom);

    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        tiles.push({ x, y, z: zoom });
      }
    }

    return tiles;
  }

  /**
   * Get tile file path
   */
  private getTileFilePath(tile: TileCoordinates): string {
    return `${TILES_DIR}${tile.z}/${tile.x}/${tile.y}.png`;
  }

  /**
   * Get tile URL
   */
  private getTileUrl(tile: TileCoordinates): string {
    return `${TILE_SERVER_URL}/${tile.z}/${tile.x}/${tile.y}.png`;
  }

  /**
   * Download a single tile
   */
  private async downloadTile(tile: TileCoordinates): Promise<void> {
    const filePath = this.getTileFilePath(tile);
    const url = this.getTileUrl(tile);

    // Check if tile already exists
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      return;
    }

    // Create directory if needed
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    const dirInfo = await FileSystem.getInfoAsync(dirPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }

    // Download tile
    try {
      const downloadResult = await FileSystem.downloadAsync(url, filePath);
      if (downloadResult.status !== 200) {
        throw new Error(`Failed to download tile: ${url}`);
      }
    } catch (error) {
      console.error(`Error downloading tile ${url}:`, error);
      throw error;
    }
  }

  /**
   * Get all offline maps
   */
  async getOfflineMaps(): Promise<OfflineMap[]> {
    try {
      const metadataJson = await AsyncStorage.getItem(OFFLINE_MAPS_METADATA_KEY);
      if (!metadataJson) {
        return [];
      }
      return JSON.parse(metadataJson);
    } catch (error) {
      console.error('Error getting offline maps:', error);
      return [];
    }
  }

  /**
   * Save offline map metadata
   */
  private async saveOfflineMapMetadata(maps: OfflineMap[]): Promise<void> {
    try {
      await AsyncStorage.setItem(OFFLINE_MAPS_METADATA_KEY, JSON.stringify(maps));
    } catch (error) {
      console.error('Error saving offline map metadata:', error);
      throw error;
    }
  }

  /**
   * Download offline map for a region
   */
  async downloadOfflineMap(
    name: string,
    centerLat: number,
    centerLon: number,
    latDelta: number,
    lonDelta: number,
    zoom: number = 13,
    onProgress?: (progress: OfflineMapDownloadProgress) => void
  ): Promise<OfflineMap> {
    const mapId = `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (this.activeDownloads.has(mapId)) {
      throw new Error('Download already in progress for this map');
    }

    this.activeDownloads.set(mapId, true);

    try {
      await this.initialize();

      // Get all tiles needed
      const tiles = this.getTilesForRegion(centerLat, centerLon, latDelta, lonDelta, zoom);
      const totalTiles = tiles.length;
      let downloadedTiles = 0;
      let totalSizeBytes = 0;

      if (onProgress) {
        this.downloadProgressCallbacks.set(mapId, onProgress);
      }

      // Download tiles with rate limiting
      const BATCH_SIZE = 5; // Download 5 tiles at a time
      for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
        if (!this.activeDownloads.has(mapId)) {
          throw new Error('Download cancelled');
        }

        const batch = tiles.slice(i, i + BATCH_SIZE);
        const downloadPromises = batch.map(async (tile) => {
          try {
            await this.downloadTile(tile);
            const filePath = this.getTileFilePath(tile);
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (fileInfo.exists && 'size' in fileInfo) {
              totalSizeBytes += fileInfo.size || 0;
            }
            downloadedTiles++;
          } catch (error) {
            console.error(`Error downloading tile:`, error);
            // Continue with other tiles even if one fails
          }
        });

        await Promise.allSettled(downloadPromises);

        // Update progress
        const progress: OfflineMapDownloadProgress = {
          mapId,
          downloadedTiles,
          totalTiles,
          percentage: Math.round((downloadedTiles / totalTiles) * 100),
        };

        if (onProgress) {
          onProgress(progress);
        }
      }

      // Create map metadata
      const offlineMap: OfflineMap = {
        id: mapId,
        name,
        centerLatitude: centerLat,
        centerLongitude: centerLon,
        latitudeDelta: latDelta,
        longitudeDelta: lonDelta,
        zoomLevel: zoom,
        sizeBytes: totalSizeBytes,
        tileCount: downloadedTiles,
        downloadedAt: new Date().toISOString(),
      };

      // Save metadata
      const existingMaps = await this.getOfflineMaps();
      existingMaps.push(offlineMap);
      await this.saveOfflineMapMetadata(existingMaps);

      this.downloadProgressCallbacks.delete(mapId);
      this.activeDownloads.delete(mapId);

      return offlineMap;
    } catch (error) {
      this.downloadProgressCallbacks.delete(mapId);
      this.activeDownloads.delete(mapId);
      throw error;
    }
  }

  /**
   * Delete offline map
   */
  async deleteOfflineMap(mapId: string): Promise<void> {
    try {
      const maps = await this.getOfflineMaps();
      const map = maps.find((m) => m.id === mapId);

      if (!map) {
        throw new Error('Map not found');
      }

      // Delete all tiles for this map
      const tiles = this.getTilesForRegion(
        map.centerLatitude,
        map.centerLongitude,
        map.latitudeDelta,
        map.longitudeDelta,
        map.zoomLevel
      );

      const deletePromises = tiles.map(async (tile) => {
        const filePath = this.getTileFilePath(tile);
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          try {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
          } catch (error) {
            console.error(`Error deleting tile:`, error);
          }
        }
      });

      await Promise.allSettled(deletePromises);

      // Remove from metadata
      const updatedMaps = maps.filter((m) => m.id !== mapId);
      await this.saveOfflineMapMetadata(updatedMaps);
    } catch (error) {
      console.error('Error deleting offline map:', error);
      throw error;
    }
  }

  /**
   * Cancel download
   */
  cancelDownload(mapId: string): void {
    this.activeDownloads.delete(mapId);
    this.downloadProgressCallbacks.delete(mapId);
  }

  /**
   * Check if tile exists locally
   */
  async isTileCached(tile: TileCoordinates): Promise<boolean> {
    try {
      const filePath = this.getTileFilePath(tile);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      return fileInfo.exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cached tile URL (file:// URI for local tiles)
   */
  getCachedTileUrl(tile: TileCoordinates): string | null {
    const filePath = this.getTileFilePath(tile);
    return filePath;
  }

  /**
   * Get total storage used by offline maps
   */
  async getTotalStorageUsed(): Promise<number> {
    try {
      const maps = await this.getOfflineMaps();
      return maps.reduce((total, map) => total + map.sizeBytes, 0);
    } catch (error) {
      console.error('Error calculating storage used:', error);
      return 0;
    }
  }

  /**
   * Check if a location is covered by any offline map
   */
  async isLocationCovered(lat: number, lon: number): Promise<boolean> {
    try {
      const maps = await this.getOfflineMaps();
      return maps.some((map) => {
        const minLat = map.centerLatitude - map.latitudeDelta / 2;
        const maxLat = map.centerLatitude + map.latitudeDelta / 2;
        const minLon = map.centerLongitude - map.longitudeDelta / 2;
        const maxLon = map.centerLongitude + map.longitudeDelta / 2;

        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
      });
    } catch (error) {
      console.error('Error checking location coverage:', error);
      return false;
    }
  }

  /**
   * Get offline map covering a location
   */
  async getMapForLocation(lat: number, lon: number): Promise<OfflineMap | null> {
    try {
      const maps = await this.getOfflineMaps();
      for (const map of maps) {
        const minLat = map.centerLatitude - map.latitudeDelta / 2;
        const maxLat = map.centerLatitude + map.latitudeDelta / 2;
        const minLon = map.centerLongitude - map.longitudeDelta / 2;
        const maxLon = map.centerLongitude + map.longitudeDelta / 2;

        if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
          return map;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting map for location:', error);
      return null;
    }
  }
}

export const offlineMapsService = new OfflineMapsService();

