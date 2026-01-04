/**
 * Warning suppression setup
 * This file must be imported BEFORE any modules that might log warnings
 * Import this at the very top of App.tsx
 * 
 * This file sets up filters to suppress known warnings that are not actionable
 * or are expected in certain environments (e.g., Expo Go limitations)
 */

// Set up console.warn filter BEFORE any other code runs
// This must execute before expo-notifications or other modules are imported
if (typeof console !== 'undefined' && console.warn) {
  const originalWarn = console.warn;
  const suppressedPatterns = [
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
    'expo_public_supabase_url',
    'expo_public_supabase_anon_key',
  ];
  
  console.warn = (...args: any[]) => {
    // Convert all arguments to string and check for suppressed patterns
    const fullMessage = args.map(arg => String(arg || '')).join(' ').toLowerCase();
    
    // Filter out suppressed warnings
    const shouldSuppress = suppressedPatterns.some(pattern => 
      fullMessage.includes(pattern.toLowerCase())
    );
    
    if (shouldSuppress) {
      // Suppress these warnings completely - they're not actionable or expected
      return;
    }
    // Allow other warnings through
    originalWarn.apply(console, args);
  };
}

// Set up LogBox ignore logs if available
// LogBox is React Native's warning overlay system
if (typeof require !== 'undefined') {
  try {
    const { LogBox } = require('react-native');
    if (LogBox && typeof LogBox.ignoreLogs === 'function') {
      LogBox.ignoreLogs([
        /expo-notifications.*expo go/i,
        /expo-notifications.*development build/i,
        /expo-notifications.*dev-client/i,
        /android push notifications.*expo go/i,
        /webcrypto api is not supported/i,
        /code challenge method will default to use plain/i,
        /we recommend you instead use a development build/i,
        /supabase url environment variable not set/i,
        /supabase anon key environment variable not set/i,
        /create a \.env file/i,
      ]);
    }
  } catch (e) {
    // LogBox might not be available in all environments (e.g., web)
    // Silently fail - console.warn filter will still catch warnings
  }
}

