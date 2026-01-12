// Supabase Edge Function: Cleanup Location History
// Deploy with: supabase functions deploy cleanup-location-history
// Schedule with: Supabase Dashboard > Database > Cron Jobs
// Or use external cron service to call this function daily

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

    // Calculate time boundary: 24 hours ago
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago

    console.log('Starting location history cleanup...')
    console.log(`Deleting all entries older than: ${twentyFourHoursAgo.toISOString()}`)

    // Delete all entries older than 24 hours
    // Each day starts fresh with no retention of previous day's data
    const { data: deletedEntries, error: deleteError } = await supabaseClient
      .from('location_history')
      .delete()
      .lt('created_at', twentyFourHoursAgo.toISOString())
      .select('id')

    if (deleteError) {
      console.error('Error deleting old entries:', deleteError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete old entries',
          details: deleteError.message 
        }),
        { 
          status: 500, 
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
        }
      )
    }

    const deletedCount = deletedEntries?.length || 0
    console.log(`Deleted ${deletedCount} entries older than 24 hours`)

    return new Response(
      JSON.stringify({ 
        success: true,
        deleted: deletedCount,
        message: `Location history cleanup completed successfully. Deleted ${deletedCount} entries older than 24 hours. Each day starts fresh.`
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
        error: 'Unexpected error during cleanup',
        details: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500, 
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
      }
    )
  }
})
