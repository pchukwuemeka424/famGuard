import { supabase } from '../lib/supabase';
import { locationService } from './locationService';
import type { UserCheckIn, CheckInSettings, Location } from '../types';

class CheckInService {
  private checkInInterval: NodeJS.Timeout | null = null;
  private missedCheckInCheckInterval: NodeJS.Timeout | null = null;
  private userId: string | null = null;
  private settings: CheckInSettings | null = null;

  /**
   * Initialize check-in service for a user
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    await this.loadSettings();
    if (this.settings?.enabled) {
      this.startPeriodicCheckIn();
      this.startMissedCheckInMonitoring();
    }
  }

  /**
   * Stop check-in service
   */
  stop(): void {
    if (this.checkInInterval) {
      clearInterval(this.checkInInterval);
      this.checkInInterval = null;
    }
    if (this.missedCheckInCheckInterval) {
      clearInterval(this.missedCheckInCheckInterval);
      this.missedCheckInCheckInterval = null;
    }
    this.userId = null;
    this.settings = null;
  }

  /**
   * Load check-in settings
   */
  async loadSettings(): Promise<CheckInSettings | null> {
    if (!this.userId) return null;

    try {
      const { data, error } = await supabase
        .from('check_in_settings')
        .select('*')
        .eq('user_id', this.userId)
        .single();

      if (error) {
        // If settings don't exist (PGRST116), create default settings
        if (error.code === 'PGRST116') {
          return await this.createDefaultSettings();
        }
        
        // If duplicate key error, try to fetch existing
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          console.log('Duplicate key detected, fetching existing settings...');
          const { data: existingData, error: fetchError } = await supabase
            .from('check_in_settings')
            .select('*')
            .eq('user_id', this.userId)
            .single();

          if (fetchError) {
            console.error('Error fetching settings after duplicate error:', fetchError);
            return null;
          }

          if (existingData) {
            this.settings = this.mapDbRowToSettings(existingData);
            return this.settings;
          }
        }

        console.error('Error loading check-in settings:', error);
        return null;
      }

      if (!data) {
        // Create default settings if no data found
        return await this.createDefaultSettings();
      }

      this.settings = this.mapDbRowToSettings(data);
      return this.settings;
    } catch (error) {
      console.error('Error in loadSettings:', error);
      return null;
    }
  }

  /**
   * Create default check-in settings
   */
  private async createDefaultSettings(): Promise<CheckInSettings | null> {
    if (!this.userId) return null;

    try {
      // Use upsert to handle case where settings already exist
      const { data, error } = await supabase
        .from('check_in_settings')
        .upsert(
          {
            user_id: this.userId,
            enabled: true,
            check_in_interval_minutes: 60,
            auto_check_in_enabled: false,
            auto_check_in_during_travel: true,
            travel_speed_threshold_kmh: 20,
            missed_check_in_alert_minutes: 30,
            emergency_contacts: [],
          },
          {
            onConflict: 'user_id',
            ignoreDuplicates: false, // Update if exists
          }
        )
        .select()
        .single();

      if (error) {
        // If still error, try to fetch existing settings
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          console.log('Settings already exist, fetching existing settings...');
          const { data: existingData, error: fetchError } = await supabase
            .from('check_in_settings')
            .select('*')
            .eq('user_id', this.userId)
            .single();

          if (fetchError) {
            console.error('Error fetching existing settings:', fetchError);
            return null;
          }

          if (existingData) {
            this.settings = this.mapDbRowToSettings(existingData);
            return this.settings;
          }
        }
        console.error('Error creating default settings:', error);
        return null;
      }

      if (data) {
        this.settings = this.mapDbRowToSettings(data);
        return this.settings;
      }

      return null;
    } catch (error) {
      console.error('Error in createDefaultSettings:', error);
      return null;
    }
  }

  /**
   * Update check-in settings
   */
  async updateSettings(updates: Partial<CheckInSettings>): Promise<boolean> {
    if (!this.userId || !this.settings) return false;

    try {
      const { error } = await supabase
        .from('check_in_settings')
        .update({
          enabled: updates.enabled ?? this.settings.enabled,
          check_in_interval_minutes: updates.checkInIntervalMinutes ?? this.settings.checkInIntervalMinutes,
          auto_check_in_enabled: updates.autoCheckInEnabled ?? this.settings.autoCheckInEnabled,
          auto_check_in_during_travel: updates.autoCheckInDuringTravel ?? this.settings.autoCheckInDuringTravel,
          travel_speed_threshold_kmh: updates.travelSpeedThresholdKmh ?? this.settings.travelSpeedThresholdKmh,
          missed_check_in_alert_minutes: updates.missedCheckInAlertMinutes ?? this.settings.missedCheckInAlertMinutes,
          emergency_contacts: updates.emergencyContacts ?? this.settings.emergencyContacts,
        })
        .eq('user_id', this.userId);

      if (error) {
        console.error('Error updating check-in settings:', error);
        return false;
      }

      await this.loadSettings();
      
      // Restart service with new settings
      this.stop();
      if (this.settings?.enabled) {
        this.startPeriodicCheckIn();
        this.startMissedCheckInMonitoring();
      }

      return true;
    } catch (error) {
      console.error('Error in updateSettings:', error);
      return false;
    }
  }

  /**
   * Get all connected user IDs
   */
  private async getConnectedUserIds(): Promise<string[]> {
    if (!this.userId) return [];

    try {
      // Get connections where this user is the main user
      const { data: connections1, error: error1 } = await supabase
        .from('connections')
        .select('connected_user_id')
        .eq('user_id', this.userId)
        .eq('status', 'connected');

      // Get connections where this user is the connected user
      const { data: connections2, error: error2 } = await supabase
        .from('connections')
        .select('user_id')
        .eq('connected_user_id', this.userId)
        .eq('status', 'connected');

      if (error1 || error2) {
        console.error('Error fetching connected users:', error1 || error2);
        return [];
      }

      const userIds = new Set<string>();
      (connections1 || []).forEach((conn) => {
        if (conn.connected_user_id) userIds.add(conn.connected_user_id);
      });
      (connections2 || []).forEach((conn) => {
        if (conn.user_id) userIds.add(conn.user_id);
      });

      return Array.from(userIds);
    } catch (error) {
      console.error('Error in getConnectedUserIds:', error);
      return [];
    }
  }

  /**
   * Manual check-in
   */
  async checkIn(
    status: UserCheckIn['status'] = 'safe',
    message?: string,
    isEmergency: boolean = false
  ): Promise<UserCheckIn | null> {
    if (!this.userId) return null;

    try {
      // For emergency check-ins, use HIGH-ACCURACY GPS to ensure precise location
      // For regular check-ins, use fast mode for quick response
      const locationPromise = isEmergency 
        ? locationService.getHighAccuracyLocation(true) // High-accuracy GPS for emergency - most precise location
        : locationService.getCurrentLocationFast(false, true); // Fast mode for regular check-ins
      
      // Additional timeout as fallback for emergency (high-accuracy can take longer)
      // For emergency, allow up to 20 seconds for high-accuracy GPS lock
      const locationTimeout = new Promise<LocationType | null>((resolve) => 
        setTimeout(() => {
          // For emergency, try to get cached location as fallback
          // For regular check-ins, return cached location immediately
          const cached = locationService.getLastKnownLocation();
          resolve(cached);
        }, isEmergency ? 20000 : 2000) // 20 seconds for emergency high-accuracy, 2 seconds for regular
      );
      
      const location = await Promise.race([locationPromise, locationTimeout]);
      
      const nextCheckInDue = this.settings
        ? new Date(Date.now() + this.settings.checkInIntervalMinutes * 60 * 1000).toISOString()
        : undefined;

      // Insert check-in immediately (don't wait for location if it's slow)
      const { data, error } = await supabase
        .from('user_check_ins')
        .insert({
          user_id: this.userId,
          check_in_type: isEmergency ? 'emergency' : 'manual',
          location_latitude: location?.latitude || null,
          location_longitude: location?.longitude || null,
          location_address: location?.address || null,
          status,
          message: message || null,
          next_check_in_due_at: nextCheckInDue,
          is_emergency: isEmergency,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating check-in:', error);
        return null;
      }

      // Map the check-in data immediately for return
      const checkInData = this.mapDbRowToCheckIn(data);

      // Send notifications in background (non-blocking)
      // Don't wait for notifications to complete before returning
      this.sendCheckInNotifications(
        data.id,
        status,
        location,
        message,
        isEmergency
      ).catch((error) => {
        console.error('Error sending check-in notifications:', error);
        // Don't throw - notifications are fire-and-forget
      });

      return checkInData;
    } catch (error) {
      console.error('Error in checkIn:', error);
      return null;
    }
  }

  /**
   * Send check-in notifications (non-blocking, called in background)
   */
  private async sendCheckInNotifications(
    checkInId: string,
    status: UserCheckIn['status'],
    location: any,
    message?: string,
    isEmergency: boolean = false
  ): Promise<void> {
    if (!this.userId) return;

    try {
      // Fetch user name and connected users in parallel for better performance
      const [userDataResult, connectedUserIds] = await Promise.all([
        supabase
          .from('users')
          .select('name')
          .eq('id', this.userId)
          .single(),
        this.getConnectedUserIds(),
      ]);

      const userName = userDataResult.data?.name || 'Someone';

      // Also include emergency contacts if it's an emergency
      const allRecipients = new Set<string>(connectedUserIds);
      if (isEmergency && this.settings?.emergencyContacts) {
        this.settings.emergencyContacts.forEach((id) => allRecipients.add(id));
      }

      // Log recipients for debugging
      if (__DEV__) {
        console.log(`Sending check-in notifications to ${allRecipients.size} recipients for status: ${status}`);
      }

      // Only send notifications if there are recipients
      if (allRecipients.size === 0) {
        if (__DEV__) {
          console.warn('No recipients found for check-in notification');
        }
        return;
      }

      // Send push notifications for "safe" and "delayed" statuses
      if (status === 'safe' || status === 'delayed') {
        const recipientIds = Array.from(allRecipients);
        
        // Determine notification title and body based on status
        const statusEmoji = status === 'safe' ? '✅' : '⏰';
        const statusText = status === 'safe' ? 'I\'m Safe' : 'Delayed';
        const title = `${statusEmoji} ${userName} - ${statusText}`;
        
        let body = `${userName} checked in: ${statusText}`;
        if (message) {
          body += `\n${message}`;
        }
        if (location?.address) {
          body += `\n📍 ${location.address}`;
        }

        // Send push notifications via Edge Function
        try {
          const { data: pushResult, error: pushError } = await supabase.functions.invoke(
            'send-push-notification',
            {
              body: {
                user_ids: recipientIds,
                title: title,
                body: body,
                data: {
                  type: 'check_in',
                  checkInStatus: status,
                  userId: this.userId,
                  userName: userName,
                  checkInId: checkInId,
                  location: location,
                  message: message,
                  timestamp: new Date().toISOString(),
                },
              },
            }
          );

          if (pushError) {
            console.error('Error sending check-in push notifications:', pushError);
          } else if (pushResult) {
            const sentCount = pushResult.sent || 0;
            const failedCount = pushResult.failed || 0;
            console.log(`✅ Check-in push notifications sent: ${sentCount} successful, ${failedCount} failed`);
          }
        } catch (pushError: any) {
          console.error('Exception sending check-in push notifications:', pushError);
          // Don't throw - notifications are optional
        }

        // Also create in-app notifications for connected users
        try {
          const notificationPromises = recipientIds.map((recipientId) =>
            supabase.from('notifications').insert({
              user_id: recipientId,
              title: title,
              body: body,
              type: status === 'safe' ? 'check_in' : 'check_in',
              data: {
                checkInStatus: status,
                userId: this.userId,
                userName: userName,
                checkInId: checkInId,
                location: location,
                message: message,
              },
            })
          );

          await Promise.all(notificationPromises);
          console.log(`✅ Created in-app notifications for ${recipientIds.length} users`);
        } catch (notificationError: any) {
          console.error('Error creating in-app notifications:', notificationError);
          // Don't throw - notifications are optional
        }
      }
    } catch (error) {
      console.error('Error in sendCheckInNotifications:', error);
      // Don't throw - notifications are optional
    }
  }

  /**
   * Get recent check-ins
   */
  async getRecentCheckIns(limit: number = 10): Promise<UserCheckIn[]> {
    if (!this.userId) return [];

    try {
      const { data, error } = await supabase
        .from('user_check_ins')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching check-ins:', error);
        return [];
      }

      return (data || []).map(this.mapDbRowToCheckIn);
    } catch (error) {
      console.error('Error in getRecentCheckIns:', error);
      return [];
    }
  }

  /**
   * Get last check-in
   */
  async getLastCheckIn(): Promise<UserCheckIn | null> {
    if (!this.userId) return null;

    try {
      const { data, error } = await supabase
        .from('user_check_ins')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // No check-ins yet
        }
        console.error('Error fetching last check-in:', error);
        return null;
      }

      return this.mapDbRowToCheckIn(data);
    } catch (error) {
      console.error('Error in getLastCheckIn:', error);
      return null;
    }
  }

  /**
   * Start periodic automatic check-ins
   */
  private startPeriodicCheckIn(): void {
    if (!this.settings || !this.settings.autoCheckInEnabled || !this.userId) return;

    const intervalMs = this.settings.checkInIntervalMinutes * 60 * 1000;

    this.checkInInterval = setInterval(async () => {
      if (!this.userId) return;

      // Check if user is traveling (simplified - would need speed detection)
      const shouldAutoCheckIn = this.settings?.autoCheckInDuringTravel || true;

      if (shouldAutoCheckIn) {
        await this.checkIn('safe', undefined, false);
      }
    }, intervalMs);
  }

  /**
   * Start monitoring for missed check-ins
   * DISABLED: No longer monitoring for missed check-ins to prevent resending notifications
   */
  private startMissedCheckInMonitoring(): void {
    // Disabled - notifications should only be sent once
    return;
  }

  /**
   * Handle missed check-in
   */
  private async handleMissedCheckIn(lastCheckIn: UserCheckIn): Promise<void> {
    if (!this.userId) return;

    try {
      // Check if notification was already sent for this check-in
      // If status is already 'missed', skip sending notifications
      // This ensures notifications are only sent once
      if (lastCheckIn.status === 'missed') {
        return; // Notification already sent, don't send again
      }

      // Update last check-in status to missed
      await supabase
        .from('user_check_ins')
        .update({ status: 'missed' })
        .eq('id', lastCheckIn.id);

      // Get user name for notification
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', this.userId)
        .single();

      const userName = userData?.name || 'User';

      // Notify all connected users and emergency contacts
      const connectedUserIds = await this.getConnectedUserIds();
      const allRecipients = new Set<string>(connectedUserIds);
      
      if (this.settings?.emergencyContacts) {
        this.settings.emergencyContacts.forEach((id) => allRecipients.add(id));
      }

      // Notifications removed - missed check-in data is still tracked

      // Notifications removed
    } catch (error) {
      console.error('Error handling missed check-in:', error);
    }
  }


  /**
   * Format time ago
   */
  private formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now.getTime() - time.getTime()) / 1000 / 60);
    
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff} minute${diff > 1 ? 's' : ''} ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  /**
   * Map database row to CheckInSettings
   */
  private mapDbRowToSettings(row: any): CheckInSettings {
    return {
      id: row.id,
      userId: row.user_id,
      enabled: row.enabled,
      checkInIntervalMinutes: row.check_in_interval_minutes,
      autoCheckInEnabled: row.auto_check_in_enabled,
      autoCheckInDuringTravel: row.auto_check_in_during_travel,
      travelSpeedThresholdKmh: row.travel_speed_threshold_kmh,
      missedCheckInAlertMinutes: row.missed_check_in_alert_minutes,
      emergencyContacts: row.emergency_contacts || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to UserCheckIn
   */
  private mapDbRowToCheckIn(row: any): UserCheckIn {
    return {
      id: row.id,
      userId: row.user_id,
      checkInType: row.check_in_type,
      location: row.location_latitude && row.location_longitude
        ? {
            latitude: row.location_latitude,
            longitude: row.location_longitude,
            address: row.location_address || undefined,
          }
        : undefined,
      status: row.status,
      message: row.message || undefined,
      nextCheckInDueAt: row.next_check_in_due_at || undefined,
      isEmergency: row.is_emergency,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const checkInService = new CheckInService();

