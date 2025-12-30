// Supabase Edge Function: Send Push Notification
// Deploy with: supabase functions deploy send-push-notification

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
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
    const { userId, notification } = await req.json()

    if (!userId || !notification) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or notification' }),
        { 
          status: 400, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client
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

    // Get user's push token from database
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('user_push_tokens')
      .select('push_token, platform')
      .eq('user_id', userId)
      .single()

    if (tokenError || !tokenData) {
      console.error('Push token not found:', tokenError)
      return new Response(
        JSON.stringify({ error: 'Push token not found for user', userId }),
        { 
          status: 404, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Prepare notification payload for Expo
    const expoNotification = {
      to: tokenData.push_token,
      sound: notification.sound !== false ? 'default' : undefined,
      title: notification.title || 'SafeZone',
      body: notification.body || '',
      data: notification.data || {},
      priority: notification.priority || 'high',
      channelId: 'default',
    }

    // Send push notification via Expo Push API
    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoNotification),
    })

    if (!pushResponse.ok) {
      const errorText = await pushResponse.text()
      console.error('Expo Push API error:', errorText)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send push notification',
          details: errorText 
        }),
        { 
          status: pushResponse.status, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    const result = await pushResponse.json()

    // Log successful notification
    console.log('Push notification sent successfully:', {
      userId,
      ticketId: result.data?.id,
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        result,
        ticketId: result.data?.id 
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

