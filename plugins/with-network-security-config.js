const { withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to create network security configuration
 * This allows the app to make HTTPS connections
 */
const withNetworkSecurityConfig = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const resPath = path.join(projectRoot, 'app/src/main/res/xml');
      
      // Create res/xml directory if it doesn't exist
      if (!fs.existsSync(resPath)) {
        fs.mkdirSync(resPath, { recursive: true });
      }

      const networkSecurityConfigPath = path.join(resPath, 'network_security_config.xml');
      
      // Create network security config that allows all HTTPS connections
      // This is critical for the app to connect to Supabase and other APIs
      // NOTE: Only ONE <base-config> is allowed in Android network security config
      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Base config: Allow cleartext traffic and trust system/user certificates -->
    <!-- This ensures the app can connect to HTTPS APIs -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <!-- Trust system certificates -->
            <certificates src="system" />
            <!-- Trust user-installed certificates -->
            <certificates src="user" />
        </trust-anchors>
    </base-config>
    
    <!-- Explicitly allow connections to Supabase and other APIs -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">supabase.co</domain>
        <domain includeSubdomains="true">supabase.in</domain>
        <domain includeSubdomains="true">googleapis.com</domain>
        <domain includeSubdomains="true">google.com</domain>
        <domain includeSubdomains="true">expo.dev</domain>
        <domain includeSubdomains="true">expo.io</domain>
    </domain-config>
</network-security-config>`;

      fs.writeFileSync(networkSecurityConfigPath, networkSecurityConfig);
      console.log('✅ Created network_security_config.xml');

      return config;
    },
  ]);
};

module.exports = withNetworkSecurityConfig;

