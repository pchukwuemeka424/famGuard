// Supabase Edge Function: Send App Update Notification to All Users
// Deploy with: supabase functions deploy send-app-update-notification
// This function sends app update push notifications to all registered users
// when app_update_notification_enabled is set to true in app_setting
// Scheduled to run every 2 hours via pg_cron

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

  // This function is designed to be called by cron jobs
  // It uses its own service role key from environment variables for database operations
  // No authentication required for the HTTP call itself
  console.log('📱 App update notification function called at:', new Date().toISOString())

  try {
    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const expoPushToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase configuration')
      return new Response(
        JSON.stringify({ 
          error: 'Missing Supabase configuration',
          details: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set'
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check app_setting to see if app update notifications are enabled
    console.log('🔍 Checking app_setting for app_update_notification_enabled...')
    const { data: appSetting, error: settingError } = await supabaseClient
      .from('app_setting')
      .select('app_update_notification_enabled')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .single()

    if (settingError) {
      console.error('❌ Error fetching app_setting:', settingError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch app settings',
          details: settingError.message 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!appSetting || !appSetting.app_update_notification_enabled) {
      console.log('⏭️ App update notifications are disabled. Skipping.')
      return new Response(
        JSON.stringify({ 
          success: true,
          sent: 0,
          failed: 0,
          total: 0,
          message: 'App update notifications are disabled',
          skipped: true
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('✅ App update notifications are enabled. Proceeding...')

    // Check if we already sent app update notifications in the last 2 hours (prevent duplicate runs)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: recentNotifications, error: checkError } = await supabaseClient
      .from('notifications')
      .select('id')
      .eq('type', 'app_update')
      .gte('created_at', twoHoursAgo)
      .limit(1)

    if (checkError) {
      console.warn('⚠️ Could not check for existing app update notifications:', checkError.message)
      // Continue anyway - better to send duplicate than miss users
    } else if (recentNotifications && recentNotifications.length > 0) {
      console.log('⏭️ App update notifications already sent in the last 2 hours. Skipping to prevent duplicates.')
      return new Response(
        JSON.stringify({ 
          success: true,
          sent: 0,
          failed: 0,
          total: 0,
          message: 'App update notifications already sent in the last 2 hours',
          skipped: true
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch all users with push tokens
    // Group by user_id to get only one token per user (prevent duplicates)
    console.log('📱 Fetching all users with push tokens...')
    const { data: pushTokens, error: tokensError } = await supabaseClient
      .from('user_push_tokens')
      .select('push_token, platform, user_id')
      .order('updated_at', { ascending: false }) // Get most recent token first

    if (tokensError) {
      console.error('❌ Error fetching push tokens:', tokensError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch push tokens',
          details: tokensError.message 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.log('⚠️ No push tokens found for any users')
      return new Response(
        JSON.stringify({ 
          success: true,
          sent: 0,
          failed: 0,
          total: 0,
          message: 'No users with push tokens found'
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Deduplicate by user_id - only send to the most recent token per user
    const userTokenMap = new Map<string, typeof pushTokens[0]>()
    for (const token of pushTokens) {
      if (!userTokenMap.has(token.user_id)) {
        userTokenMap.set(token.user_id, token)
      }
    }

    const uniqueTokens = Array.from(userTokenMap.values())
    console.log(`✅ Found ${uniqueTokens.length} unique users (${pushTokens.length} total tokens, ${pushTokens.length - uniqueTokens.length} duplicates removed)`)

    // Prepare app update notification message
    const title = '📱 App Update Available'
    const body = 'A new version of FamGuard is available. Please update to the latest version for the best experience and security features.'

    // Prepare Expo push notification messages (one per user)
    const messages = uniqueTokens.map(token => ({
      to: token.push_token,
      sound: 'default',
      title: title,
      body: body,
      data: {
        type: 'app_update',
        timestamp: new Date().toISOString(),
      },
      priority: 'high',
      channelId: 'default',
    }))

    // Send push notifications via Expo Push Notification API
    const expoPushUrl = 'https://exp.host/--/api/v2/push/send'
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    }

    // Add Expo access token if provided (optional but recommended for higher rate limits)
    if (expoPushToken) {
      headers['Authorization'] = `Bearer ${expoPushToken}`
    }

    console.log(`📤 Sending ${messages.length} app update notifications...`)
    const pushResponse = await fetch(expoPushUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(messages),
    })

    if (!pushResponse.ok) {
      const errorText = await pushResponse.text()
      console.error('❌ Error sending push notifications:', errorText)
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
    
    // Count successful sends
    const successfulSends = pushResult.data?.filter((result: any) => result.status === 'ok').length || 0
    const failedSends = pushResult.data?.filter((result: any) => result.status === 'error').length || 0

    // Log failed sends with details
    if (failedSends > 0) {
      const failedResults = pushResult.data?.filter((result: any) => result.status === 'error') || []
      console.error('❌ Failed push notifications:', failedResults.length)
      // Log first few failures for debugging
      failedResults.slice(0, 5).forEach((result: any) => {
        console.error('  - Error:', result.message || 'Unknown error')
      })
    }

    console.log(`✅ Successfully sent ${successfulSends} app update notifications, ${failedSends} failed`)

    // Insert notifications into the notifications table for each user who received the notification
    let notificationsInserted = 0
    if (successfulSends > 0) {
      try {
        // Get the user IDs for successfully sent notifications
        // Map push tokens back to user IDs
        const successfulTokenIndices: number[] = []
        pushResult.data?.forEach((result: any, index: number) => {
          if (result.status === 'ok') {
            successfulTokenIndices.push(index)
          }
        })

        // Create notification entries for successfully sent notifications
        const notificationsToInsert = successfulTokenIndices.map((index) => {
          const token = uniqueTokens[index]
          return {
            user_id: token.user_id,
            title: title,
            body: body,
            type: 'app_update' as const,
            data: {
              type: 'app_update',
              timestamp: new Date().toISOString(),
            },
            read: false,
          }
        })

        // Insert notifications in batches to avoid overwhelming the database
        const batchSize = 100
        for (let i = 0; i < notificationsToInsert.length; i += batchSize) {
          const batch = notificationsToInsert.slice(i, i + batchSize)
          const { error: notificationError } = await supabaseClient
            .from('notifications')
            .insert(batch)

          if (notificationError) {
            console.error(`❌ Error inserting notification batch ${Math.floor(i / batchSize) + 1}:`, notificationError.message)
          } else {
            notificationsInserted += batch.length
            console.log(`✅ Inserted notification batch ${Math.floor(i / batchSize) + 1}: ${batch.length} notifications`)
          }
        }

        console.log(`✅ Successfully inserted ${notificationsInserted} notifications into database`)
      } catch (error: any) {
        console.error('❌ Error inserting notifications into database:', error.message || error)
        // Don't fail the entire function if notification insertion fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        sent: successfulSends,
        failed: failedSends,
        total: uniqueTokens.length,
        notifications_inserted: notificationsInserted,
        message: `App update notification sent to ${successfulSends} users, ${notificationsInserted} notifications inserted`,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('❌ Error in send-app-update-notification:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        stack: error.stack 
      }),
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  }
})
