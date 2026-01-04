import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { logger } from '../utils/logger';

// Get Supabase credentials from environment variables
// Priority order:
// 1. .env file (process.env) - for local development
// 2. app.json extra config (Constants.expoConfig.extra) - for EAS builds
// 
// Note: Expo SDK 50+ supports .env files natively. Variables must be prefixed with EXPO_PUBLIC_
// to be available in the app. Create a .env file in the project root with your variables.
const getEnvVar = (key: string): string | undefined => {
  // First, try process.env (from .env file) - this is the preferred method for local development
  // Expo automatically loads .env files and makes EXPO_PUBLIC_* variables available
  if (process.env[key]) {
    const value = process.env[key];
    // Check if it's still a placeholder (not replaced)
    if (typeof value === 'string' && value.includes('${')) {
      return undefined;
    }
    // Return the value from .env file
    if (value && value.trim() !== '') {
      return value;
    }
  }
  
  // Fallback to Constants.expoConfig.extra (for app.json config or EAS builds)
  if (Constants.expoConfig?.extra?.[key]) {
    const value = Constants.expoConfig.extra[key];
    // Check if it's still a placeholder (not replaced during build)
    if (typeof value === 'string' && value.includes('${')) {
      return undefined; // Return undefined if placeholder not replaced
    }
    return value;
  }
  
  return undefined;
};

// Validate URL format
const isValidUrl = (url: string): boolean => {
  if (!url || url.trim() === '') return false;
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

const supabaseUrl = getEnvVar('EXPO_PUBLIC_SUPABASE_URL') || '';
const supabaseAnonKey = getEnvVar('EXPO_PUBLIC_SUPABASE_ANON_KEY') || '';

// Check if the URL is the literal placeholder (not replaced)
const isPlaceholder = supabaseUrl.includes('${EXPO_PUBLIC_SUPABASE_URL}') || supabaseUrl === '';
const hasValidUrl = isValidUrl(supabaseUrl);
const hasValidKey = supabaseAnonKey && !supabaseAnonKey.includes('${EXPO_PUBLIC_SUPABASE_ANON_KEY}');

// Store whether we have valid credentials
export const hasValidSupabaseConfig = hasValidUrl && hasValidKey;

// Track if we've already shown the warning to avoid spam
let hasShownConfigWarning = false;

// Log warnings but don't throw errors - allow app to start
// Only show warning once, and only in development
// NOTE: This warning is now completely suppressed to reduce console noise
// Developers should check their .env file setup independently
if (!hasValidUrl || !hasValidKey) {
  // Completely suppress this warning - it's not actionable during runtime
  // The app will work with placeholder values and show errors when Supabase operations are attempted
  // Developers should check their .env file setup
  if (false && __DEV__ && !hasShownConfigWarning) {
    // Disabled - warning is suppressed
    hasShownConfigWarning = true;
  }
}

// Create Supabase client - use placeholder values if env vars are missing to prevent crashes
// The app will show errors when trying to use Supabase, but won't crash on startup
const finalUrl = hasValidUrl ? supabaseUrl : 'https://placeholder.supabase.co';
const finalKey = hasValidKey ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    persistSession: hasValidUrl && hasValidKey,
    autoRefreshToken: hasValidUrl && hasValidKey,
    detectSessionInUrl: false,
    storage: undefined, // Use default storage (AsyncStorage)
    flowType: 'pkce', // Use PKCE flow (works without WebCrypto API)
    // Suppress WebCrypto warning by using pkce flow which doesn't require WebCrypto
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      'x-client-info': 'famguard-mobile',
    },
  },
});

/**
 * Helper function to check if Supabase is properly configured
 * Use this before making Supabase calls to avoid errors
 */
export const isSupabaseConfigured = (): boolean => {
  return hasValidSupabaseConfig;
};

/**
 * Helper function to safely execute Supabase operations
 * Returns null if Supabase is not configured
 */
export const safeSupabaseCall = async <T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T | null> => {
  if (!hasValidSupabaseConfig) {
    if (__DEV__) {
      logger.warn('Supabase operation skipped: Environment variables not configured');
    }
    return fallback ?? null;
  }
  
  try {
    return await operation();
  } catch (error) {
    logger.error('Supabase operation failed:', error);
    return fallback ?? null;
  }
};

