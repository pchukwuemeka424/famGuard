const { withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to inject Google Maps API key into AndroidManifest.xml
 * This ensures the API key is properly substituted during the build process
 * NEVER leaves a placeholder - always injects a real value
 */
const withGoogleMapsApiKey = (config) => {
  // Handle the AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    // Get the API key from multiple sources (in order of priority)
    let apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    let apiKeySource = 'environment variable';
    
    // Try to read from .env file if not in environment
    if (!apiKey || apiKey === '') {
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const match = envContent.match(/^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=(.+)$/m);
          if (match) {
            apiKey = match[1].trim().replace(/^["']|["']$/g, '');
            apiKeySource = '.env file';
            console.log(`📝 Reading Google Maps API key from .env file`);
          }
        } catch (e) {
          console.warn('⚠️  Error reading .env file:', e.message);
        }
      }
    } else {
      console.log(`📝 Using Google Maps API key from environment variable`);
    }
    
    // Try .env.example as last resort (for builds)
    if (!apiKey) {
      const envExamplePath = path.join(process.cwd(), '.env.example');
      if (fs.existsSync(envExamplePath)) {
        try {
          const envContent = fs.readFileSync(envExamplePath, 'utf8');
          const match = envContent.match(/^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=(.+)$/m);
          if (match) {
            apiKey = match[1].trim().replace(/^["']|["']$/g, '');
            console.log('⚠️  Using API key from .env.example as fallback');
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }
    
    // Fall back to config values
    if (!apiKey) {
      apiKey = config.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
               config.android?.config?.googleMaps?.apiKey;
    }

    // Remove placeholder syntax if present
    if (apiKey) {
      apiKey = apiKey.replace(/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/g, '').trim();
    }

    // CRITICAL: Never leave a placeholder - use a real value or a safe fallback
    // This prevents Gradle from trying to resolve it as a Gradle property
    if (!apiKey || apiKey === '') {
      console.error('❌ EXPO_PUBLIC_GOOGLE_MAPS_API_KEY not found!');
      console.error('❌ Using empty string to prevent build failure.');
      console.error('❌ Google Maps will NOT work until you set the API key.');
      apiKey = ''; // Use empty string instead of placeholder
    } else {
      // Log first 20 characters for verification (security: don't log full key)
      const keyPreview = apiKey.length > 20 ? `${apiKey.substring(0, 20)}...` : `${apiKey.substring(0, apiKey.length)}...`;
      console.log(`✅ Found Google Maps API key from ${apiKeySource}: ${keyPreview}`);
      console.log(`✅ API key length: ${apiKey.length} characters`);
    }

    // Ensure application element exists
    if (!manifest.application) {
      manifest.application = [{}];
    }

    const application = manifest.application[0];

    // Ensure meta-data array exists
    if (!application['meta-data']) {
      application['meta-data'] = [];
    }

    // Find existing Google Maps API key meta-data or create new one
    const existingMetaData = application['meta-data'].find(
      (meta) => meta.$['android:name'] === 'com.google.android.geo.API_KEY'
    );

    if (existingMetaData) {
      // Update existing meta-data with actual value (never placeholder)
      existingMetaData.$['android:value'] = apiKey;
      const keyPreview = apiKey.length > 20 ? `${apiKey.substring(0, 20)}...` : `${apiKey.substring(0, apiKey.length)}...`;
      console.log(`✅ Updated Google Maps API key in AndroidManifest.xml with: ${keyPreview}`);
    } else {
      // Add new meta-data with actual value (never placeholder)
      application['meta-data'].push({
        $: {
          'android:name': 'com.google.android.geo.API_KEY',
          'android:value': apiKey,
        },
      });
      const keyPreview = apiKey.length > 20 ? `${apiKey.substring(0, 20)}...` : `${apiKey.substring(0, apiKey.length)}...`;
      console.log(`✅ Added Google Maps API key to AndroidManifest.xml with: ${keyPreview}`);
    }

    return config;
  });

  return config;
};

module.exports = withGoogleMapsApiKey;

