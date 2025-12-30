// Supabase Edge Function: Cleanup Expired Incidents
// Deploy with: supabase functions deploy cleanup-expired-incidents
// Schedule with: Supabase Dashboard > Database > Cron Jobs
// Or use external cron service to call this function every hour

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

    // Delete incidents older than 3 hours
    const threeHoursAgo = new Date()
    threeHoursAgo.setHours(threeHoursAgo.getHours() - 3)

    const { data, error } = await supabaseClient
      .from('incidents')
      .delete()
      .lt('created_at', threeHoursAgo.toISOString())
      .select()

    if (error) {
      console.error('Error deleting expired incidents:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete expired incidents',
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    const deletedCount = data?.length || 0

    console.log(`Successfully deleted ${deletedCount} expired incidents`)

    return new Response(
      JSON.stringify({ 
        success: true,
        deletedCount,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in cleanup-expired-incidents:', error)
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

