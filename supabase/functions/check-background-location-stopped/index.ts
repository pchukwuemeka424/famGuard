// Supabase Edge Function: Check Stopped Background Location
// Deploy with: supabase functions deploy check-background-location-stopped
// Schedule with: Supabase Dashboard > Database > Cron Jobs
// Or use external cron service to call this function every 4 hours

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

    console.log('Checking for users with stopped background location updates...')

    // Find users with no background location updates in the last 4 hours
    // This function ensures one-time notifications (checks if notification already sent)
    const { data: usersWithStoppedLocation, error: findError } = await supabaseClient
      .rpc('find_users_with_stopped_background_location')

    if (findError) {
      console.error('Error finding users with stopped background location:', findError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to find users with stopped background location',
          details: findError.message 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!usersWithStoppedLocation || usersWithStoppedLocation.length === 0) {
      console.log('All users have background location updates in the last 4 hours')
      return new Response(
        JSON.stringify({ 
          success: true,
          notified: 0,
          message: 'All users have background location updates in the last 4 hours - no notifications sent'
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Handle both array of objects and array of strings
    let userIds: string[] = []
    if (usersWithStoppedLocation && usersWithStoppedLocation.length > 0) {
      if (typeof usersWithStoppedLocation[0] === 'string') {
        userIds = usersWithStoppedLocation as string[]
      } else {
        userIds = usersWithStoppedLocation.map((u: any) => u.user_id || u).filter(Boolean)
      }
    }
    console.log(`Found ${userIds.length} users with stopped background location:`, userIds)

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          notified: 0,
          message: 'No users found with stopped background location'
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Insert notifications into the notifications table (NO push notification sent)
    // This ensures one-time notification (database function already checks for existing notifications)
    const notificationTitle = "Location Update Reminder"
    const notificationBody = "Your background location hasn't updated in the past 4 hours. Tap to update your location now."
    
    const notificationsToInsert = userIds.map(userId => ({
      user_id: userId,
      title: notificationTitle,
      body: notificationBody,
      type: 'location_reminder',
      data: {
        type: 'location_reminder',
        action: 'update_location',
        reminder_type: 'background_location_stopped',
        reminder_sent_at: new Date().toISOString(),
      },
      read: false,
    }))

    // Insert notifications into database only (NO push notification)
    const { error: notificationError } = await supabaseClient
      .from('notifications')
      .insert(notificationsToInsert)

    if (notificationError) {
      console.error('Error inserting notifications:', notificationError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to insert notifications',
          details: notificationError.message 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Inserted ${notificationsToInsert.length} notifications into database (no push notifications sent)`)

    return new Response(
      JSON.stringify({ 
        success: true,
        users_checked: userIds.length,
        notifications_inserted: notificationsToInsert.length,
        message: `Checked ${userIds.length} users, inserted ${notificationsToInsert.length} notifications into database (no push notifications sent)`
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
