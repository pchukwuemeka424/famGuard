import Constants from 'expo-constants';
import { logger } from './logger';

/**
 * Get environment variable with fallback
 * Priority: .env file (process.env) > app.json extra config
 */
const getEnvVar = (key: string): string | undefined => {
  // First, try process.env (from .env file) - preferred for local development
  if (process.env[key]) {
    const value = process.env[key];
    if (value && value.trim() !== '' && !value.includes('${')) {
      return value;
    }
  }
  
  // Fallback to Constants.expoConfig.extra (for app.json config or EAS builds)
  if (Constants.expoConfig?.extra?.[key]) {
    const value = Constants.expoConfig.extra[key];
    if (typeof value === 'string' && value.includes('${')) {
      return undefined; // Placeholder not replaced
    }
    return value;
  }
  
  return undefined;
};

/**
 * Validate required environment variables
 */
export const validateEnv = (): boolean => {
  const requiredVars = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  ];

  const missing: string[] = [];

  for (const varName of requiredVars) {
    const value = getEnvVar(varName);
    if (!value || value.trim() === '') {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing);
    if (__DEV__) {
      console.warn(
        '⚠️ Missing environment variables. Please check your .env file.\n',
        'Missing:', missing.join(', ')
      );
    }
    return false;
  }

  return true;
};

/**
 * Get environment variable or throw error if missing
 */
export const getRequiredEnvVar = (key: string): string => {
  const value = getEnvVar(key);
  if (!value || value.trim() === '') {
    throw new Error(`Required environment variable ${key} is missing`);
  }
  return value;
};

/**
 * Get Google Maps API key from environment variables
 */
export const getGoogleMapsApiKey = (): string => {
  return getRequiredEnvVar('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
};

