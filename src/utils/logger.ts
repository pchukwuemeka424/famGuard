/**
 * Production-safe logger utility
 * Only logs in development mode, prevents console logs in production
 */

const isDevelopment = __DEV__;

// List of warning patterns to suppress
const SUPPRESSED_WARNINGS = [
  'expo-notifications',
  'expo go',
  'development build',
  'dev-client',
  'android push notifications',
  'webcrypto api is not supported',
  'code challenge method will default to use plain',
  'we recommend you instead use a development build',
  'supabase url environment variable not set',
  'supabase anon key environment variable not set',
  'create a .env file',
];

// Check if a warning message should be suppressed
const shouldSuppressWarning = (message: string): boolean => {
  const messageStr = String(message || '').toLowerCase();
  return SUPPRESSED_WARNINGS.some(pattern => messageStr.includes(pattern.toLowerCase()));
};

class Logger {
  log(...args: any[]): void {
    if (isDevelopment) {
      console.log(...args);
    }
  }

  warn(...args: any[]): void {
    if (isDevelopment) {
      const message = args[0] || '';
      // Suppress known warnings
      if (!shouldSuppressWarning(String(message))) {
        console.warn(...args);
      }
    }
  }

  error(...args: any[]): void {
    // Always log errors, even in production (but can be sent to error tracking service)
    console.error(...args);
  }

  debug(...args: any[]): void {
    if (isDevelopment) {
      console.debug(...args);
    }
  }

  info(...args: any[]): void {
    if (isDevelopment) {
      console.info(...args);
    }
  }
}

export const logger = new Logger();

