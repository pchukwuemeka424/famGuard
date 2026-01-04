import { supabase } from '../lib/supabase';
import { pushNotificationService } from '../services/pushNotificationService';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Debug utility to test and verify push notification setup
 */
export class PushNotificationDebug {
  /**
   * Test push notification registration and show detailed status
   */
  static async testRegistration(userId: string): Promise<void> {
    const results: string[] = [];
    
    try {
      // 1. Check if user exists in database
      results.push('1. Checking user in database...');
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('id', userId)
        .single();
      
      if (userError || !user) {
        results.push(`   ❌ User not found: ${userError?.message}`);
        Alert.alert('Debug Test Failed', results.join('\n'));
        return;
      }
      results.push(`   ✅ User found: ${user.email}`);
      
      // 2. Check notification permission
      results.push('\n2. Checking notification permission...');
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      results.push(`   Status: ${status}`);
      results.push(`   Can ask again: ${canAskAgain}`);
      
      if (status !== 'granted') {
        results.push('   ⚠️ Permission not granted - requesting...');
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        results.push(`   New status: ${newStatus}`);
        if (newStatus !== 'granted') {
          results.push('   ❌ Permission denied');
          Alert.alert('Debug Test', results.join('\n'));
          return;
        }
      }
      results.push('   ✅ Permission granted');
      
      // 3. Check Expo project ID
      results.push('\n3. Checking Expo project ID...');
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || 
                       process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
                       '84162762-f743-411c-8b9a-0ed643cdb7a2';
      results.push(`   Project ID: ${projectId ? projectId.substring(0, 20) + '...' : 'NOT FOUND'}`);
      
      if (!projectId) {
        results.push('   ❌ Project ID not found');
        Alert.alert('Debug Test', results.join('\n'));
        return;
      }
      results.push('   ✅ Project ID found');
      
      // 4. Get push token
      results.push('\n4. Getting Expo push token...');
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenData.data;
      
      if (!token) {
        results.push('   ❌ Failed to get push token');
        Alert.alert('Debug Test', results.join('\n'));
        return;
      }
      results.push(`   ✅ Token received: ${token.substring(0, 30)}...`);
      
      // 5. Check if token exists in database
      results.push('\n5. Checking database for existing token...');
      const { data: existingToken, error: tokenError } = await supabase
        .from('user_push_tokens')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (existingToken && !tokenError) {
        results.push(`   ✅ Token exists in database`);
        results.push(`   Platform: ${existingToken.platform}`);
        results.push(`   Device: ${existingToken.device_id}`);
        results.push(`   Created: ${new Date(existingToken.created_at).toLocaleString()}`);
      } else {
        results.push('   ⚠️ Token not found in database - will register...');
      }
      
      // 6. Register/update token
      results.push('\n6. Registering push token...');
      await pushNotificationService.initialize(userId);
      results.push('   ✅ Registration completed');
      
      // 7. Verify token was saved
      results.push('\n7. Verifying token in database...');
      const { data: verifyToken, error: verifyError } = await supabase
        .from('user_push_tokens')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (verifyToken && !verifyError) {
        results.push('   ✅ Token verified in database');
        results.push(`   Platform: ${verifyToken.platform}`);
        results.push(`   Device: ${verifyToken.device_id}`);
      } else {
        results.push(`   ❌ Token not found: ${verifyError?.message}`);
      }
      
      // 8. Test sending a notification
      results.push('\n8. Testing notification send...');
      const testResult = await this.testSendNotification(userId);
      results.push(testResult);
      
      Alert.alert('Push Notification Debug Test', results.join('\n'));
    } catch (error: any) {
      results.push(`\n❌ Error: ${error?.message || String(error)}`);
      Alert.alert('Debug Test Error', results.join('\n'));
    }
  }
  
  /**
   * Test sending a notification to the current user
   */
  static async testSendNotification(userId: string): Promise<string> {
    try {
      const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || 
                         process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
                             process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        return '   ❌ Supabase URL or key not configured';
      }
      
      const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          user_ids: [userId],
          title: '🧪 Test Notification',
          body: 'If you see this, push notifications are working!',
          data: { type: 'test' },
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.sent > 0) {
          return `   ✅ Test notification sent successfully!`;
        } else {
          return `   ⚠️ ${result.message || 'No tokens found'}`;
        }
      } else {
        const errorText = await response.text();
        return `   ❌ Failed to send: ${errorText.substring(0, 100)}`;
      }
    } catch (error: any) {
      return `   ❌ Error: ${error?.message}`;
    }
  }
  
  /**
   * Get current push notification status
   */
  static async getStatus(userId: string): Promise<string> {
    const status: string[] = [];
    
    // Check permission
    const { status: permStatus } = await Notifications.getPermissionsAsync();
    status.push(`Permission: ${permStatus}`);
    
    // Check token in database
    const { data: token } = await supabase
      .from('user_push_tokens')
      .select('platform, device_id, created_at')
      .eq('user_id', userId)
      .single();
    
    if (token) {
      status.push(`Token: ✅ Registered (${token.platform})`);
      status.push(`Device: ${token.device_id}`);
    } else {
      status.push('Token: ❌ Not registered');
    }
    
    return status.join('\n');
  }
}

