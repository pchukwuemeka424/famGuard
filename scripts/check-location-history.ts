/**
 * Script to check Supabase location_history table
 * Run with: npx ts-node scripts/check-location-history.ts
 */

import { createClient } from '@supabase/supabase-js';

// Connection details from provided connection string
const SUPABASE_URL = 'https://bbydsaxduuwbnwqmiant.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Direct PostgreSQL connection string (for reference)
const POSTGRES_CONNECTION = 'postgresql://postgres:eYHNPishBvzReZ6P@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres';

async function checkLocationHistory() {
  console.log('============================================');
  console.log('Checking Supabase location_history Table');
  console.log('============================================\n');

  if (!SUPABASE_ANON_KEY) {
    console.error('❌ EXPO_PUBLIC_SUPABASE_ANON_KEY not set in environment');
    console.log('   Please set it in .env file or export it');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // 1. Check table structure (via query)
    console.log('1. Checking table structure...');
    const { data: sampleData, error: sampleError } = await supabase
      .from('location_history')
      .select('*')
      .limit(1);

    if (sampleError) {
      console.error('❌ Error accessing location_history table:', sampleError.message);
      return;
    }

    console.log('✅ Table accessible\n');

    // 2. Count total records
    console.log('2. Counting total records...');
    const { count, error: countError } = await supabase
      .from('location_history')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error counting records:', countError.message);
    } else {
      console.log(`✅ Total records: ${count}\n`);
    }

    // 3. Check accuracy column statistics
    console.log('3. Checking accuracy column...');
    const { data: allData, error: dataError } = await supabase
      .from('location_history')
      .select('accuracy')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (dataError) {
      console.error('❌ Error fetching data:', dataError.message);
    } else if (allData) {
      const total = allData.length;
      const withAccuracy = allData.filter((row: any) => row.accuracy !== null && row.accuracy !== undefined).length;
      const nullAccuracy = total - withAccuracy;
      const accuracyValues = allData
        .filter((row: any) => row.accuracy !== null && row.accuracy !== undefined)
        .map((row: any) => row.accuracy) as number[];

      console.log(`   Total rows checked: ${total}`);
      console.log(`   Rows with accuracy: ${withAccuracy}`);
      console.log(`   Rows with NULL accuracy: ${nullAccuracy}`);
      console.log(`   Population: ${total > 0 ? ((withAccuracy / total) * 100).toFixed(2) : 0}%`);

      if (accuracyValues.length > 0) {
        const min = Math.min(...accuracyValues);
        const max = Math.max(...accuracyValues);
        const avg = accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length;
        console.log(`   Min accuracy: ${min.toFixed(2)}m`);
        console.log(`   Max accuracy: ${max.toFixed(2)}m`);
        console.log(`   Avg accuracy: ${avg.toFixed(2)}m`);
      }
      console.log('');
    }

    // 4. Get recent entries with accuracy
    console.log('4. Recent entries (last 10) with accuracy...');
    const { data: recentWithAccuracy, error: recentError } = await supabase
      .from('location_history')
      .select('id, user_id, latitude, longitude, address, accuracy, created_at')
      .not('accuracy', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('❌ Error:', recentError.message);
    } else if (recentWithAccuracy) {
      console.log(`   Found ${recentWithAccuracy.length} entries with accuracy:\n`);
      recentWithAccuracy.forEach((row: any, index: number) => {
        console.log(`   ${index + 1}. User: ${row.user_id.substring(0, 8)}...`);
        console.log(`      Lat: ${row.latitude.toFixed(6)}, Lng: ${row.longitude.toFixed(6)}`);
        console.log(`      Accuracy: ${row.accuracy?.toFixed(2)}m`);
        console.log(`      Created: ${new Date(row.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    // 5. Get recent entries with NULL accuracy
    console.log('5. Recent entries (last 10) with NULL accuracy...');
    const { data: recentNull, error: nullError } = await supabase
      .from('location_history')
      .select('id, user_id, latitude, longitude, address, accuracy, created_at')
      .is('accuracy', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (nullError) {
      console.error('❌ Error:', nullError.message);
    } else if (recentNull) {
      console.log(`   Found ${recentNull.length} entries with NULL accuracy:\n`);
      if (recentNull.length > 0) {
        recentNull.forEach((row: any, index: number) => {
          console.log(`   ${index + 1}. User: ${row.user_id.substring(0, 8)}...`);
          console.log(`      Lat: ${row.latitude.toFixed(6)}, Lng: ${row.longitude.toFixed(6)}`);
          console.log(`      Accuracy: NULL`);
          console.log(`      Created: ${new Date(row.created_at).toLocaleString()}`);
          console.log('');
        });
      } else {
        console.log('   ✅ No entries with NULL accuracy found!\n');
      }
    }

    console.log('============================================');
    console.log('✅ Check complete!');
    console.log('============================================');

  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

// Run the check
checkLocationHistory();
