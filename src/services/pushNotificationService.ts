import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert, Linking } from 'react-native';
import { supabase } from '../lib/supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class PushNotificationService {
  private pushToken: string | null = null;
  private userId: string | null = null;

  /**
   * Initialize push notifications for a user
   * Call this after user logs in
   */
  async initialize(userId: string): Promise<void> {
    console.log('🔔 Initializing push notifications for user:', userId);
    this.userId = userId;

    try {
      // Register for push notifications
      const token = await this.registerForPushNotifications();
      
      if (token) {
        this.pushToken = token;
        // Save token to database
        await this.savePushToken(token);
        console.log('✅ Push notification token registered:', token.substring(0, 30) + '...');
      } else {
        const errorMsg = 'Push notification token registration returned null';
        console.error('❌ Push notification token is null - registration failed');
        console.error('   This means push notifications will NOT work for this user');
        console.error('   Possible causes:');
        console.error('   1. Running on simulator/emulator (requires physical device)');
        console.error('   2. Notification permission not granted');
        console.error('   3. Expo project ID not found');
        console.error('   4. Network error getting token from Expo');
        
        // Show alert to user on Android if permission might be the issue
        if (Platform.OS === 'android') {
          // Check permission status one more time
          const { status } = await Notifications.getPermissionsAsync();
          if (status !== 'granted') {
            // Permission is the issue - we'll let the caller show an alert
            throw new Error('Notification permission not granted. Please enable notifications in Settings > Apps > FamGuard > Notifications');
          }
        }
        
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error('❌ Error initializing push notifications:', {
        error: error,
        message: error?.message,
        stack: error?.stack,
      });
      // Re-throw so caller knows it failed
      throw error;
    }
  }

  /**
   * Register for push notifications and get the token
   */
  private async registerForPushNotifications(): Promise<string | null> {
    // Check if we're on a physical device
    if (!Device.isDevice) {
      console.warn('⚠️ Push notifications require a physical device (not simulator/emulator)');
      return null;
    }

    console.log('📱 Device check passed, proceeding with push notification registration');

    try {
      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('📋 Current notification permission status:', existingStatus);
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== 'granted') {
        console.log('🔔 Requesting push notification permission...');
        const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowAnnouncements: false,
          },
        });
        finalStatus = status;
        console.log('📋 Permission request result:', status, 'canAskAgain:', canAskAgain);

        // If permission was denied and we can't ask again, show alert
        if (status !== 'granted' && !canAskAgain && Platform.OS === 'android') {
          console.error('❌ Notification permission permanently denied');
          // Don't show alert here - let the caller handle it
          // The error will be thrown and logged
        }
      }

      if (finalStatus !== 'granted') {
        console.error('❌ Push notification permission not granted. Status:', finalStatus);
        console.error('   User must grant notification permission for push notifications to work');
        if (Platform.OS === 'android') {
          console.error('   On Android, go to: Settings > Apps > FamGuard > Notifications');
        }
        return null;
      }

      // Get the Expo project ID
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || 
                       process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
                       Constants.expoConfig?.extra?.EXPO_PUBLIC_EXPO_PROJECT_ID ||
                       '84162762-f743-411c-8b9a-0ed643cdb7a2'; // Fallback to hardcoded project ID

      console.log('🆔 Expo project ID:', projectId ? `${projectId.substring(0, 20)}...` : 'NOT FOUND');
      console.log('   Sources checked:', {
        'Constants.expoConfig?.extra?.eas?.projectId': Constants.expoConfig?.extra?.eas?.projectId,
        'process.env.EXPO_PUBLIC_EXPO_PROJECT_ID': process.env.EXPO_PUBLIC_EXPO_PROJECT_ID,
        'Constants.expoConfig?.extra?.EXPO_PUBLIC_EXPO_PROJECT_ID': Constants.expoConfig?.extra?.EXPO_PUBLIC_EXPO_PROJECT_ID,
        'Using fallback': !Constants.expoConfig?.extra?.eas?.projectId && !process.env.EXPO_PUBLIC_EXPO_PROJECT_ID,
      });

      if (!projectId) {
        console.error('❌ Expo project ID not found, push notifications will NOT work');
        return null;
      }

      // Get the push token
      console.log('🔑 Requesting Expo push token with project ID:', projectId);
      let tokenData;
      try {
        tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: projectId,
        });
      } catch (tokenError: any) {
        console.error('❌ Error getting Expo push token:', {
          error: tokenError,
          message: tokenError?.message,
          code: tokenError?.code,
        });
        return null;
      }

      const token = tokenData.data;
      console.log('✅ Expo push token received:', token ? `${token.substring(0, 30)}...` : 'null');

      // Set up Android notification channel
      if (Platform.OS === 'android') {
        console.log('🤖 Setting up Android notification channels...');
        await Notifications.setNotificationChannelAsync('emergency-alerts', {
          name: 'Emergency Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF0000',
          sound: 'default',
          enableLights: true,
          enableVibrate: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });

        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
        });
        console.log('✅ Android notification channels configured');
      }

      return token;
    } catch (error: any) {
      console.error('❌ Error registering for push notifications:', {
        error: error,
        message: error?.message,
        stack: error?.stack,
      });
      return null;
    }
  }

  /**
   * Save push token to database
   */
  private async savePushToken(token: string): Promise<void> {
    if (!this.userId) {
      console.warn('Cannot save push token: No user ID');
      return;
    }

    try {
      const deviceId = Constants.deviceId || Device.modelName || 'unknown';
      const platform = Platform.OS;

      console.log('Attempting to save push token:', {
        userId: this.userId,
        platform: platform,
        deviceId: deviceId,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...',
      });

      // Try upsert first
      let { data, error } = await supabase
        .from('user_push_tokens')
        .upsert(
          {
            user_id: this.userId,
            push_token: token,
            platform: platform,
            device_id: deviceId,
          },
          {
            onConflict: 'user_id',
            ignoreDuplicates: false,
          }
        )
        .select();

      // If upsert fails, try insert then update
      if (error && error.code === '23505') {
        // Unique constraint violation - try update instead
        console.log('Token exists, updating instead...');
        const { data: updateData, error: updateError } = await supabase
          .from('user_push_tokens')
          .update({
            push_token: token,
            platform: platform,
            device_id: deviceId,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', this.userId)
          .select();

        if (updateError) {
          console.error('Error updating push token:', {
            error: updateError,
            message: updateError.message,
            code: updateError.code,
            details: updateError.details,
            hint: updateError.hint,
          });
        } else {
          console.log('✅ Push token updated successfully:', {
            userId: this.userId,
            data: updateData,
          });
          data = updateData;
          error = null;
        }
      } else if (error) {
        // Try direct insert as fallback
        console.log('Upsert failed, trying direct insert...');
        console.log('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        
        const { data: insertData, error: insertError } = await supabase
          .from('user_push_tokens')
          .insert({
            user_id: this.userId,
            push_token: token,
            platform: platform,
            device_id: deviceId,
          })
          .select();

        if (insertError) {
          console.error('❌ CRITICAL: Error saving push token to database:', {
            error: insertError,
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint,
            userId: this.userId,
            platform: platform,
          });
          // Don't throw - log but continue
        } else {
          console.log('✅ Push token inserted successfully (fallback method):', {
            userId: this.userId,
            data: insertData,
          });
          data = insertData;
          error = null;
        }
      } else {
        console.log('✅ Push token saved successfully:', {
          userId: this.userId,
          data: data,
        });
      }
      
      // Final verification - check if token was actually saved
      if (!error && data) {
        const { data: verifyData, error: verifyError } = await supabase
          .from('user_push_tokens')
          .select('user_id, push_token, platform')
          .eq('user_id', this.userId)
          .single();
          
        if (verifyError || !verifyData) {
          console.error('❌ CRITICAL: Token was not saved to database after insert!', {
            verifyError,
            userId: this.userId,
          });
        } else {
          console.log('✅ Verified: Token exists in database:', {
            userId: verifyData.user_id,
            platform: verifyData.platform,
            tokenPrefix: verifyData.push_token?.substring(0, 20) + '...',
          });
        }
      }
    } catch (error: any) {
      console.error('Exception saving push token:', {
        error: error,
        message: error?.message,
        stack: error?.stack,
      });
    }
  }

  /**
   * Remove push token from database (call on logout)
   */
  async removePushToken(): Promise<void> {
    if (!this.userId) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_push_tokens')
        .delete()
        .eq('user_id', this.userId);

      if (error) {
        console.error('Error removing push token:', error);
      } else {
        console.log('Push token removed');
      }
    } catch (error) {
      console.error('Error removing push token:', error);
    }

    this.pushToken = null;
    this.userId = null;
  }

  /**
   * Get the current push token
   */
  getPushToken(): string | null {
    return this.pushToken;
  }

  /**
   * Manually re-register push token (for debugging/testing)
   */
  async reRegister(): Promise<boolean> {
    if (!this.userId) {
      console.error('Cannot re-register: No user ID set');
      return false;
    }

    console.log('🔄 Manually re-registering push token for user:', this.userId);
    try {
      await this.initialize(this.userId);
      return this.pushToken !== null;
    } catch (error) {
      console.error('Re-registration failed:', error);
      return false;
    }
  }

  /**
   * Check and request notification permission explicitly
   * Returns true if permission is granted, false otherwise
   */
  async requestPermissionExplicitly(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      
      if (existingStatus === 'granted') {
        console.log('✅ Notification permission already granted');
        return true;
      }

      console.log('🔔 Explicitly requesting notification permission...');
      const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: false,
        },
      });

      if (status === 'granted') {
        console.log('✅ Notification permission granted');
        return true;
      }

      // Permission denied
      if (!canAskAgain && Platform.OS === 'android') {
        Alert.alert(
          'Notification Permission Required',
          'Push notifications require notification permission. Please enable it in Settings > Apps > FamGuard > Notifications.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings().catch((err) => {
                  console.error('Error opening settings:', err);
                });
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Notification Permission Required',
          'Push notifications require notification permission to alert you about emergencies. Please grant permission when prompted.',
          [{ text: 'OK' }]
        );
      }

      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Add a listener for incoming notifications
   */
  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  }

  /**
   * Add a listener for notification responses (when user taps notification)
   */
  addNotificationResponseReceivedListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export const pushNotificationService = new PushNotificationService();

