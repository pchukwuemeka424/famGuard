import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

interface IncidentProximityNotification {
  user_id: string;
  incident_id: string;
  incident_title: string;
  incident_category: string;
  incident_location_lat: number;
  incident_location_lon: number;
  user_location_lat: number;
  user_location_lon: number;
  distance_km: number;
  incident_created_at: string;
}

class IncidentProximityService {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes
  private isChecking = false;

  /**
   * Check for users within proximity of incidents and send notifications
   * Distance range: 5-10km (proxy for 45min-1hr travel time)
   * Only checks incidents from the last 1 hour
   */
  async checkAndNotifyProximityIncidents(): Promise<void> {
    if (this.isChecking) {
      if (__DEV__) {
        console.log('⏳ Incident proximity check already in progress, skipping...');
      }
      return;
    }

    this.isChecking = true;

    try {
        console.log('🔍 Checking for users near incidents...');

      // Call database function to get users within proximity
      // Expanded range: 0-10km to catch all nearby users
      const { data, error } = await supabase.rpc('get_users_near_incidents', {
        p_min_distance_km: 0, // Start from 0km (very close)
        p_max_distance_km: 10, // Maximum 10km (1hr travel time)
        p_max_hours_ago: 1, // Only check incidents from last hour
      });

      if (error) {
        console.error('❌ Error fetching users near incidents:', {
          error: error,
          message: error.message,
          details: error.details,
          code: error.code,
        });
        return;
      }

      if (!data || data.length === 0) {
        console.log('✅ No users found within proximity of incidents (0-10km range)');
        return;
      }

        console.log(`📊 Found ${data.length} user(s) within proximity of incidents`);

      // Group by user_id to send one notification per user (for multiple incidents)
      const userIncidentsMap = new Map<string, IncidentProximityNotification[]>();

      for (const row of data as IncidentProximityNotification[]) {
        const existing = userIncidentsMap.get(row.user_id) || [];
        existing.push(row);
        userIncidentsMap.set(row.user_id, existing);
      }

      // Send notifications for each user
      const notificationPromises = Array.from(userIncidentsMap.entries()).map(
        async ([userId, incidents]) => {
          return this.sendProximityNotification(userId, incidents);
        }
      );

      const results = await Promise.allSettled(notificationPromises);

      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`✅ Completed proximity notification check: ${successful} successful, ${failed} failed out of ${userIncidentsMap.size} user(s)`);
      
      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const userId = Array.from(userIncidentsMap.keys())[index];
          console.error(`❌ Failed to send proximity notification to user ${userId}:`, result.reason);
        }
      });
    } catch (error: any) {
      console.error('❌ Error in checkAndNotifyProximityIncidents:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Send push notification to a user about nearby incidents
   */
  private async sendProximityNotification(
    userId: string,
    incidents: IncidentProximityNotification[]
  ): Promise<void> {
    try {
      // Check if user has already been notified today
      // This prevents multiple push notifications per day
      const { data: notifiedToday, error: checkError } = await supabase.rpc(
        'has_been_notified_today',
        { p_user_id: userId }
      );

      if (checkError) {
        console.error(`❌ Error checking if user ${userId} was notified today:`, checkError);
        // Continue anyway - don't block notification if check fails
      } else if (notifiedToday === true) {
        console.log(`⏭️ User ${userId} has already been notified today. Skipping push notification.`);
        // Still create in-app notification but don't send push
        // This allows users to see the notification in the app
        await this.createInAppNotificationOnly(userId, incidents);
        return;
      }

      // Use the closest/most recent incident for the notification
      const primaryIncident = incidents[0];
      const incidentCount = incidents.length;
      const distance = primaryIncident.distance_km;

      // Determine alert level based on distance
      // 0-3km = DANGER (very close)
      // 3-6km = WARNING (close)
      // 6-10km = ALERT (nearby)
      let alertLevel: 'danger' | 'warning' | 'alert' = 'alert';
      let alertEmoji = '⚠️';
      let alertPrefix = 'ALERT';

      if (distance <= 3) {
        alertLevel = 'danger';
        alertEmoji = '🚨';
        alertPrefix = 'DANGER';
      } else if (distance <= 6) {
        alertLevel = 'warning';
        alertEmoji = '⚠️';
        alertPrefix = 'WARNING';
      } else {
        alertLevel = 'alert';
        alertEmoji = '⚠️';
        alertPrefix = 'ALERT';
      }

      // Build notification title and body with alert level
      let title = `${alertEmoji} ${alertPrefix}: Incident Nearby`;
      let body = '';

      if (incidentCount === 1) {
        body = `${primaryIncident.incident_category}: ${primaryIncident.incident_title}\n`;
        body += `📍 ${distance.toFixed(1)}km away - ${alertPrefix}`;
      } else {
        body = `${incidentCount} incidents nearby:\n`;
        body += `• ${primaryIncident.incident_category}: ${primaryIncident.incident_title}\n`;
        body += `📍 ${distance.toFixed(1)}km away - ${alertPrefix}`;
        if (incidentCount > 1) {
          body += `\n+ ${incidentCount - 1} more incident(s)`;
        }
      }

      // Send push notification via Edge Function
      const { data: pushResult, error: pushError } = await supabase.functions.invoke(
        'send-push-notification',
        {
          body: {
            user_ids: [userId],
            title: title,
            body: body,
            data: {
              type: 'incident_proximity',
              incidentIds: incidents.map((i) => i.incident_id),
              primaryIncidentId: primaryIncident.incident_id,
              distanceKm: primaryIncident.distance_km,
              alertLevel: alertLevel,
              timestamp: new Date().toISOString(),
            },
          },
        }
      );

      if (pushError) {
        console.error(`❌ Error sending proximity notification to user ${userId}:`, {
          error: pushError,
          message: pushError.message,
          details: pushError.details,
          status: pushError.status,
        });
        return;
      }

      // Log push notification result
      if (pushResult) {
        const sentCount = pushResult.sent || 0;
        const failedCount = pushResult.failed || 0;
        const total = pushResult.total || 0;
        const message = pushResult.message || '';

        console.log(`📊 Proximity push notification result for user ${userId}:`, {
          sent: sentCount,
          failed: failedCount,
          total: total,
          message: message,
        });

        if (sentCount > 0) {
          console.log(`✅ Proximity push notification sent successfully to user ${userId}`);
        } else if (message) {
          console.warn(`⚠️ Proximity push notification: ${message}`);
          // Check if no push tokens found
          if (message.includes('No push tokens found') || message.includes('no push token')) {
            console.warn(`⚠️ User ${userId} does not have a push token registered`);
          }
        } else {
          console.warn(`⚠️ Proximity push notification returned no result for user ${userId}`);
        }
      } else {
        console.warn(`⚠️ Proximity push notification returned no data for user ${userId}`);
      }

      // Create in-app notification FIRST (before recording in proximity table)
      // This ensures the notification appears in the Notifications screen
      try {
        const { error: inAppError, data: notificationData } = await supabase
          .from('notifications')
          .insert({
            user_id: userId,
            title: title,
            body: body,
            type: 'incident_proximity', // Use specific type for proximity incidents
            data: {
              type: 'incident_proximity',
              incidentIds: incidents.map((i) => i.incident_id),
              primaryIncidentId: primaryIncident.incident_id,
              distanceKm: primaryIncident.distance_km,
              alertLevel: alertLevel,
              category: primaryIncident.incident_category,
            },
            read: false,
          })
          .select()
          .single();

        if (inAppError) {
          console.error(`❌ Error creating in-app notification for user ${userId}:`, {
            error: inAppError,
            message: inAppError.message,
            details: inAppError.details,
            code: inAppError.code,
          });
        } else {
          console.log(`✅ Created in-app notification for user ${userId}:`, notificationData?.id);
        }
      } catch (inAppError: any) {
        console.error(`❌ Exception creating in-app notification:`, {
          error: inAppError,
          message: inAppError?.message,
          stack: inAppError?.stack,
        });
      }

      // Record notifications in database to prevent duplicates
      // Only record if notification was successfully created
      // Use notified_at to track when notification was sent (for daily check)
      const notificationsToInsert = incidents.map((incident) => ({
        user_id: userId,
        incident_id: incident.incident_id,
        distance_km: incident.distance_km,
        notified_at: new Date().toISOString(), // Explicitly set to current time
      }));

      // Insert with error handling - ignore duplicate key errors (23505)
      const { error: insertError, data: proximityData } = await supabase
        .from('incident_proximity_notifications')
        .insert(notificationsToInsert)
        .select();

      if (insertError) {
        // Ignore duplicate key errors (code 23505) - this is expected if notification already exists
        if (insertError.code === '23505') {
          console.log(
            `ℹ️ Proximity notification already recorded for user ${userId} (duplicate ignored)`
          );
        } else {
        console.error(
          `❌ Error recording proximity notifications for user ${userId}:`,
            {
              error: insertError,
              message: insertError.message,
              details: insertError.details,
              code: insertError.code,
            }
        );
        }
        // Don't return - notification was sent, just tracking failed
      } else {
          console.log(
          `✅ Recorded proximity notifications for user ${userId}: ${proximityData?.length || notificationsToInsert.length} record(s)`
        );
      }
    } catch (error: any) {
      console.error(`❌ Exception sending proximity notification to user ${userId}:`, error);
    }
  }

  /**
   * Create in-app notification only (no push notification)
   * Used when user has already been notified today
   */
  private async createInAppNotificationOnly(
    userId: string,
    incidents: IncidentProximityNotification[]
  ): Promise<void> {
    try {
      const primaryIncident = incidents[0];
      const incidentCount = incidents.length;
      const distance = primaryIncident.distance_km;

      // Determine alert level based on distance
      let alertLevel: 'danger' | 'warning' | 'alert' = 'alert';
      let alertEmoji = '⚠️';
      let alertPrefix = 'ALERT';

      if (distance <= 3) {
        alertLevel = 'danger';
        alertEmoji = '🚨';
        alertPrefix = 'DANGER';
      } else if (distance <= 6) {
        alertLevel = 'warning';
        alertEmoji = '⚠️';
        alertPrefix = 'WARNING';
      }

      let title = `${alertEmoji} ${alertPrefix}: Incident Nearby`;
      let body = '';

      if (incidentCount === 1) {
        body = `${primaryIncident.incident_category}: ${primaryIncident.incident_title}\n`;
        body += `📍 ${distance.toFixed(1)}km away - ${alertPrefix}`;
      } else {
        body = `${incidentCount} incidents nearby:\n`;
        body += `• ${primaryIncident.incident_category}: ${primaryIncident.incident_title}\n`;
        body += `📍 ${distance.toFixed(1)}km away - ${alertPrefix}`;
        if (incidentCount > 1) {
          body += `\n+ ${incidentCount - 1} more incident(s)`;
        }
      }

      // Create in-app notification
      const { error: inAppError } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title: title,
          body: body,
          type: 'incident_proximity',
          data: {
            type: 'incident_proximity',
            incidentIds: incidents.map((i) => i.incident_id),
            primaryIncidentId: primaryIncident.incident_id,
            distanceKm: primaryIncident.distance_km,
            alertLevel: alertLevel,
            category: primaryIncident.incident_category,
          },
          read: false,
        });

        if (inAppError) {
          console.error(`❌ Error creating in-app notification for user ${userId}:`, inAppError);
      } else {
        console.log(`✅ Created in-app notification (no push) for user ${userId}`);
      }

      // Still record in proximity table to track
      // Ignore duplicate errors if record already exists
      const notificationsToInsert = incidents.map((incident) => ({
        user_id: userId,
        incident_id: incident.incident_id,
        distance_km: incident.distance_km,
        notified_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('incident_proximity_notifications')
        .insert(notificationsToInsert);

      // Ignore duplicate key errors (code 23505) - this is expected
      if (insertError && insertError.code !== '23505') {
        console.error(`❌ Error recording proximity notifications:`, insertError);
      }
    } catch (error: any) {
      console.error(`❌ Exception creating in-app notification only:`, error);
    }
  }

  /**
   * Start periodic checking for incident proximity
   */
  startPeriodicChecking(): void {
    if (this.checkInterval) {
      // Already running
      console.log('⚠️ Incident proximity checking already started');
      return;
    }

    console.log('🔄 Starting periodic incident proximity checking...');

    // Run initial check after 10 seconds (to allow app to initialize)
    setTimeout(() => {
      console.log('🔍 Running initial incident proximity check...');
      this.checkAndNotifyProximityIncidents();
    }, 10000);

    // Then check every 15 minutes
    this.checkInterval = setInterval(() => {
      console.log('🔍 Running scheduled incident proximity check...');
      this.checkAndNotifyProximityIncidents();
    }, this.CHECK_INTERVAL_MS);

    console.log('✅ Started periodic incident proximity checking (every 15 minutes)');
  }

  /**
   * Stop periodic checking
   */
  stopPeriodicChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      if (__DEV__) {
        console.log('⏹️ Stopped periodic incident proximity checking');
      }
    }
  }

  /**
   * Manually trigger a proximity check (useful after location updates)
   */
  async triggerCheck(): Promise<void> {
    await this.checkAndNotifyProximityIncidents();
  }
}

export const incidentProximityService = new IncidentProximityService();

