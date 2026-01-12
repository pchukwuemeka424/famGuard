import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { LOCATION_TASK_NAME } from '../tasks/locationBackgroundTask';
import type { Location as LocationType } from '../types';

interface LocationServiceConfig {
  accuracy: Location.Accuracy;
  updateInterval: number; // in milliseconds
  distanceThreshold: number; // in meters
}

class LocationService {
  private watchSubscription: Location.LocationSubscription | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private lastLocation: LocationType | null = null;
  private lastDatabaseUpdate: { location: LocationType; timestamp: number } | null = null;
  private isTracking: boolean = false;
  private userId: string | null = null;
  private familyGroupId: string | null = null;
  // Emergency location tracking
  private emergencyTrackingInterval: NodeJS.Timeout | null = null;
  private isEmergencyTracking: boolean = false;
  // SOS location tracking (every 3 seconds, circular buffer of 5 rows)
  private sosLocationTrackingInterval: NodeJS.Timeout | null = null;
  private isSosLocationTracking: boolean = false;
  private sosLocationRowIds: string[] = []; // Store IDs of the 5 rows
  private sosLocationInsertCount: number = 0; // Track how many rows inserted (max 5)
  private sosLocationUpdateIndex: number = 0; // Current index for circular updates (0-4)
  private config: LocationServiceConfig = {
    accuracy: Location.Accuracy.Highest, // Use highest accuracy for exact location
    updateInterval: 600000, // 10 minutes (600000 ms) for location updates
    distanceThreshold: 50, // 50 meters - only update if moved significantly
  };
  private readonly STATIONARY_UPDATE_INTERVAL = 1800000; // 30 minutes - update even if stationary after this time
  private readonly PROXIMITY_STATIONARY_THRESHOLD = 2400000; // 40 minutes - don't insert history if stationary for this long
  private readonly PROXIMITY_DISTANCE_THRESHOLD = 50; // 50 meters - proximity threshold for stationary detection
  // Track stationary location for proximity-based history insertion
  private stationaryLocation: { location: LocationType; timestamp: number } | null = null;
  // Track stationary location for preventing database updates (1 hour + 30m threshold)
  private readonly STATIONARY_BLOCK_THRESHOLD = 3600000; // 1 hour - block all updates if stationary for this long
  private readonly STATIONARY_BLOCK_DISTANCE = 30; // 30 meters - proximity threshold for blocking updates
  private stationaryBlockLocation: { location: LocationType; timestamp: number } | null = null;
  // Rate limiting for geocoding
  private lastGeocodeTime: number = 0;
  private geocodeCache: Map<string, { address: string | null; timestamp: number }> = new Map();
  private readonly GEOCODE_MIN_INTERVAL = 120000; // 2 minutes minimum between geocoding calls (increased to prevent rate limits)
  private readonly GEOCODE_CACHE_DURATION = 600000; // 10 minutes cache duration (increased)
  private readonly GEOCODE_DISTANCE_THRESHOLD = 500; // Only geocode if moved more than 500m (increased to reduce calls)
  private rateLimitWarningShown: boolean = false; // Track if we've shown the warning to avoid spam
  // Location history frequency tracking
  private locationUpdateFrequencyMinutes: number = 60; // Default 60 minutes
  private lastLocationHistoryInsert: number = 0; // Timestamp of last location history insert

