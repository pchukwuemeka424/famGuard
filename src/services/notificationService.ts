import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const NOTIFICATION_TOKEN_KEY = 'expo_push_notification_token';

export interface PushNotificationData {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: boolean;
  priority?: 'default' | 'high';
}

class NotificationService {
  private pushToken: string | null = null;

  /**
   * Register for push notifications and save token to Supabase
   */
  async registerForPushNotifications(userId: string): Promise<string | null> {
    try {
      // Check if device is physical
      if (!Device.isDevice) {
        console.warn('Push notifications only work on physical devices');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Failed to get push token for push notification!');
        return null;
      }

      // Get push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_EXPO_PROJECT_ID,
      });

      this.pushToken = tokenData.data;
      
      // Save token locally
      await AsyncStorage.setItem(NOTIFICATION_TOKEN_KEY, this.pushToken);

      // Save token to Supabase
      await this.saveTokenToSupabase(userId, this.pushToken);

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default',
        });
      }

      return this.pushToken;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  /**
   * Save push token to Supabase database
   */
  private async saveTokenToSupabase(userId: string, token: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_push_tokens')
        .upsert({
          user_id: userId,
          push_token: token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Error saving push token to Supabase:', error);
      }
    } catch (error) {
      console.error('Error in saveTokenToSupabase:', error);
    }
  }

  /**
   * Save notification to database
   */
  private async saveNotificationToDatabase(
    userId: string,
    notification: PushNotificationData
  ): Promise<void> {
    try {
      // Extract notification type from data, default to 'general'
      const notificationType = (notification.data?.type as string) || 'general';
      
      // Validate type is one of the allowed values
      const validTypes = ['sos_alert', 'connection_added', 'location_updated', 'incident', 'general'];
      const type = validTypes.includes(notificationType) ? notificationType : 'general';

      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title: notification.title,
          body: notification.body,
          type: type,
          data: notification.data || {},
          read: false,
        });

      if (error) {
        console.error('Error saving notification to database:', error);
      } else {
        console.log('Notification saved to database for user:', userId);
      }
    } catch (error) {
      console.error('Error in saveNotificationToDatabase:', error);
      // Don't throw - notification sending should continue even if DB save fails
    }
  }

  /**
   * Send push notification via Supabase function or directly
   * Also saves notification to database
   */
  async sendPushNotification(
    userId: string,
    notification: PushNotificationData
  ): Promise<void> {
    try {
      // Save notification to database first (non-blocking)
      this.saveNotificationToDatabase(userId, notification).catch((error) => {
        console.warn('Failed to save notification to database (non-critical):', error);
      });

      // Try to send via Supabase Edge Function first
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId,
          notification: {
            title: notification.title,
            body: notification.body,
            data: notification.data || {},
            sound: notification.sound !== false,
            priority: notification.priority || 'high',
          },
        },
      });

      if (error) {
        console.warn('Edge function error, trying direct method:', error);
        // Fallback: Try sending directly via Expo Push API
        await this.sendPushNotificationDirect(userId, notification);
      } else {
        console.log('Push notification sent via edge function:', data);
      }
    } catch (error: any) {
      console.error('Error in sendPushNotification:', error);
      // Fallback: Try sending directly
      try {
        await this.sendPushNotificationDirect(userId, notification);
      } catch (fallbackError) {
        console.error('Fallback notification send also failed:', fallbackError);
      }
    }
  }

  /**
   * Send push notification directly via Expo Push API (fallback method)
   */
  private async sendPushNotificationDirect(
    userId: string,
    notification: PushNotificationData
  ): Promise<void> {
    try {
      // Get push token from database
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_push_tokens')
        .select('push_token')
        .eq('user_id', userId)
        .single();

      if (tokenError || !tokenData?.push_token) {
        console.warn('Push token not found for user:', userId);
        return;
      }

      // Send directly via Expo Push API
      const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
      
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: tokenData.push_token,
          sound: notification.sound !== false ? 'default' : undefined,
          title: notification.title || 'SafeZone',
          body: notification.body || '',
          data: notification.data || {},
          priority: notification.priority || 'high',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Direct push notification error:', errorText);
        throw new Error(`Failed to send push notification: ${errorText}`);
      }

      const result = await response.json();
      console.log('Push notification sent directly:', result);
    } catch (error) {
      console.error('Error in sendPushNotificationDirect:', error);
      throw error;
    }
  }

  /**
   * Get stored push token
   */
  async getStoredToken(): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem(NOTIFICATION_TOKEN_KEY);
      return token;
    } catch (error) {
      console.error('Error getting stored token:', error);
      return null;
    }
  }

  /**
   * Remove push token from Supabase
   */
  async removeToken(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_push_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('Error removing push token:', error);
      }

      await AsyncStorage.removeItem(NOTIFICATION_TOKEN_KEY);
      this.pushToken = null;
    } catch (error) {
      console.error('Error in removeToken:', error);
    }
  }

  /**
   * Set up notification listeners
   */
  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationTapped?: (response: Notifications.NotificationResponse) => void
  ): () => void {
    // Listener for notifications received while app is foregrounded
    const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    });

    // Listener for when user taps on notification
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
      onNotificationTapped?.(response);
    });

    // Return cleanup function - use .remove() method instead of deprecated removeNotificationSubscription
    return () => {
      if (receivedListener) {
        receivedListener.remove();
      }
      if (responseListener) {
        responseListener.remove();
      }
    };
  }

  /**
   * Schedule a local notification
   */
  async scheduleLocalNotification(
    notification: PushNotificationData,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          sound: notification.sound !== false,
          priority: notification.priority || 'high',
        },
        trigger: trigger || null,
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}

export const notificationService = new NotificationService();

