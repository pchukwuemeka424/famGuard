// Supabase Edge Function: Check Missing Location History
// 
// This function checks for users who haven't shared their location recently
// and sends a friendly reminder notification to encourage them to stay active.
//
// Deploy with: supabase functions deploy check-missing-location
// Schedule with: Supabase Dashboard > Database > Cron Jobs
// Or use external cron service to call this function every 12 hours

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Checking for users with no location_history OR no location inserted in last 28 hours (one-time push notification)...')
    console.log('This will send ONE TIME push notification to users who need location updates...')

    // First, verify background location inserts are working
    // Note: This is optional verification - the main check uses find_users_without_location_history()
    const { data: backgroundStatus, error: statusError } = await supabaseClient
      .rpc('verify_background_location_inserts')

    if (!statusError && backgroundStatus) {
      // Limit to first 10 for logging purposes only
      const statusSample = Array.isArray(backgroundStatus) ? backgroundStatus.slice(0, 10) : []
      console.log('Background location status sample:', statusSample)
      const inactiveUsers = statusSample.filter((s: any) => s.status !== 'Background location active')
      if (inactiveUsers.length > 0) {
        console.log(`Found ${inactiveUsers.length} users with inactive background location in sample`)
      }
    }

    // Find users with no location_history at all OR no location_history inserted in last 28 hours
    // This function ensures ONE TIME push notifications (checks if notification already sent in last 28 hours)
    // Only sends to users who:
    //   - Do NOT have location_history at all
    //   - OR do NOT have location history inserted in the last 28 hours
    const { data: usersWithoutLocation, error: findError } = await supabaseClient
      .rpc('find_users_without_location_history')

    if (findError) {
      console.error('Error finding users without location history:', findError)
      return new Response(
        JSON.stringify({ 
          error: 'Unable to check for users who need location reminders',
          details: findError.message 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!usersWithoutLocation || usersWithoutLocation.length === 0) {
      console.log('All users have location_history and location inserted in last 28 hours, or already received one-time push notification')
      return new Response(
        JSON.stringify({ 
          success: true,
          notifications_inserted: 0,
          push_notifications_sent: 0,
          message: 'All users are active with recent location updates, or have already received a reminder notification recently. No notifications needed at this time.'
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Handle both array of objects and array of strings
    let userIds: string[] = []
    if (usersWithoutLocation && usersWithoutLocation.length > 0) {
      if (typeof usersWithoutLocation[0] === 'string') {
        userIds = usersWithoutLocation as string[]
      } else {
        userIds = usersWithoutLocation.map((u: any) => u.user_id || u).filter(Boolean)
      }
    }
    console.log(`Found ${userIds.length} users with no location_history OR no location inserted in last 28 hours:`, userIds)

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          notifications_inserted: 0,
          push_notifications_sent: 0,
          message: 'No users found who need location reminders at this time'
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Send ONE TIME push notification to users who:
    // - Do NOT have location_history at all
    // - OR do NOT have location history inserted in the last 28 hours
    // The database function already ensures one-time (checks if notification sent in last 28 hours)
    const notificationTitle = "We Miss You!"
    const notificationBody = "You haven't visited famGuard for a while. We miss you and want to make sure you're safe. Please stay active and keep your location updated so your loved ones can stay connected with you."
    
    // First, insert notifications into the notifications table
    // This ensures one-time notification (database function already checks for existing notifications)
    const notificationsToInsert = userIds.map(userId => ({
      user_id: userId,
      title: notificationTitle,
      body: notificationBody,
      type: 'location_reminder',
      data: {
        type: 'location_reminder',
        action: 'update_location',
        reminder_type: 'missing_location_28hrs',
        reminder_sent_at: new Date().toISOString(),
      },
      read: false,
    }))

    // Insert notifications into database
    // This ensures notifications are stored in the database for users to see in-app
    const { data: insertedNotifications, error: notificationError } = await supabaseClient
      .from('notifications')
      .insert(notificationsToInsert)
      .select()

    if (notificationError) {
      console.error('Error inserting notifications into database:', notificationError)
      console.error('Notification error details:', JSON.stringify(notificationError, null, 2))
      // Log but continue with push notifications - users will still get push notification
      // even if database insert fails (though they won't see it in-app)
    } else {
      const insertedCount = insertedNotifications?.length || 0
      console.log(`Successfully inserted ${insertedCount} notifications into the notifications table`)
      if (insertedCount !== notificationsToInsert.length) {
        console.warn(`Expected to insert ${notificationsToInsert.length} notifications, but only ${insertedCount} were inserted`)
      }
    }
    
    // Send ONE TIME push notification
    const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`
    
    const pushResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_ids: userIds,
        title: notificationTitle,
        body: notificationBody,
        data: {
          type: 'location_reminder',
          action: 'update_location',
          reminder_type: 'missing_location_28hrs',
        },
      }),
    })

    if (!pushResponse.ok) {
      const errorText = await pushResponse.text()
      console.error('Error calling send-push-notification:', errorText)
      return new Response(
        JSON.stringify({ 
          error: 'Unable to send reminder notifications at this time',
          details: errorText 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    const pushResult = await pushResponse.json()
    console.log('Push notification result:', pushResult)
    console.log(`Sent ONE TIME push notification to ${pushResult.sent || 0} users`)

    const insertedCount = insertedNotifications?.length || 0
    const notificationInsertSuccess = !notificationError && insertedCount > 0

    return new Response(
      JSON.stringify({ 
        success: true,
        users_checked: userIds.length,
        notifications_inserted: insertedCount,
        notifications_inserted_successfully: notificationInsertSuccess,
        push_notifications_sent: pushResult.sent || 0,
        push_notifications_failed: pushResult.failed || 0,
        message: `Successfully checked ${userIds.length} users, inserted ${insertedCount} notifications into database, and sent ${pushResult.sent || 0} friendly reminder notifications to encourage activity and safety`
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'An unexpected error occurred while checking for users who need reminders',
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  }
})