  /**
   * Request location permissions
   * @returns Object with success status and message for better error handling
   */
  async requestPermissions(): Promise<{ granted: boolean; message?: string; canAskAgain?: boolean }> {
    try {
      // Check if location services are enabled
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        const message = Platform.OS === 'android' 
          ? 'Location services are disabled. Please enable location services in your device settings.'
          : 'Location services are disabled. Please enable location services in Settings.';
        console.warn(message);
        return { granted: false, message };
      }

      // Request foreground permissions
      const { status: foregroundStatus, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        let message = 'Location permission denied';
        if (foregroundStatus === 'denied' && !canAskAgain) {
          // Permission permanently denied - user needs to go to settings
          message = Platform.OS === 'android'
            ? 'Location permission is permanently denied. Please enable it in App Settings > Permissions > Location.'
            : 'Location permission is permanently denied. Please enable it in Settings > Privacy > Location Services.';
        } else if (foregroundStatus === 'denied') {
          message = 'Location permission was denied. Please grant permission to share your location.';
        }
        
        console.warn(`Foreground location permission denied: ${foregroundStatus}`, { canAskAgain });
        return { granted: false, message, canAskAgain };
      }

      // Request background permission for iOS (optional, not required for basic functionality)
      if (Platform.OS === 'ios') {
        try {
          const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
          if (backgroundStatus !== 'granted') {
            console.warn('Background location permission denied - foreground location will still work');
          }
        } catch (bgError) {
          // Background permission might not be available in Expo Go
          console.warn('Background permission request failed (this is normal in Expo Go):', bgError);
        }
      }

      console.log('Location permissions granted successfully');
      return { granted: true };
    } catch (error: any) {
      // Handle specific error about missing Info.plist keys
      if (error?.message?.includes('NSLocation') || error?.message?.includes('Info.plist')) {
        const message = 'Location permissions not configured. Please rebuild the app with updated app.json';
        console.error(message);
        throw new Error(message);
      }
      
      const errorMessage = Platform.OS === 'android'
        ? 'Failed to request location permission. Please check your device settings.'
        : 'Failed to request location permission.';
      console.error('Error requesting location permissions:', error);
      return { granted: false, message: errorMessage };
    }
  }

  /**
   * Check if location permissions are granted
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error checking location permissions:', error);
      return false;
    }
  }

  /**
   * Get last known location (cached, returns immediately)
   */
  getLastKnownLocation(): LocationType | null {
    return this.lastLocation;
  }

  /**
   * Get current location quickly (with shorter timeout for faster response)
   * Falls back to last location from location_history if offline
   * @param requestPermissionIfNeeded - If true, will request permission if not granted. Default: false
   * @param fastMode - If true, uses shorter timeout (2s) and allows cached location. Default: false
   */
  async getCurrentLocationFast(requestPermissionIfNeeded: boolean = false, fastMode: boolean = true): Promise<LocationType | null> {
    try {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        if (requestPermissionIfNeeded) {
          const permissionResult = await this.requestPermissions();
          if (!permissionResult.granted) {
            // Try to get last location from history if we have userId
            if (this.userId) {
              const lastLocation = await this.getLastLocationFromHistory(this.userId);
              if (lastLocation) {
                return lastLocation;
              }
            }
            return this.lastLocation; // Return cached if permission denied
          }
        } else {
          // Try to get last location from history if we have userId
          if (this.userId) {
            const lastLocation = await this.getLastLocationFromHistory(this.userId);
            if (lastLocation) {
              return lastLocation;
            }
          }
          return this.lastLocation; // Return cached location if no permission
        }
      }

      // Check if we're online (skip check in fast mode to save time, but still check if no cached location)
      let online = true;
      if (!fastMode || !this.lastLocation) {
        online = await this.isOnline();
      }

      if (!online && this.userId) {
        // Offline - get last location from history
        const lastLocation = await this.getLastLocationFromHistory(this.userId);
        if (lastLocation) {
          if (__DEV__) {
            console.log('No internet connection (fast mode), using last location from history');
          }
          return lastLocation;
        }
        // If no history, still try GPS (GPS works offline)
      }

      // Use shorter timeout for fast mode
      const locationOptions = Platform.OS === 'ios'
        ? {
            accuracy: fastMode ? Location.Accuracy.Balanced : this.config.accuracy,
            maximumAge: fastMode ? 10000 : 0, // Allow 10s old data in fast mode
            timeout: fastMode ? 2000 : 15000, // 2s timeout in fast mode
            distanceInterval: 0,
          }
        : {
            accuracy: fastMode ? Location.Accuracy.Balanced : this.config.accuracy,
            maximumAge: fastMode ? 10000 : 5000,
            timeout: fastMode ? 2000 : 10000, // 2s timeout in fast mode
          };
      
      try {
        const location = await Location.getCurrentPositionAsync(locationOptions);

        // Skip geocoding in fast mode to save time
        if (fastMode && this.lastLocation?.address) {
          return {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            address: this.lastLocation.address, // Use cached address
          };
        }

        // Reverse geocode to get address (only if online and not in cache)
        let address: string | null = null;
        if (online) {
          address = await this.reverseGeocode(
            location.coords.latitude,
            location.coords.longitude,
            false // Don't force - use cache and rate limiting
          );
        } else {
          // Offline - try to get address from last location in history
          if (this.userId) {
            const lastLocation = await this.getLastLocationFromHistory(this.userId);
            if (lastLocation?.address) {
              address = lastLocation.address;
            }
          }
        }

        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: address || undefined,
        };
      } catch (gpsError) {
        // GPS failed - try to get last location from history if offline
        if (!online && this.userId) {
          const lastLocation = await this.getLastLocationFromHistory(this.userId);
          if (lastLocation) {
            if (__DEV__) {
              console.log('GPS failed (fast mode), using last location from history');
            }
            return lastLocation;
          }
        }
        throw gpsError;
      }
    } catch (error) {
      // Try to get last location from history as fallback
      if (this.userId) {
        const lastLocation = await this.getLastLocationFromHistory(this.userId);
        if (lastLocation) {
          if (__DEV__) {
            console.log('Error getting location (fast mode), using last location from history as fallback');
          }
          return lastLocation;
        }
      }
      
      // Return cached location if fetch fails
      if (this.lastLocation) {
        return this.lastLocation;
      }
      console.error('Error getting current location:', error);
      return null;
    }
  }

  /**
   * Get current location
   * Falls back to last location from location_history if offline
   * @param requestPermissionIfNeeded - If true, will request permission if not granted. Default: false
   */
  async getCurrentLocation(requestPermissionIfNeeded: boolean = false): Promise<LocationType | null> {
    try {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        if (requestPermissionIfNeeded) {
          const permissionResult = await this.requestPermissions();
          if (!permissionResult.granted) {
            // If no permission, try to get last location from history if we have userId
            if (this.userId) {
              const lastLocation = await this.getLastLocationFromHistory(this.userId);
              if (lastLocation) {
                if (__DEV__) {
                  console.log('No location permission, using last location from history');
                }
                return lastLocation;
              }
            }
            return null;
          }
        } else {
          // Don't request permission automatically - try to get last location from history
          if (this.userId) {
            const lastLocation = await this.getLastLocationFromHistory(this.userId);
            if (lastLocation) {
              if (__DEV__) {
                console.log('No location permission, using last location from history');
              }
              return lastLocation;
            }
          }
          return null;
        }
      }

      // Check if we're online before attempting to get GPS location
      const online = await this.isOnline();
      
      if (!online && this.userId) {
        // Offline - get last location from history
        if (__DEV__) {
          console.log('No internet connection, fetching last location from history');
        }
        const lastLocation = await this.getLastLocationFromHistory(this.userId);
        if (lastLocation) {
          return lastLocation;
        }
        // If no history, still try GPS (GPS works offline)
      }

      // iOS-specific options to force fresh GPS reading
      const locationOptions = Platform.OS === 'ios'
        ? {
            accuracy: this.config.accuracy,
            maximumAge: 0, // Force fresh location on iOS
            timeout: 15000,
            distanceInterval: 0,
          }
        : {
            accuracy: this.config.accuracy,
            maximumAge: 5000,
            timeout: 10000,
          };
      
      try {
        const location = await Location.getCurrentPositionAsync(locationOptions);

        // Reverse geocode to get address (only if not in cache and online)
        let address: string | null = null;
        if (online) {
          address = await this.reverseGeocode(
            location.coords.latitude,
            location.coords.longitude,
            false // Don't force - use cache and rate limiting
          );
        } else {
          // Offline - try to get address from last location in history
          if (this.userId) {
            const lastLocation = await this.getLastLocationFromHistory(this.userId);
            if (lastLocation?.address) {
              address = lastLocation.address;
            }
          }
        }

        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: address || undefined,
        };
      } catch (gpsError) {
        // GPS failed - try to get last location from history if offline
        if (!online && this.userId) {
          const lastLocation = await this.getLastLocationFromHistory(this.userId);
          if (lastLocation) {
            if (__DEV__) {
              console.log('GPS failed, using last location from history');
            }
            return lastLocation;
          }
        }
        throw gpsError;
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      
      // Last resort: try to get last location from history
      if (this.userId) {
        const lastLocation = await this.getLastLocationFromHistory(this.userId);
        if (lastLocation) {
          if (__DEV__) {
            console.log('Error getting location, using last location from history as fallback');
          }
          return lastLocation;
        }
      }
      
      return null;
    }
  }

  /**
   * Get high-accuracy current location (for exact location features)
   * Falls back to last location from location_history if offline
   * @param requestPermissionIfNeeded - If true, will request permission if not granted. Default: false
   */
  async getHighAccuracyLocation(requestPermissionIfNeeded: boolean = false): Promise<LocationType | null> {
    try {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        if (requestPermissionIfNeeded) {
          const permissionResult = await this.requestPermissions();
          if (!permissionResult.granted) {
            // If no permission, try to get last location from history if we have userId
            if (this.userId) {
              const lastLocation = await this.getLastLocationFromHistory(this.userId);
              if (lastLocation) {
                if (__DEV__) {
                  console.log('No location permission, using last location from history');
                }
                return lastLocation;
              }
            }
            return null;
          }
        } else {
          // Don't request permission automatically - try to get last location from history
          if (this.userId) {
            const lastLocation = await this.getLastLocationFromHistory(this.userId);
            if (lastLocation) {
              if (__DEV__) {
                console.log('No location permission, using last location from history');
              }
              return lastLocation;
            }
          }
          return null;
        }
      }

      // Check if we're online before attempting to get GPS location
      const online = await this.isOnline();
      
      if (!online && this.userId) {
        // Offline - get last location from history
        if (__DEV__) {
          console.log('No internet connection, fetching last location from history for high accuracy');
        }
        const lastLocation = await this.getLastLocationFromHistory(this.userId);
        if (lastLocation) {
          return lastLocation;
        }
        // If no history, still try GPS (GPS works offline)
      }

      // Use best accuracy for exact location
      // On iOS, BestForNavigation provides the most accurate GPS positioning
      const accuracy = Platform.OS === 'ios' 
        ? Location.Accuracy.BestForNavigation 
        : Location.Accuracy.Highest;
      
      // iOS-specific options to force fresh GPS reading and prevent cached data
      const locationOptions = Platform.OS === 'ios'
        ? {
            accuracy,
            maximumAge: 0, // Force fresh location, don't use cached data
            timeout: 15000, // Wait up to 15 seconds for accurate GPS reading
            distanceInterval: 0, // No distance threshold - get exact location
          }
        : {
            accuracy,
            maximumAge: 5000, // Allow 5 second old data on Android
            timeout: 10000,
          };
      
      try {
        const location = await Location.getCurrentPositionAsync(locationOptions);

        // Reverse geocode to get address (only if online and not in cache)
        let address: string | null = null;
        if (online) {
          address = await this.reverseGeocode(
            location.coords.latitude,
            location.coords.longitude,
            false // Don't force - use cache and rate limiting to prevent rate limit errors
          );
        } else {
          // Offline - try to get address from last location in history
          if (this.userId) {
            const lastLocation = await this.getLastLocationFromHistory(this.userId);
            if (lastLocation?.address) {
              address = lastLocation.address;
            }
          }
        }

        const result = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: address || undefined,
        };

        // Log location accuracy for debugging on iOS
        if (__DEV__ && Platform.OS === 'ios') {
          console.log('High accuracy location fetched:', {
            lat: result.latitude.toFixed(6),
            lng: result.longitude.toFixed(6),
            accuracy: location.coords.accuracy,
            altitude: location.coords.altitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            online,
          });
        }

        return result;
      } catch (gpsError) {
        // GPS failed - try to get last location from history if offline
        if (!online && this.userId) {
          const lastLocation = await this.getLastLocationFromHistory(this.userId);
          if (lastLocation) {
            if (__DEV__) {
              console.log('GPS failed, using last location from history');
            }
            return lastLocation;
          }
        }
        throw gpsError;
      }
    } catch (error) {
      console.error('Error getting high accuracy location:', error);
      
      // Last resort: try to get last location from history
      if (this.userId) {
        const lastLocation = await this.getLastLocationFromHistory(this.userId);
        if (lastLocation) {
          if (__DEV__) {
            console.log('Error getting high accuracy location, using last location from history as fallback');
          }
          return lastLocation;
        }
      }
      
      // Fallback to regular accuracy (with same permission request flag)
      return this.getCurrentLocation(requestPermissionIfNeeded);
    }
  }

  /**
   * Reverse geocode coordinates to address with rate limiting and caching
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @param force - Force geocoding even if rate limited (use with caution)
   * @param isEmergency - Emergency mode allows more frequent geocoding (30s vs 2min interval)
   */
  async reverseGeocode(latitude: number, longitude: number, force: boolean = false, isEmergency: boolean = false): Promise<string | null> {
    // Check cache first
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = this.geocodeCache.get(cacheKey);
    const now = Date.now();
    
    // Return cached address if still valid
    if (cached && (now - cached.timestamp) < this.GEOCODE_CACHE_DURATION) {
      return cached.address;
    }

    // For emergency situations, use shorter rate limit interval
    const geocodeMinInterval = isEmergency ? 30000 : this.GEOCODE_MIN_INTERVAL; // 30 seconds for emergency vs 2 minutes normal
    const geocodeDistanceThreshold = isEmergency ? 50 : this.GEOCODE_DISTANCE_THRESHOLD; // 50m for emergency vs 500m normal

    // Rate limiting: don't geocode if called too recently (unless force is true)
    const timeSinceLastGeocode = now - this.lastGeocodeTime;
    if (!force && timeSinceLastGeocode < geocodeMinInterval) {
      // Return cached address if available (even if expired, it's better than nothing)
      if (cached) {
        return cached.address;
      }
      // If no cache and rate limited, return null to avoid hitting rate limit
      // Silently skip - no warning needed as this is expected behavior
      return null;
    }

    // Check if location changed significantly from last geocoded location
    if (this.lastLocation && !force) {
      const distance = this.calculateDistance(
        this.lastLocation.latitude,
        this.lastLocation.longitude,
        latitude,
        longitude
      );
      
      // Only geocode if moved significantly (threshold is lower for emergency)
      if (distance < geocodeDistanceThreshold) {
        // Use cached address if available
        if (cached) {
          return cached.address;
        }
        // If no cache but didn't move much, skip geocoding
        return null;
      }
    }

    try {
      this.lastGeocodeTime = now;
      
      const reverseGeocoded = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      let address: string | null = null;
      if (reverseGeocoded.length > 0) {
        const addr = reverseGeocoded[0];
        const parts = [
          addr.streetNumber,
          addr.street,
          addr.city,
          addr.region,
          addr.country,
        ].filter(Boolean);

        address = parts.join(', ') || null;
      }

      // Cache the result
      this.geocodeCache.set(cacheKey, { address, timestamp: now });
      
      // Clean up old cache entries (keep only recent ones)
      this.cleanupGeocodeCache();

      return address;
    } catch (error: any) {
      // Handle rate limit errors gracefully
      if (error?.message?.includes('rate limit') || 
          error?.message?.includes('too many requests') ||
          error?.code === 'E_GEOCODING_RATE_LIMIT') {
        // Only show warning once per session to avoid spam
        if (__DEV__ && !this.rateLimitWarningShown) {
          console.warn('Geocoding rate limit reached, using cached address or skipping');
          this.rateLimitWarningShown = true;
          // Reset warning flag after 5 minutes
          setTimeout(() => {
            this.rateLimitWarningShown = false;
          }, 300000);
        }
        // Return cached address if available
        if (cached) {
          return cached.address;
        }
        // Update last geocode time to prevent immediate retry
        this.lastGeocodeTime = now;
        return null;
      }
      
      // Only log non-rate-limit errors in dev mode
      if (__DEV__ && !error?.message?.includes('rate limit')) {
        console.error('Error reverse geocoding:', error);
      }
      return null;
    }
  }

  /**
   * Clean up old cache entries
   */
  private cleanupGeocodeCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.geocodeCache.forEach((value, key) => {
      if (now - value.timestamp > this.GEOCODE_CACHE_DURATION) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.geocodeCache.delete(key));
  }

  /**
   * Start tracking location and sharing with family
   */
  async startLocationSharing(
    userId: string,
    familyGroupId: string,
    shareLocation: boolean = true
  ): Promise<void> {
    if (this.isTracking) {
      console.log('Location tracking already started');
      return;
    }

    const permissionResult = await this.requestPermissions();
    if (!permissionResult.granted) {
      throw new Error(permissionResult.message || 'Location permissions not granted');
    }

    // Request background permission for Android
    if (Platform.OS === 'android') {
      try {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          console.warn('Background location permission denied - location tracking may stop when app is closed');
        } else {
          console.log('Background location permission granted');
        }
      } catch (bgError) {
        console.warn('Background permission request failed:', bgError);
      }
    }

    this.userId = userId;
    this.familyGroupId = familyGroupId;
    this.isTracking = true;

    // Load user settings for location update frequency
    await this.loadLocationUpdateFrequency();
    
    // Load last insert time from AsyncStorage (for consistency with background task)
    try {
      const lastInsertTimeStr = await AsyncStorage.getItem(`location_history_last_insert_${userId}`);
      if (lastInsertTimeStr) {
        this.lastLocationHistoryInsert = parseInt(lastInsertTimeStr, 10);
      }
    } catch (error) {
      // Ignore error, will start fresh
    }

    // Store userId and familyGroupId for background task
    await AsyncStorage.setItem('location_tracking_userId', userId);
    await AsyncStorage.setItem('location_tracking_familyGroupId', familyGroupId);
    await AsyncStorage.setItem('location_tracking_shareLocation', shareLocation.toString());

    // Get initial location with highest accuracy (permission already requested above)
    const initialLocation = await this.getHighAccuracyLocation(true);
    if (initialLocation) {
      await this.updateLocationInDatabase(initialLocation, shareLocation);
      // Track the initial database update
      this.lastDatabaseUpdate = {
        location: { ...initialLocation },
        timestamp: Date.now(),
      };
      // Always save initial location to history (bypass frequency check for first location)
      // Reset last insert time to ensure initial location is saved
      this.lastLocationHistoryInsert = 0;
      await this.saveLocationHistory(initialLocation);
    }

    // Start watching location changes with highest accuracy
    // Use iOS-specific settings for better accuracy
    const watchOptions = Platform.OS === 'ios'
      ? {
          accuracy: Location.Accuracy.BestForNavigation, // Best accuracy for iOS
          timeInterval: this.config.updateInterval,
          distanceInterval: this.config.distanceThreshold,
        }
      : {
          accuracy: Location.Accuracy.Highest,
          timeInterval: this.config.updateInterval,
          distanceInterval: this.config.distanceThreshold,
        };

    this.watchSubscription = await Location.watchPositionAsync(
      watchOptions,
      async (location) => {
        const newLocation: LocationType = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        // Log location accuracy for debugging on iOS
        if (__DEV__ && Platform.OS === 'ios') {
          console.log('Location watch update:', {
            lat: newLocation.latitude.toFixed(6),
            lng: newLocation.longitude.toFixed(6),
            accuracy: location.coords.accuracy,
            altitude: location.coords.altitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
          });
        }

        // Check if we should update the database
        const shouldUpdate = this.shouldUpdateDatabase(newLocation);
        
        // Always update lastLocation for tracking
        this.lastLocation = newLocation;
        
        if (!shouldUpdate) {
          // User hasn't moved significantly and recent update exists, skip database update
          // BUT still save to location history to ensure complete tracking
          // Use previous address if available, otherwise location will be geocoded in saveLocationHistory
          if (this.lastLocation?.address && !newLocation.address) {
            newLocation.address = this.lastLocation.address;
          }
          await this.saveLocationHistory(newLocation);
          return;
        }

        // Only update address if moved significantly (rate limiting handled in reverseGeocode)
        // The reverseGeocode function will check distance and rate limits internally
        // Only attempt geocoding if moved significantly to reduce API calls
        const address = await this.reverseGeocode(
          newLocation.latitude,
          newLocation.longitude,
          false // Don't force, let rate limiting handle it
        );
        // Use new address if available, otherwise keep previous address
        newLocation.address = address || this.lastLocation?.address || undefined;

        // Update location in database only if user moved significantly or it's been a long time
        // Note: saveLocationHistory is called separately to ensure it always runs
        // even if updateLocationInDatabase fails or returns early
        await this.updateLocationInDatabase(newLocation, shareLocation);
        // Track the last database update
        this.lastDatabaseUpdate = {
          location: { ...newLocation },
          timestamp: Date.now(),
        };
        
        // ALWAYS save to location history (independent of database update success)
        // This ensures we have complete location tracking regardless of family_members update status
        await this.saveLocationHistory(newLocation);
      }
    );

    // Also set up periodic updates every 10 minutes as backup with high accuracy
    this.updateInterval = setInterval(async () => {
      const location = await this.getHighAccuracyLocation(true); // Permission already granted
      if (location) {
        // Check if we should update the database
        const shouldUpdate = this.shouldUpdateDatabase(location);
        
        // Always update lastLocation for tracking
        this.lastLocation = location;
        
        if (!shouldUpdate) {
          // User hasn't moved significantly and recent update exists, skip database update
          // BUT still save to location history to ensure complete tracking
          await this.saveLocationHistory(location);
          return;
        }

        // Don't geocode in periodic updates - use cached address or skip
        // This prevents hitting rate limits
        if (this.lastLocation) {
          location.address = this.lastLocation.address;
        }
        
        // Update location in database
        // Note: saveLocationHistory is called separately to ensure it always runs
        // even if updateLocationInDatabase fails or returns early
        await this.updateLocationInDatabase(location, shareLocation);
        // Track the last database update
        this.lastDatabaseUpdate = {
          location: { ...location },
          timestamp: Date.now(),
        };
        
        // ALWAYS save to location history (independent of database update success)
        // This ensures we have complete location tracking regardless of family_members update status
        await this.saveLocationHistory(location);
      }
    }, this.config.updateInterval);

    // Start background location tracking (Android only - iOS uses watchPositionAsync)
    if (Platform.OS === 'android') {
      try {
        const hasStarted = await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Highest,
          timeInterval: this.config.updateInterval,
          distanceInterval: this.config.distanceThreshold,
          foregroundService: {
            notificationTitle: 'Location Tracking',
            notificationBody: 'FamGuard is tracking your location to share with family members.',
            notificationColor: '#DC2626',
          },
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
        });

        if (hasStarted) {
          console.log('Background location tracking started');
        }
      } catch (bgError) {
        console.error('Failed to start background location tracking:', bgError);
        // Continue with foreground tracking even if background fails
      }
    } else {
      // iOS: watchPositionAsync already works in background with proper permissions
      console.log('iOS background location tracking enabled via watchPositionAsync');
    }
  }

  /**
   * Stop tracking location and set user as offline
   */
  async stopLocationSharing(): Promise<void> {
    // Stop background location tracking (Android)
    if (Platform.OS === 'android') {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (hasStarted) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          console.log('Background location tracking stopped');
        }
      } catch (bgError) {
        console.error('Error stopping background location tracking:', bgError);
      }
    }

    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Clear stored tracking data
    await AsyncStorage.multiRemove([
      'location_tracking_userId',
      'location_tracking_familyGroupId',
      'location_tracking_shareLocation',
    ]);

    // Set user as offline when location sharing stops
    if (this.userId && this.familyGroupId) {
      this.setUserOffline().catch((error) => {
        console.error('Error setting user offline:', error);
      });
    }

    this.isTracking = false;
    this.userId = null;
    this.familyGroupId = null;
    this.lastLocation = null;
    this.lastDatabaseUpdate = null;
    this.stationaryLocation = null; // Reset stationary location tracking
    this.stationaryBlockLocation = null; // Reset stationary block tracking
  }

  /**
   * Set user as offline in database
   */
  private async setUserOffline(): Promise<void> {
    if (!this.userId || !this.familyGroupId) {
      return;
    }

    try {
      const { data: member } = await supabase
        .from('family_members')
        .select('id')
        .eq('family_group_id', this.familyGroupId)
        .eq('user_id', this.userId)
        .single();

      if (member) {
        await supabase
          .from('family_members')
          .update({
            is_online: false,
            share_location: false,
            last_seen: new Date().toISOString(),
          })
          .eq('id', member.id);
        
        console.log('User set as offline');
      }
    } catch (error) {
      console.error('Error setting user offline:', error);
    }
  }

  /**
   * Update location in database
   */
  private async updateLocationInDatabase(
    location: LocationType,
    shareLocation: boolean
  ): Promise<void> {
    if (!this.userId || !this.familyGroupId) {
      return;
    }

    try {
      // Find the family member record for this user
      // Use select() instead of single() to handle potential duplicates
      let { data: members, error: memberError } = await supabase
        .from('family_members')
        .select('id')
        .eq('family_group_id', this.familyGroupId)
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(1);

      let member = members && members.length > 0 ? members[0] : null;

      // If member doesn't exist, create it
      if (!member && (!memberError || memberError.code === 'PGRST116')) {
        // First, verify that the family group exists
        const { data: familyGroup, error: groupError } = await supabase
          .from('family_groups')
          .select('id')
          .eq('id', this.familyGroupId)
          .single();

        if (groupError || !familyGroup) {
          console.error('Error: Family group does not exist:', this.familyGroupId, groupError);
          // Don't create member if family group doesn't exist
          return;
        }

        // Get user data to create family member
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, name, phone, photo')
          .eq('id', this.userId)
          .single();

        if (userError || !userData) {
          console.error('Error fetching user data:', userError);
          return;
        }

        // Try to insert new family member record
        // If duplicate exists, we'll update it instead
        const { data: newMember, error: createError } = await supabase
          .from('family_members')
          .insert({
            family_group_id: this.familyGroupId,
            user_id: this.userId,
            name: userData.name,
            relationship: 'Me',
            phone: userData.phone,
            photo: userData.photo,
            location_latitude: location.latitude,
            location_longitude: location.longitude,
            location_address: location.address,
            last_seen: new Date().toISOString(),
            is_online: shareLocation, // Online only if sharing location
            share_location: shareLocation,
            battery_level: 100,
          })
          .select('id')
          .single();

        if (createError) {
          // Handle foreign key constraint violation (family group doesn't exist)
          if (createError.code === '23503') {
            console.error('Error: Family group does not exist for family_group_id:', this.familyGroupId);
            // Clear the invalid family group ID to prevent retries
            this.familyGroupId = null;
            return;
          }
          
          // If it's a unique constraint violation, member already exists - update it instead
          if (createError.code === '23505' || createError.message?.includes('duplicate') || createError.message?.includes('unique')) {
            // Fetch the existing member and update it
            const { data: existingMembers } = await supabase
              .from('family_members')
              .select('id')
              .eq('family_group_id', this.familyGroupId)
              .eq('user_id', this.userId)
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (existingMembers && existingMembers.length > 0) {
              member = existingMembers[0];
              // Update the existing member with new location data
              await supabase
                .from('family_members')
                .update({
                  name: userData.name,
                  phone: userData.phone,
                  photo: userData.photo,
                  location_latitude: location.latitude,
                  location_longitude: location.longitude,
                  location_address: location.address,
                  last_seen: new Date().toISOString(),
                  is_online: shareLocation,
                  share_location: shareLocation,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', member.id);
            } else {
              console.error('Error creating family member - duplicate but cannot fetch:', createError);
              return;
            }
          } else {
            console.error('Error creating family member:', createError);
            return;
          }
        } else if (newMember) {
          member = newMember;
          console.log('Created family member record for location sharing');
        }
      } else if (memberError && memberError.code !== 'PGRST116') {
        console.error('Error finding family member:', memberError);
        return;
      }

      if (!member) {
        return;
      }

      // Get battery level if available
      const batteryLevel = await this.getBatteryLevel();

      // Update location in database with exact coordinates
      // User is online only when location sharing is enabled
      const { error } = await supabase
        .from('family_members')
        .update({
          location_latitude: location.latitude,
          location_longitude: location.longitude,
          location_address: location.address,
          last_seen: new Date().toISOString(),
          is_online: shareLocation, // Online only when sharing location
          share_location: shareLocation,
          battery_level: batteryLevel,
        })
        .eq('id', member.id);

      if (error) {
        console.error('Error updating location in database:', error);
      } else {
        console.log(`Location updated: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
        // Note: saveLocationHistory is now called separately to ensure it always runs
        // even if updateLocationInDatabase is skipped due to stationary detection
      }
    } catch (error) {
      console.error('Error in updateLocationInDatabase:', error);
    }
  }

  /**
   * Load location update frequency from user settings
   */
  private async loadLocationUpdateFrequency(): Promise<void> {
    if (!this.userId) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('location_update_frequency_minutes')
        .eq('user_id', this.userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Settings don't exist, use default
          this.locationUpdateFrequencyMinutes = 60;
          if (__DEV__) {
            console.log('User settings not found, using default frequency: 60 minutes');
          }
        } else {
          console.error('Error loading location update frequency:', error);
          // Use default on error
          this.locationUpdateFrequencyMinutes = 60;
        }
      } else if (data) {
        const newFrequency = data.location_update_frequency_minutes || 60;
        if (newFrequency !== this.locationUpdateFrequencyMinutes) {
          this.locationUpdateFrequencyMinutes = newFrequency;
          if (__DEV__) {
            console.log(`Location update frequency updated: ${this.locationUpdateFrequencyMinutes} minutes`);
          }
        } else {
          this.locationUpdateFrequencyMinutes = newFrequency;
        }
      }
    } catch (error) {
      console.error('Error loading location update frequency:', error);
      // Use default on error
      this.locationUpdateFrequencyMinutes = 60;
    }
  }

  /**
   * Refresh location update frequency from user settings
   * Call this when user changes their frequency setting
   */
  async refreshLocationUpdateFrequency(): Promise<void> {
    await this.loadLocationUpdateFrequency();
  }

  /**
   * Save location to history
   * Inserts a new row into location_history table based on user's frequency setting
   * Respects location_update_frequency_minutes from user_settings
   * The only requirement is that userId must be set
   */
  private async saveLocationHistory(location: LocationType): Promise<void> {
    // Only requirement: userId must be set
    if (!this.userId) {
      if (__DEV__) {
        console.warn('Cannot save location history: userId not set');
      }
      return;
    }

    // Check if enough time has passed since last insert based on frequency setting
    const now = Date.now();
    const frequencyMs = this.locationUpdateFrequencyMinutes * 60 * 1000; // Convert minutes to milliseconds
    const timeSinceLastInsert = now - this.lastLocationHistoryInsert;

    if (this.lastLocationHistoryInsert > 0 && timeSinceLastInsert < frequencyMs) {
      // Not enough time has passed, skip insert
      if (__DEV__) {
        const minutesRemaining = Math.ceil((frequencyMs - timeSinceLastInsert) / (60 * 1000));
        console.log(`Skipping location history insert - ${minutesRemaining} minutes remaining until next insert (frequency: ${this.locationUpdateFrequencyMinutes} minutes)`);
      }
      return;
    }

    // Try to get address if not already available
    let addressToSave = location.address;
    if (!addressToSave) {
      // Attempt to geocode the address (with rate limiting)
      try {
        addressToSave = await this.reverseGeocode(
          location.latitude,
          location.longitude,
          false, // Don't force - respect rate limits
          false // Not emergency mode
        );
      } catch (error) {
        // If geocoding fails, continue without address
        if (__DEV__) {
          console.warn('Geocoding failed for location history, saving without address:', error);
        }
      }
    }

    // Insert location history as a new row
    // This respects the user's frequency setting
    try {
      const { error } = await supabase
        .from('location_history')
        .insert({
          user_id: this.userId,
          latitude: location.latitude,
          longitude: location.longitude,
          address: addressToSave || null,
        });

      if (error) {
        console.error('Error saving location history:', error);
      } else {
        // Update last insert timestamp (both in memory and AsyncStorage for background task)
        this.lastLocationHistoryInsert = now;
        if (this.userId) {
          try {
            await AsyncStorage.setItem(`location_history_last_insert_${this.userId}`, now.toString());
          } catch (storageError) {
            // Silently fail - memory tracking is sufficient
          }
        }
        if (__DEV__) {
          console.log('Location history inserted successfully', {
            lat: location.latitude.toFixed(6),
            lng: location.longitude.toFixed(6),
            hasAddress: !!addressToSave,
            frequency: `${this.locationUpdateFrequencyMinutes} minutes`,
          });
        }
      }
    } catch (error) {
      console.error('Error in saveLocationHistory:', error);
    }
  }

  /**
   * Check if device has internet connectivity
   * Attempts a simple Supabase query to verify connectivity
   */
  private async isOnline(): Promise<boolean> {
    try {
      // Try a simple query to check connectivity
      // Use a lightweight query that should work even if table is empty
      const { error } = await supabase
        .from('location_history')
        .select('id')
        .limit(1)
        .maybeSingle();

      // If we get an error, check if it's a network error
      if (error) {
        const errorMessage = error.message?.toLowerCase() || '';
        const isNetworkError = 
          errorMessage.includes('network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('failed to fetch') ||
          errorMessage.includes('network request failed') ||
          error.code === 'PGRST301' || // Connection error
          error.code === 'PGRST302';    // Timeout

        if (isNetworkError) {
          if (__DEV__) {
            console.log('No internet connection detected');
          }
          return false;
        }
      }

      // If no error or non-network error, assume online
      return true;
    } catch (error: any) {
      // Catch network errors in the catch block
      const errorMessage = error?.message?.toLowerCase() || '';
      const isNetworkError = 
        errorMessage.includes('network') ||
        errorMessage.includes('fetch') ||
        errorMessage.includes('failed to fetch') ||
        errorMessage.includes('network request failed');

      if (isNetworkError) {
        if (__DEV__) {
          console.log('No internet connection detected (catch block)');
        }
        return false;
      }

      // Unknown error, assume online (let the caller handle it)
      return true;
    }
  }

  /**
   * Get the last location from location_history for a user
   * Used as fallback when offline
   * @param userId - User ID to fetch last location for (optional, uses this.userId if not provided)
   */
  async getLastLocationFromHistory(userId?: string): Promise<LocationType | null> {
    const targetUserId = userId || this.userId;
    if (!targetUserId) {
      return null;
    }
    try {
      const { data, error } = await supabase
        .from('location_history')
        .select('latitude, longitude, address, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // If it's a network error, that's expected when offline
        const errorMessage = error.message?.toLowerCase() || '';
        const isNetworkError = 
          errorMessage.includes('network') ||
          errorMessage.includes('fetch') ||
          errorMessage.includes('failed to fetch') ||
          errorMessage.includes('network request failed');

        if (!isNetworkError) {
          console.error('Error fetching last location from history:', error);
        }
        return null;
      }

      if (data) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address || undefined,
        };
      }

      return null;
    } catch (error: any) {
      // Network errors are expected when offline
      const errorMessage = error?.message?.toLowerCase() || '';
      const isNetworkError = 
        errorMessage.includes('network') ||
        errorMessage.includes('fetch') ||
        errorMessage.includes('failed to fetch') ||
        errorMessage.includes('network request failed');

      if (!isNetworkError) {
        console.error('Error in getLastLocationFromHistory:', error);
      }
      return null;
    }
  }

  /**
   * Get location history for a user
   */
  async getLocationHistory(
    userId: string,
    hours: number = 24
  ): Promise<Array<LocationType & { timestamp: string }>> {
    try {
      const since = new Date();
      since.setHours(since.getHours() - hours);

      console.log('getLocationHistory: Fetching for user:', userId, 'since:', since.toISOString());

      const { data, error } = await supabase
        .from('location_history')
        .select('latitude, longitude, address, created_at')
        .eq('user_id', userId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false }); // Most recent first

      if (error) {
        console.error('Error fetching location history:', error);
        return [];
      }

      const result = (data || []).map((item) => ({
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address || undefined,
        timestamp: item.created_at,
      }));

      console.log('getLocationHistory: Found', result.length, 'locations');
      return result;
    } catch (error) {
      console.error('Error in getLocationHistory:', error);
      return [];
    }
  }

  /**
   * Check if location changed significantly
   */
  private shouldUpdateLocation(newLocation: LocationType): boolean {
    if (!this.lastLocation) {
      return true;
    }

    // Calculate distance between last and new location
    const distance = this.calculateDistance(
      this.lastLocation.latitude,
      this.lastLocation.longitude,
      newLocation.latitude,
      newLocation.longitude
    );

    // Update if moved more than threshold
    return distance > this.config.distanceThreshold;
  }

  /**
   * Check if database should be updated
   * Only update if:
   * 1. User has moved significantly (more than distanceThreshold), OR
   * 2. It's been a very long time since last update (even if stationary)
   * 
   * BLOCKS updates if:
   * - User has been in same location (within 30m) for more than 1 hour
   */
  private shouldUpdateDatabase(newLocation: LocationType): boolean {
    const now = Date.now();

    // If no previous database update, always update
    if (!this.lastDatabaseUpdate) {
      return true;
    }

    // Check distance from last database update
    const distance = this.calculateDistance(
      this.lastDatabaseUpdate.location.latitude,
      this.lastDatabaseUpdate.location.longitude,
      newLocation.latitude,
      newLocation.longitude
    );

    // If user moved more than 30m away from threshold, ALWAYS update location
    if (distance > this.STATIONARY_BLOCK_DISTANCE) {
      // User moved away from stationary location - reset tracking and allow update
      this.stationaryBlockLocation = null;
      if (__DEV__) {
        console.log(`User moved ${distance.toFixed(1)}m away from threshold - allowing location update`);
      }
      return true;
    }

    // User is within 30m - check if they've been stationary for 1+ hour
    if (this.stationaryBlockLocation) {
      // Check if still in same location as tracked stationary location
      const distanceFromStationary = this.calculateDistance(
        this.stationaryBlockLocation.location.latitude,
        this.stationaryBlockLocation.location.longitude,
        newLocation.latitude,
        newLocation.longitude
      );

      if (distanceFromStationary <= this.STATIONARY_BLOCK_DISTANCE) {
        // Still in same stationary location - check time
        const timeStationary = now - this.stationaryBlockLocation.timestamp;
        
        if (timeStationary >= this.STATIONARY_BLOCK_THRESHOLD) {
          // User has been stationary for 1+ hour - BLOCK all updates
          if (__DEV__) {
            console.log(`Blocking location update - user stationary for ${Math.round(timeStationary / 60000)} minutes (${Math.round(timeStationary / 3600000)} hours) within ${distance.toFixed(1)}m`);
          }
          return false;
        }
      } else {
        // Moved to a different location within 30m - reset tracking
        this.stationaryBlockLocation = {
          location: { ...newLocation },
          timestamp: now,
        };
      }
    } else {
      // Start tracking stationary location
      this.stationaryBlockLocation = {
        location: { ...newLocation },
        timestamp: now,
      };
    }

    // Check if it's been a very long time since last update (30+ minutes)
    // Update even if stationary to keep last_seen timestamp fresh
    // BUT only if not blocked by 1-hour stationary rule above
    const timeSinceLastUpdate = now - this.lastDatabaseUpdate.timestamp;
    if (timeSinceLastUpdate >= this.STATIONARY_UPDATE_INTERVAL) {
      // Only allow update if hasn't been stationary for 1+ hour
      if (!this.stationaryBlockLocation || 
          (now - this.stationaryBlockLocation.timestamp) < this.STATIONARY_BLOCK_THRESHOLD) {
        return true;
      }
      // Blocked by 1-hour stationary rule
      return false;
    }

    // Only update if moved more than threshold (50m) when within 30m zone
    return distance > this.config.distanceThreshold;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Update location sharing status
   * When disabled, also sets user as offline (unless user is admin)
   */
  async updateSharingStatus(shareLocation: boolean): Promise<void> {
    if (!this.userId || !this.familyGroupId) {
      return;
    }

    try {
      let { data: member, error: memberError } = await supabase
        .from('family_members')
        .select('id')
        .eq('family_group_id', this.familyGroupId)
        .eq('user_id', this.userId)
        .single();

      // If member doesn't exist, create it
      if (memberError && memberError.code === 'PGRST116') {
        // First, verify that the family group exists
        const { data: familyGroup, error: groupError } = await supabase
          .from('family_groups')
          .select('id')
          .eq('id', this.familyGroupId)
          .single();

        if (groupError || !familyGroup) {
          console.error('Error: Family group does not exist:', this.familyGroupId, groupError);
          // Clear the invalid family group ID to prevent retries
          this.familyGroupId = null;
          return;
        }

        // Get user data
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, name, phone, photo')
          .eq('id', this.userId)
          .single();

        if (userError || !userData) {
          console.error('Error fetching user data for sharing status:', userError);
          return;
        }

        // Create family member record
        const { data: newMember, error: createError } = await supabase
          .from('family_members')
          .insert({
            family_group_id: this.familyGroupId,
            user_id: this.userId,
            name: userData.name,
            relationship: 'Me',
            phone: userData.phone,
            photo: userData.photo,
            share_location: shareLocation,
            is_online: shareLocation, // Online only if sharing location
            battery_level: 100,
          })
          .select('id')
          .single();

        if (createError || !newMember) {
          // Handle foreign key constraint violation (family group doesn't exist)
          if (createError?.code === '23503') {
            console.error('Error: Family group does not exist for family_group_id:', this.familyGroupId);
            // Clear the invalid family group ID to prevent retries
            this.familyGroupId = null;
            return;
          }
          
          console.error('Error creating family member for sharing status:', createError);
          return;
        }

        member = newMember;
      } else if (memberError) {
        console.error('Error finding family member for sharing status:', memberError);
        return;
      }

      if (member) {
        // Update sharing status and online status
        // User is online only when location sharing is enabled
        await supabase
          .from('family_members')
          .update({ 
            share_location: shareLocation,
            is_online: shareLocation, // Online only when sharing location
            last_seen: new Date().toISOString(),
          })
          .eq('id', member.id);
        
        console.log(`Location sharing ${shareLocation ? 'enabled' : 'disabled'}, user ${shareLocation ? 'online' : 'offline'}`);
      }
    } catch (error) {
      console.error('Error updating sharing status:', error);
    }
  }

  /**
   * Get address from coordinates (public method for forcing geocoding)
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @param force - Force geocoding even if rate limited (use with caution)
   */
  async getAddressFromCoordinates(latitude: number, longitude: number, force: boolean = true): Promise<string | null> {
    return this.reverseGeocode(latitude, longitude, force);
  }

  /**
   * Get battery level (if available)
   */
  async getBatteryLevel(): Promise<number> {
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      // Convert to percentage (0-1 to 0-100)
      return Math.round(batteryLevel * 100);
    } catch (error) {
      console.error('Error getting battery level:', error);
      // Return default value if battery level cannot be retrieved
      return 100;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LocationServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if currently tracking
   */
  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }

  /**
   * Notify location service that a location update was made to the database
   * This helps track the last database update for blocking logic
   * @param location - The location that was updated
   */
  notifyLocationUpdated(location: LocationType): void {
    this.lastDatabaseUpdate = {
      location: { ...location },
      timestamp: Date.now(),
    };
  }

  /**
   * Check if location update should be blocked due to stationary status
   * Returns true if update should be blocked (user stationary for 1+ hour within 30m)
   * Returns false if user moved away from 30m threshold (update should proceed)
   * @param newLocation - The new location to check
   * @returns true if update should be blocked, false otherwise
   */
  shouldBlockLocationUpdate(newLocation: LocationType): boolean {
    const now = Date.now();

    // If no previous database update, allow update
    if (!this.lastDatabaseUpdate) {
      return false;
    }

    // Check distance from last database update
    const distance = this.calculateDistance(
      this.lastDatabaseUpdate.location.latitude,
      this.lastDatabaseUpdate.location.longitude,
      newLocation.latitude,
      newLocation.longitude
    );

    // If user moved more than 30m away from threshold, ALWAYS allow update
    if (distance > this.STATIONARY_BLOCK_DISTANCE) {
      // User moved away from stationary location - reset tracking and allow update
      this.stationaryBlockLocation = null;
      if (__DEV__) {
        console.log(`User moved ${distance.toFixed(1)}m away from threshold - allowing location update`);
      }
      return false;
    }

    // User is within 30m - check if they've been stationary for 1+ hour
    if (this.stationaryBlockLocation) {
      // Check if still in same location as tracked stationary location
      const distanceFromStationary = this.calculateDistance(
        this.stationaryBlockLocation.location.latitude,
        this.stationaryBlockLocation.location.longitude,
        newLocation.latitude,
        newLocation.longitude
      );

      if (distanceFromStationary <= this.STATIONARY_BLOCK_DISTANCE) {
        // Still in same stationary location - check time
        const timeStationary = now - this.stationaryBlockLocation.timestamp;
        
        if (timeStationary >= this.STATIONARY_BLOCK_THRESHOLD) {
          // User has been stationary for 1+ hour - BLOCK all updates
          if (__DEV__) {
            console.log(`Blocking location update - user stationary for ${Math.round(timeStationary / 60000)} minutes (${Math.round(timeStationary / 3600000)} hours) within ${distance.toFixed(1)}m`);
          }
          return true;
        }
      } else {
        // Moved to a different location within 30m - reset tracking
        this.stationaryBlockLocation = {
          location: { ...newLocation },
          timestamp: now,
        };
      }
    } else {
      // Start tracking stationary location
      this.stationaryBlockLocation = {
        location: { ...newLocation },
        timestamp: now,
      };
    }

    return false;
  }

  /**
   * Start emergency location tracking - saves location to history every 1 hour
   */
  async startEmergencyLocationTracking(userId: string): Promise<void> {
    if (this.isEmergencyTracking) {
      console.log('Emergency location tracking already started');
      return;
    }

    const permissionResult = await this.requestPermissions();
    if (!permissionResult.granted) {
      throw new Error(permissionResult.message || 'Location permissions not granted');
    }

    this.userId = userId;
    this.isEmergencyTracking = true;

    // Get initial location with address and save it to history (permission already requested)
    const initialLocation = await this.getHighAccuracyLocation(true);
    if (initialLocation) {
      // Try to get address if not already available
      if (!initialLocation.address) {
        const address = await this.reverseGeocode(
          initialLocation.latitude,
          initialLocation.longitude,
          true, // Force geocoding for initial location
          true // Emergency mode
        );
        if (address) {
          initialLocation.address = address;
        }
      }
      await this.saveLocationHistory(initialLocation);
      this.lastLocation = initialLocation;
      console.log('Emergency tracking: Initial location saved', initialLocation.address || 'no address');
    }

    let lastGeocodedLocation: LocationType | null = initialLocation;

    // Start tracking every 1 hour
    this.emergencyTrackingInterval = setInterval(async () => {
      try {
        // Get location coordinates
        const hasPermission = await this.checkPermissions();
        if (!hasPermission) {
          return;
        }

        // Use iOS-specific options for fresh GPS reading
        const positionOptions = Platform.OS === 'ios'
          ? {
              accuracy: Location.Accuracy.BestForNavigation,
              maximumAge: 0, // Force fresh location
              timeout: 15000,
              distanceInterval: 0,
            }
          : {
              accuracy: Location.Accuracy.Highest,
              maximumAge: 5000,
              timeout: 10000,
            };

        const position = await Location.getCurrentPositionAsync(positionOptions);

        const location: LocationType = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        // Try to get address for each update (since we're only updating hourly, we can geocode each time)
        try {
          const address = await this.reverseGeocode(
            location.latitude,
            location.longitude,
            false, // Don't force
            true // Emergency mode - allows more frequent geocoding
          );
          if (address) {
            location.address = address;
            lastGeocodedLocation = { ...location };
            console.log('Emergency: Address fetched:', address.substring(0, 50));
          } else if (lastGeocodedLocation?.address) {
            // Use last known address if geocoding failed/rate-limited
            location.address = lastGeocodedLocation.address;
          }
        } catch (error) {
          // If geocoding fails, use last known address
          if (lastGeocodedLocation?.address) {
            location.address = lastGeocodedLocation.address;
          }
        }

        // Save to location history every 1 hour during emergency
        await this.saveLocationHistory(location);
        this.lastLocation = location;
        
        if (location.address) {
          console.log(`Emergency location saved: ${location.address.substring(0, 50)}...`);
        } else {
          console.log(`Emergency location saved: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (no address)`);
        }
      } catch (error) {
        console.error('Error in emergency location tracking:', error);
      }
    }, 3600000); // 1 hour = 3600000 milliseconds

    console.log('Emergency location tracking started - saving location every 1 hour');
  }

  /**
   * Stop emergency location tracking
   */
  stopEmergencyLocationTracking(): void {
    if (this.emergencyTrackingInterval) {
      clearInterval(this.emergencyTrackingInterval);
      this.emergencyTrackingInterval = null;
    }
    this.isEmergencyTracking = false;
    this.stationaryLocation = null; // Reset stationary location tracking
    this.stationaryBlockLocation = null; // Reset stationary block tracking
    console.log('Emergency location tracking stopped');
  }

  /**
   * Check if emergency tracking is active
   */
  isEmergencyTrackingActive(): boolean {
    return this.isEmergencyTracking;
  }

  /**
   * Save location to history (public method)
   * Uses upsert to prevent duplicates - updates if user_id exists, inserts if not
   * Database unique constraint on user_id ensures no duplicates can be created
   */
  async saveLocationToHistory(userId: string, location: LocationType, forceInsert: boolean = false): Promise<void> {
    if (!userId) {
      return;
    }

    try {
      // Check if user_id exists first
      const { data: existingEntry } = await supabase
        .from('location_history')
        .select('id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const userExists = existingEntry !== null;

      if (userExists) {
        // User_id exists - ALWAYS update, NEVER insert
        const { error: updateError } = await supabase
          .from('location_history')
          .update({
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address || null,
            // created_at is automatically preserved on UPDATE
          })
          .eq('user_id', userId); // Update by user_id (unique constraint ensures only one row)

        if (updateError) {
          if (__DEV__) {
            console.warn('Error updating location history:', updateError);
          }
        } else {
          if (__DEV__) {
            console.log('Location history updated successfully - user_id exists');
          }
        }
      } else {
        // User_id does NOT exist - insert new record
        const { error: insertError } = await supabase
          .from('location_history')
          .insert({
            user_id: userId,
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address || null,
          });

        if (insertError) {
          // If insert fails due to unique constraint (race condition), update instead
          if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
            if (__DEV__) {
              console.log('Duplicate detected during insert (race condition), updating instead');
            }
            
            // Update existing entry (created by another concurrent request)
            const { error: updateError } = await supabase
              .from('location_history')
              .update({
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address || null,
              })
              .eq('user_id', userId);

            if (updateError) {
              if (__DEV__) {
                console.warn('Error updating after duplicate insert error:', updateError);
              }
            } else {
              if (__DEV__) {
                console.log('Location history updated successfully (after race condition)');
              }
            }
          } else {
            if (__DEV__) {
              console.warn('Error inserting location history:', insertError);
            }
          }
        } else {
          if (__DEV__) {
            console.log('Location history inserted successfully - new user_id');
          }
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('Error in saveLocationToHistory:', error);
      }
    }
  }

  /**
   * Start SOS location tracking - inserts one row every 1 hour
   * After 5 rows are inserted, switches to updating them in rotation
   */
  async startSOSLocationTracking(userId: string): Promise<void> {
    if (this.isSosLocationTracking) {
      console.log('SOS location tracking already started');
      return;
    }

    if (!userId) {
      console.warn('Cannot start SOS location tracking: userId is required');
      return;
    }

    this.isSosLocationTracking = true;
    this.sosLocationInsertCount = 0;
    this.sosLocationUpdateIndex = 0;
    this.sosLocationRowIds = [];

    // Start tracking every 1 hour
    // First execution will happen after 1 hour
    this.sosLocationTrackingInterval = setInterval(async () => {
      try {
        const hasPermission = await this.checkPermissions();
        if (!hasPermission) {
          return;
        }

        // Use iOS-specific options for fresh GPS reading
        const positionOptions = Platform.OS === 'ios'
          ? {
              accuracy: Location.Accuracy.BestForNavigation,
              maximumAge: 0, // Force fresh location
              timeout: 15000,
              distanceInterval: 0,
            }
          : {
              accuracy: Location.Accuracy.Highest,
              maximumAge: 5000,
              timeout: 10000,
            };

        const position = await Location.getCurrentPositionAsync(positionOptions);

        const location: LocationType = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        // Try to get address
        try {
          const address = await this.reverseGeocode(
            location.latitude,
            location.longitude,
            false,
            true // Emergency mode
          );
          if (address) {
            location.address = address;
          }
        } catch (error) {
          // Address geocoding failed, continue without it
        }

        await this.insertOrUpdateSOSLocation(userId, location);
      } catch (error) {
        console.error('Error in SOS location tracking interval:', error);
      }
    }, 3600000); // Every 1 hour (3600000 ms)

    // Execute immediately for first insert (then continue every 1 hour)
    (async () => {
      try {
        const hasPermission = await this.checkPermissions();
        if (!hasPermission) {
          return;
        }

        // Use iOS-specific options for fresh GPS reading
        const positionOptions = Platform.OS === 'ios'
          ? {
              accuracy: Location.Accuracy.BestForNavigation,
              maximumAge: 0, // Force fresh location
              timeout: 15000,
              distanceInterval: 0,
            }
          : {
              accuracy: Location.Accuracy.Highest,
              maximumAge: 5000,
              timeout: 10000,
            };

        const position = await Location.getCurrentPositionAsync(positionOptions);

        const location: LocationType = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        // Try to get address
        try {
          const address = await this.reverseGeocode(
            location.latitude,
            location.longitude,
            false,
            true // Emergency mode
          );
          if (address) {
            location.address = address;
          }
        } catch (error) {
          // Address geocoding failed, continue without it
        }

        await this.insertOrUpdateSOSLocation(userId, location);
      } catch (error) {
        console.error('Error in initial SOS location insert:', error);
      }
    })();

    console.log('SOS location tracking started - inserting/updating every 1 hour');
  }

  /**
   * Insert or update SOS location (circular buffer of 5 rows)
   * Inserts one row at a time every 1 hour until 5 rows exist
   * Then updates those 5 rows in rotation
   */
  private async insertOrUpdateSOSLocation(userId: string, location: LocationType): Promise<void> {
    // Check if we still need to insert rows (count < 5)
    if (this.sosLocationInsertCount < 5) {
      // Insert one new row
      try {
        const { data, error } = await supabase
          .from('location_history')
          .insert({
            user_id: userId,
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address || null,
          })
          .select('id')
          .single();

        if (error) {
          if (__DEV__) {
            console.warn('Error inserting SOS location history:', error);
          }
        } else if (data?.id) {
          this.sosLocationRowIds.push(data.id);
          this.sosLocationInsertCount++;
          if (__DEV__) {
            console.log(`SOS location row ${this.sosLocationInsertCount}/5 inserted (ID: ${data.id})`);
          }

          // If we just inserted the 5th row, we're ready to start updating
          if (this.sosLocationInsertCount === 5) {
            if (__DEV__) {
              console.log('5 rows inserted. Switching to update mode (rotating updates).');
            }
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Error in insertOrUpdateSOSLocation (insert):', error);
        }
      }
    } else {
      // All 5 rows inserted, now update in rotation
      // If we don't have row IDs (shouldn't happen, but safety check)
      if (this.sosLocationRowIds.length === 0) {
        await this.fetchSOSLocationRowIds(userId);
      }

      if (this.sosLocationRowIds.length > 0) {
        const rowIdToUpdate = this.sosLocationRowIds[this.sosLocationUpdateIndex];
        
        try {
          const { error } = await supabase
            .from('location_history')
            .update({
              latitude: location.latitude,
              longitude: location.longitude,
              address: location.address || null,
            })
            .eq('id', rowIdToUpdate);

          if (error) {
            if (__DEV__) {
              console.warn(`Error updating SOS location row ${this.sosLocationUpdateIndex + 1}:`, error);
            }
          } else {
            if (__DEV__) {
              console.log(`SOS location row ${this.sosLocationUpdateIndex + 1}/5 updated (ID: ${rowIdToUpdate})`);
            }
          }
        } catch (error) {
          if (__DEV__) {
            console.warn('Error in insertOrUpdateSOSLocation (update):', error);
          }
        }

        // Move to next row (circular: 0, 1, 2, 3, 4, then back to 0)
        this.sosLocationUpdateIndex = (this.sosLocationUpdateIndex + 1) % 5;
      }
    }
  }

  /**
   * Fetch the 5 most recent location history row IDs for a user
   */
  private async fetchSOSLocationRowIds(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('location_history')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        if (__DEV__) {
          console.warn('Error fetching SOS location row IDs:', error);
        }
      } else if (data && data.length > 0) {
        // Store IDs in reverse order (oldest first) for circular updates
        this.sosLocationRowIds = data.map(row => row.id).reverse();
        this.sosLocationInsertCount = this.sosLocationRowIds.length;
        if (__DEV__) {
          console.log(`Fetched ${this.sosLocationRowIds.length} SOS location row IDs`);
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('Error in fetchSOSLocationRowIds:', error);
      }
    }
  }

  /**
   * Stop SOS location tracking
   */
  stopSOSLocationTracking(): void {
    if (this.sosLocationTrackingInterval) {
      clearInterval(this.sosLocationTrackingInterval);
      this.sosLocationTrackingInterval = null;
    }
    this.isSosLocationTracking = false;
    this.sosLocationRowIds = [];
    this.sosLocationInsertCount = 0;
    this.sosLocationUpdateIndex = 0;
    console.log('SOS location tracking stopped');
  }

  /**
   * Check if SOS location tracking is active
   */
  isSOSLocationTrackingActive(): boolean {
    return this.isSosLocationTracking;
  }
}

export const locationService = new LocationService();

