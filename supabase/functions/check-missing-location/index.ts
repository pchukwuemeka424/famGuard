// Supabase Edge Function: Check Missing Location History
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
    const { data: backgroundStatus, error: statusError } = await supabaseClient
      .rpc('verify_background_location_inserts')
      .limit(10) // Check first 10 users as sample

    if (!statusError && backgroundStatus) {
      console.log('Background location status sample:', backgroundStatus)
      const inactiveUsers = backgroundStatus.filter((s: any) => s.status !== 'Background location active')
      if (inactiveUsers.length > 0) {
        console.log(`Found ${inactiveUsers.length} users with inactive background location`)
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
          error: 'Failed to find users without location history',
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
          message: 'All users have location_history and location inserted in last 28 hours, or already received one-time push notification - no notifications sent'
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
          message: 'No users found without location history'
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
    const notificationTitle = "Are you safe?"
    const notificationBody = "Reminder: Your location sharing is not active. Please update your location so your trusted family can be aware of your safety. We care about you! 💙"
    
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
    const { error: notificationError } = await supabaseClient
      .from('notifications')
      .insert(notificationsToInsert)

    if (notificationError) {
      console.error('Error inserting notifications:', notificationError)
      // Continue with push notifications even if database insert fails
    } else {
      console.log(`Inserted ${notificationsToInsert.length} notifications into database`)
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
          error: 'Failed to send push notifications',
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

    return new Response(
      JSON.stringify({ 
        success: true,
        users_checked: userIds.length,
        notifications_inserted: notificationsToInsert.length,
        push_notifications_sent: pushResult.sent || 0,
        push_notifications_failed: pushResult.failed || 0,
        message: `Checked ${userIds.length} users, sent ${pushResult.sent || 0} ONE TIME push notifications to users without location_history or location in last 28 hours`
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
        error: 'Unexpected error during check',
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  }
})
