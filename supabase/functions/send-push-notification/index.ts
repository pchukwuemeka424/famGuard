// Supabase Edge Function: Send Push Notifications
// Deploy with: supabase functions deploy send-push-notification
// This function sends push notifications to multiple users via Expo Push Notification service

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushNotificationRequest {
  user_ids: string[]
  title: string
  body: string
  data?: Record<string, any>
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // Log request details for debugging
  console.log('Edge Function called:', {
    method: req.method,
    url: req.url,
    hasAuth: !!req.headers.get('authorization'),
  });

  try {
    // Initialize Supabase client with service role key for admin operations
    // Supabase automatically provides these environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const expoPushToken = Deno.env.get('EXPO_ACCESS_TOKEN') ?? ''

    // Log environment variable status (without exposing values)
    console.log('Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasExpoToken: !!expoPushToken,
      supabaseUrlLength: supabaseUrl.length,
    })

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey,
      })
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

    // Parse request body
    let requestData: PushNotificationRequest
    try {
      requestData = await req.json()
    } catch (parseError) {
      console.error('Error parsing request body:', parseError)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request body',
          details: parseError instanceof Error ? parseError.message : 'Failed to parse JSON'
        }),
        { 
          status: 400, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { user_ids, title, body, data } = requestData

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'user_ids array is required and must not be empty' }),
        { 
          status: 400, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'title and body are required' }),
        { 
          status: 400, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Log which users we're looking for
    console.log('Looking for push tokens for users:', user_ids)
    console.log('Total users requested:', user_ids.length)

    // Fetch push tokens for all user IDs
    const { data: pushTokens, error: tokensError } = await supabaseClient
      .from('user_push_tokens')
      .select('push_token, platform, user_id')
      .in('user_id', user_ids)

    if (tokensError) {
      console.error('Error fetching push tokens:', tokensError)
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

    console.log('Found push tokens:', pushTokens?.length || 0, 'out of', user_ids.length, 'requested users')
    
    if (pushTokens && pushTokens.length > 0) {
      console.log('Token details:', pushTokens.map(t => ({
        user_id: t.user_id,
        platform: t.platform,
        token_preview: t.push_token?.substring(0, 30) + '...'
      })))
    }

    // Find which users don't have tokens
    if (pushTokens && pushTokens.length < user_ids.length) {
      const foundUserIds = new Set(pushTokens.map(t => t.user_id))
      const missingUserIds = user_ids.filter(id => !foundUserIds.has(id))
      console.warn('Users without push tokens:', missingUserIds)
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.log('No push tokens found for users:', user_ids)
      return new Response(
        JSON.stringify({ 
          success: true,
          sent: 0,
          failed: 0,
          total: user_ids.length,
          message: `No push tokens found for the specified users (${user_ids.length} users requested)`,
          requested_users: user_ids,
          found_tokens: 0
        }),
        { 
          status: 200, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Prepare Expo push notification messages
    const messages = pushTokens.map(token => ({
      to: token.push_token,
      sound: 'default',
      title: title,
      body: body,
      data: data || {},
      priority: 'high',
      channelId: 'emergency-alerts', // Android channel
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

    const pushResponse = await fetch(expoPushUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(messages),
    })

    if (!pushResponse.ok) {
      const errorText = await pushResponse.text()
      console.error('Error sending push notifications:', errorText)
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
    
    // Log full response for debugging
    console.log('Expo Push API response:', JSON.stringify(pushResult, null, 2))
    
    // Count successful sends
    const successfulSends = pushResult.data?.filter((result: any) => result.status === 'ok').length || 0
    const failedSends = pushResult.data?.filter((result: any) => result.status === 'error').length || 0

    // Log failed sends with details
    if (failedSends > 0) {
      const failedResults = pushResult.data?.filter((result: any) => result.status === 'error') || []
      console.error('Failed push notifications:', failedResults)
    }

    console.log(`Successfully sent ${successfulSends} push notifications, ${failedSends} failed`)

    return new Response(
      JSON.stringify({ 
        success: true,
        sent: successfulSends,
        failed: failedSends,
        total: pushTokens.length,
        results: pushResult.data
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in send-push-notification:', error)
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

