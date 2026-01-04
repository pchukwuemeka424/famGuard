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
            console.log('Background location updated:', {
              lat: locationData.latitude.toFixed(6),
              lng: locationData.longitude.toFixed(6),
            });
          }
        } else {
          console.warn('Background location update: Family member not found');
        }
      } catch (dbError) {
        console.error('Error updating location in background:', dbError);
      }
    }
  }
});

export { LOCATION_TASK_NAME };

