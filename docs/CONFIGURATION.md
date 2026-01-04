# Configuration Guide

This guide covers all configuration options and settings for the FamGuard (SafeZone) application.

## Environment Variables

### Required Variables

All environment variables must be prefixed with `EXPO_PUBLIC_` to be accessible in the app.

#### Supabase Configuration

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**How to get:**
1. Go to Supabase Dashboard
2. Navigate to Settings > API
3. Copy Project URL and anon/public key

#### Google Maps

```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

**How to get:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create API key
3. Enable Maps SDK for Android and iOS
4. Restrict API key (recommended)

#### Expo Project

```env
EXPO_PUBLIC_EXPO_PROJECT_ID=your-expo-project-id
```

**How to get:**
1. Go to [expo.dev](https://expo.dev)
2. Create or select project
3. Copy Project ID from project settings

#### Delete Account URL

```env
EXPO_PUBLIC_DELETE_ACCOUNT_URL=https://safezone.app/delete-account
```

Default: `https://safezone.app/delete-account`

### Environment File Setup

Create `.env` file in project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key
EXPO_PUBLIC_EXPO_PROJECT_ID=your_id
EXPO_PUBLIC_DELETE_ACCOUNT_URL=https://safezone.app/delete-account
```

**Important:**
- Never commit `.env` file to version control
- Add `.env` to `.gitignore`
- Use EAS secrets for production builds

## App Configuration

### app.json

Static Expo configuration file:

```json
{
  "expo": {
    "name": "FamGuard",
    "slug": "famguard",
    "version": "1.0.1",
    "sdkVersion": "54.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light"
  }
}
```

### app.config.js

Dynamic configuration that injects environment variables:

```javascript
module.exports = ({ config }) => {
  // Environment variables are injected here
  return {
    ...config,
    // Configuration
  };
};
```

### Key Configuration Options

#### App Identity
- **name**: Display name of the app
- **slug**: URL-friendly identifier
- **version**: App version (semantic versioning)
- **sdkVersion**: Expo SDK version

#### Platform Configuration

**iOS:**
- `bundleIdentifier`: App bundle ID
- `supportsTablet`: Tablet support
- `infoPlist`: iOS-specific settings

**Android:**
- `package`: Android package name
- `versionCode`: Version code (integer)
- `permissions`: Android permissions

## Google Maps Configuration

### API Key Setup

1. **Create API Key**
   - Google Cloud Console > APIs & Services > Credentials
   - Create API Key

2. **Enable APIs**
   - Maps SDK for Android
   - Maps SDK for iOS
   - Places API (optional)

3. **Restrict API Key** (Recommended)
   - Application restrictions:
     - Android: Package name + SHA-1
     - iOS: Bundle identifier
   - API restrictions: Limit to required APIs

### Plugin Configuration

Configured in `plugins/with-google-maps-api-key.js`:

```javascript
// Automatically injects API key into native configs
```

## Supabase Configuration

### Database Setup

1. **Run Migrations**
   ```bash
   # Migrations are in supabase/migrations/
   # Run via Supabase Dashboard SQL Editor or CLI
   ```

2. **Enable Realtime**
   - Go to Database > Replication
   - Enable replication for required tables

3. **Set Up Row Level Security (RLS)**
   - Configure RLS policies
   - Test policies

### Authentication Setup

1. **Enable Providers**
   - Email/Password (default)
   - OAuth providers (optional)

2. **Configure Email Templates**
   - Customize email templates
   - Set up SMTP (optional)

3. **Session Configuration**
   - Session duration
   - Refresh token settings

## Build Configuration

### eas.json

EAS Build configuration:

```json
{
  "build": {
    "production": {
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Build Profiles

- **development**: Development builds
- **preview**: Internal testing
- **apk**: Android APK
- **aab**: Android App Bundle
- **production**: Production builds

## Location Configuration

### iOS Location Permissions

Configured in `app.json`:

```json
{
  "ios": {
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "Description",
      "NSLocationAlwaysAndWhenInUseUsageDescription": "Description",
      "NSLocationAlwaysUsageDescription": "Description"
    }
  }
}
```

### Android Location Permissions

Configured in `app.json`:

```json
{
  "android": {
    "permissions": [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION"
    ]
  }
}
```

## Notification Configuration

### Expo Notifications

Configured in `app.json`:

```json
{
  "plugins": [
    [
      "expo-notifications",
      {
        "icon": "./assets/icon.png",
        "color": "#DC2626",
        "sounds": ["./assets/alert.wav"],
        "mode": "production"
      }
    ]
  ]
}
```

### Push Notification Setup

1. **iOS (APNs)**
   - Apple Developer account required
   - Push notification certificate
   - Configured via EAS

2. **Android (FCM)**
   - Firebase project
   - `google-services.json` file
   - Configured in project

## Network Configuration

### Network Security Config (Android)

Configured in `plugins/with-network-security-config.js`:

- Allows cleartext traffic (if needed)
- Certificate pinning (optional)
- Network security policies

## Feature Flags

### App Settings

Controlled via `app_settings` table:

- `hide_report_incident`: Hide report incident feature
- `hide_incident`: Hide incident feed
- `sos_lock`: Enable SOS lock feature

### Context Configuration

Managed in `AppSettingContext`:

```typescript
const { hideReportIncident, hideIncident, sosLock } = useAppSetting();
```

## Background Task Configuration

### Location Background Task

Configured in `src/tasks/locationBackgroundTask.ts`:

- Update frequency
- Accuracy settings
- Battery optimization
- Error handling

### Background Fetch

Configured via Expo:

```typescript
BackgroundFetch.setMinimumIntervalAsync(15); // minutes
```

## Logging Configuration

### Logger Utility

Configured in `src/utils/logger.ts`:

- Development: Console logging
- Production: Error logging only
- Log levels: info, warn, error

## TypeScript Configuration

### tsconfig.json

TypeScript compiler options:

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Babel Configuration

### babel.config.js

Babel transpilation settings:

- Expo preset
- Console log removal in production
- Transform plugins

## Metro Configuration

### metro.config.js

Metro bundler configuration:

- Asset extensions
- Source extensions
- Resolver settings

## Platform-Specific Configuration

### iOS

**Info.plist Settings:**
- Location permissions
- Background modes
- URL schemes

**Xcode Settings:**
- Signing & Capabilities
- Build settings
- Deployment target

### Android

**AndroidManifest.xml:**
- Permissions
- Activities
- Services

**build.gradle:**
- Dependencies
- Build variants
- Signing configs

## Environment-Specific Configuration

### Development

- Debug logging enabled
- Development API endpoints
- Hot reload enabled

### Production

- Error logging only
- Production API endpoints
- Code optimization
- Asset optimization

## Custom Plugins

### with-google-maps-api-key.js

Injects Google Maps API key into native configs.

### with-network-access.js

Configures network access permissions.

### with-network-security-config.js

Sets up Android network security configuration.

## Configuration Validation

### Environment Validation

The app validates environment variables on startup:

```typescript
// src/utils/envValidation.ts
// Validates required environment variables
```

### Runtime Checks

- Supabase connection check
- Google Maps API key validation
- Permission status checks

## Troubleshooting Configuration

### Common Issues

1. **Environment variables not loading**
   - Check `.env` file exists
   - Verify `EXPO_PUBLIC_` prefix
   - Restart development server

2. **Google Maps not working**
   - Verify API key
   - Check API restrictions
   - Ensure APIs are enabled

3. **Supabase connection errors**
   - Verify credentials
   - Check project status
   - Review network settings

4. **Build configuration errors**
   - Check `app.json` syntax
   - Verify `app.config.js` exports
   - Review EAS configuration

## Best Practices

1. **Never commit secrets**
   - Use `.env` for local development
   - Use EAS secrets for builds
   - Add `.env` to `.gitignore`

2. **Version control**
   - Commit `app.json` and `app.config.js`
   - Document configuration changes
   - Use semantic versioning

3. **Environment separation**
   - Different configs for dev/prod
   - Test configurations before deploying
   - Use feature flags for gradual rollout

4. **Security**
   - Restrict API keys
   - Use least privilege
   - Regular security audits

## Resources

- [Expo Configuration](https://docs.expo.dev/workflow/configuration/)
- [EAS Build Configuration](https://docs.expo.dev/build-reference/eas-json/)
- [Environment Variables](https://docs.expo.dev/guides/environment-variables/)

