import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Get Supabase credentials from environment variables
// In Expo, you can use app.json extra config or .env file with expo-constants
const getEnvVar = (key: string): string | undefined => {
  // Try to get from Constants.expoConfig.extra first (for app.json config)
  if (Constants.expoConfig?.extra?.[key]) {
    return Constants.expoConfig.extra[key];
  }
  // Fallback to process.env (for .env file with expo-constants)
  return process.env[key];
};

const supabaseUrl = getEnvVar('EXPO_PUBLIC_SUPABASE_URL') || '';
const supabaseAnonKey = getEnvVar('EXPO_PUBLIC_SUPABASE_ANON_KEY') || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file or app.json'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: undefined, // Use default storage (AsyncStorage)
      flowType: 'pkce',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

