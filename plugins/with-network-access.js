const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

/**
 * Expo config plugin to ensure network access is properly configured
 * - Adds INTERNET permission
 * - Configures network security to allow HTTPS connections
 */
const withNetworkAccess = (config) => {
  // Add INTERNET permission
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
  ]);

  // Configure AndroidManifest.xml for network access
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const { manifest } = androidManifest;

    // Ensure application element exists
    if (!manifest.application) {
      manifest.application = [{}];
    }

    const application = manifest.application[0];

    // Ensure application attributes object exists
    if (!application.$) {
      application.$ = {};
    }
    
    // CRITICAL: Allow cleartext traffic (needed for some APIs and debugging)
    // This ensures network requests work properly
    application.$['android:usesCleartextTraffic'] = 'true';

    // CRITICAL: Add network security config reference
    // This file allows HTTPS connections to work properly
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    
    // Ensure INTERNET permission is explicitly declared
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    
    // Add INTERNET permission if not already present
    const hasInternetPermission = manifest['uses-permission'].some(
      (perm) => perm.$ && perm.$['android:name'] === 'android.permission.INTERNET'
    );
    
    if (!hasInternetPermission) {
      manifest['uses-permission'].push({
        $: {
          'android:name': 'android.permission.INTERNET'
        }
      });
    }
    
    // Add ACCESS_NETWORK_STATE permission
    const hasNetworkStatePermission = manifest['uses-permission'].some(
      (perm) => perm.$ && perm.$['android:name'] === 'android.permission.ACCESS_NETWORK_STATE'
    );
    
    if (!hasNetworkStatePermission) {
      manifest['uses-permission'].push({
        $: {
          'android:name': 'android.permission.ACCESS_NETWORK_STATE'
        }
      });
    }

    console.log('✅ Network access configured in AndroidManifest.xml');

    return config;
  });

  return config;
};

module.exports = withNetworkAccess;

