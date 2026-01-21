import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import { supabase } from '../lib/supabase';
import type { Location as LocationType } from '../types';

const LOCATION_TASK_NAME = 'background-location-task';

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    
    if (locations && locations.length > 0) {
      const location = locations[0];
      const locationData: LocationType = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // Try to get address (with rate limiting)
      try {
        const reverseGeocoded = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (reverseGeocoded.length > 0) {
          const addr = reverseGeocoded[0];
          const parts = [
            addr.streetNumber,
            addr.street,
            addr.city,
            addr.region,
            addr.country,
          ].filter(Boolean);
          locationData.address = parts.join(', ') || undefined;
        }
      } catch (geocodeError) {
        // Silently fail geocoding - location coordinates are more important
        console.warn('Background geocoding failed:', geocodeError);
      }

      // Validate coordinates before processing (backend filtering)
      const isValidCoordinate = (lat: number, lng: number): boolean => {
        if (typeof lat !== 'number' || typeof lng !== 'number') return false;
        if (lat < -90 || lat > 90) return false;
        if (lng < -180 || lng > 180) return false;
        // Filter out common invalid GPS readings (0,0 or near 0,0)
        if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
        return true;
      };

      if (!isValidCoordinate(locationData.latitude, locationData.longitude)) {
        console.warn('Background location: Invalid coordinates detected, skipping:', {
          lat: locationData.latitude,
          lng: locationData.longitude,
        });
        return; // Don't process invalid coordinates
      }

      // Get user ID and family group ID from AsyncStorage
      try {
        const userId = await AsyncStorage.getItem('location_tracking_userId');
        const familyGroupId = await AsyncStorage.getItem('location_tracking_familyGroupId');
        const shareLocationStr = await AsyncStorage.getItem('location_tracking_shareLocation');
        const shareLocation = shareLocationStr === 'true';

        if (!userId || !familyGroupId) {
          console.warn('Background location update: userId or familyGroupId not found in storage');
          return;
        }

        // Get battery level if available
        let batteryLevel = 100;
        try {
          const batteryLevelValue = await Battery.getBatteryLevelAsync();
          batteryLevel = Math.round(batteryLevelValue * 100);
        } catch (batteryError) {
          // Use default value if battery level cannot be retrieved
        }

        // Find the family member record for this user
        const { data: members, error: memberError } = await supabase
          .from('family_members')
          .select('id')
          .eq('family_group_id', familyGroupId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        const member = members && members.length > 0 ? members[0] : null;

        // Save to location_history every 30 minutes (fixed interval for background/closed app)
        // This ensures consistent location tracking when app is closed or in background
        try {
          // Fixed 30-minute interval for background/closed app location tracking
          const LOCATION_UPDATE_INTERVAL_MINUTES = 30;
          const frequencyMs = LOCATION_UPDATE_INTERVAL_MINUTES * 60 * 1000; // 30 minutes in milliseconds

          // Check if enough time has passed since last insert
          const lastInsertKey = `location_history_last_insert_${userId}`;
          const lastInsertTimeStr = await AsyncStorage.getItem(lastInsertKey);
          const lastInsertTime = lastInsertTimeStr ? parseInt(lastInsertTimeStr, 10) : 0;
          const now = Date.now();
          const timeSinceLastInsert = now - lastInsertTime;

          if (lastInsertTime > 0 && timeSinceLastInsert < frequencyMs) {
            // Not enough time has passed, skip insert
            const minutesRemaining = Math.ceil((frequencyMs - timeSinceLastInsert) / (60 * 1000));
            if (__DEV__) {
              console.log(`Skipping background location history insert - ${minutesRemaining} minutes remaining (30-minute interval)`);
            }
          } else {
            // ALWAYS insert new row into location_history - NEVER update existing rows
            // This creates a complete history of location updates
            // Get accuracy from location object - 0 is a valid value, only use null if undefined
            const locationAccuracy = location.coords?.accuracy !== undefined && location.coords?.accuracy !== null 
              ? location.coords.accuracy 
              : null;
            
            // IMPORTANT: Always use .insert() - never use .update() for location_history
            // Each location update creates a new row with a new timestamp
            const { error: historyError } = await supabase
              .from('location_history')
              .insert({
                user_id: userId,
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                address: locationData.address || null, // Keep null if no address (don't update to empty)
                accuracy: locationAccuracy, // Include accuracy (0 is valid, only null if undefined)
              });

            if (historyError) {
              console.warn('Error inserting location history in background (insert only, never update):', historyError);
            } else {
              // Update last insert timestamp in AsyncStorage (this is just for tracking, not database update)
              await AsyncStorage.setItem(lastInsertKey, now.toString());
              if (__DEV__) {
                console.log(`Background location inserted into history (new row created, 30-minute interval)`);
              }
            }
          }
        } catch (historyErr) {
          console.warn('Error in saveLocationHistory (background):', historyErr);
        }

        // Update connections table for real-time location sharing (if location sharing is enabled)
        if (shareLocation) {
          try {
            const { error: connectionsError } = await supabase
              .from('connections')
              .update({
                location_latitude: locationData.latitude,
                location_longitude: locationData.longitude,
                location_address: locationData.address || null,
                location_updated_at: new Date().toISOString(),
              })
              .eq('connected_user_id', userId)
              .eq('status', 'connected');

            if (connectionsError) {
              console.warn('Error updating connections table in background:', connectionsError);
            } else {
              if (__DEV__) {
                console.log('Background location updated in connections table:', {
                  lat: locationData.latitude.toFixed(6),
                  lng: locationData.longitude.toFixed(6),
                });
              }
            }
          } catch (connectionsErr) {
            console.warn('Error updating connections in background:', connectionsErr);
          }
        }

        // Update family_members table (if member exists)
        if (member) {
          // Update location in database
          const { error: updateError } = await supabase
            .from('family_members')
            .update({
              location_latitude: locationData.latitude,
              location_longitude: locationData.longitude,
              location_address: locationData.address || null,
              last_seen: new Date().toISOString(),
              is_online: shareLocation,
              share_location: shareLocation,
              battery_level: batteryLevel,
            })
            .eq('id', member.id);

          if (updateError) {
            console.error('Error updating location in background:', updateError);
          } else {
            if (__DEV__) {
              console.log('Background location updated in family_members:', {
                lat: locationData.latitude.toFixed(6),
                lng: locationData.longitude.toFixed(6),
              });
            }
          }
        } else {
          console.warn('Background location update: Family member not found (but history was saved)');
        }
      } catch (dbError) {
        console.error('Error updating location in background:', dbError);
      }
    }
  }
});

export { LOCATION_TASK_NAME };

