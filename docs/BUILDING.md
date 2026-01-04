# Building and Deployment Guide

This guide covers how to build and deploy the FamGuard (SafeZone) app for production.

## Prerequisites

1. **EAS CLI Installed**
   ```bash
   npm install -g eas-cli
   ```

2. **Expo Account**
   - Sign up at [expo.dev](https://expo.dev)
   - Login: `eas login`

3. **EAS Project Configured**
   - Project ID is set in `app.json` and `app.config.js`
   - EAS project is linked to your Expo account

## Environment Variables (EAS Secrets)

Before building, you must set up environment variables as EAS secrets.

### Setting Up EAS Secrets

```bash
# Supabase Configuration
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value your_supabase_url
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value your_supabase_anon_key

# Google Maps
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value your_google_maps_api_key

# Expo Project
eas secret:create --scope project --name EXPO_PUBLIC_EXPO_PROJECT_ID --value your_expo_project_id

# Delete Account URL
eas secret:create --scope project --name EXPO_PUBLIC_DELETE_ACCOUNT_URL --value https://safezone.app/delete-account
```

### Viewing Secrets

```bash
eas secret:list
```

### Updating Secrets

```bash
eas secret:create --scope project --name SECRET_NAME --value new_value --force
```

## Build Profiles

The project includes several build profiles in `eas.json`:

### Development
- **Purpose**: Development builds with debugging enabled
- **Distribution**: Internal
- **Use Case**: Testing during development

### Preview
- **Purpose**: Internal distribution builds
- **Platform**: Android (APK)
- **Distribution**: Internal
- **Use Case**: Testing with testers

### APK
- **Purpose**: Android APK for testing
- **Platform**: Android
- **Distribution**: Internal
- **Use Case**: Direct APK installation

### AAB
- **Purpose**: Android App Bundle for Play Store
- **Platform**: Android
- **Distribution**: Store
- **Use Case**: Google Play Store submission

### Production
- **Purpose**: Production builds for app stores
- **Platform**: iOS and Android
- **Distribution**: Store
- **Use Case**: App Store and Play Store releases

## Building for Android

### Build APK (Testing)

```bash
npm run build:android:apk
```

Or directly:
```bash
eas build --platform android --profile apk
```

### Build AAB (Play Store)

```bash
npm run build:android
```

Or directly:
```bash
eas build --platform android --profile production
```

### Android Build Configuration

- **Package Name**: `com.famguardacehubtech`
- **Version Code**: Auto-incremented (configured in `eas.json`)
- **Build Type**: App Bundle (AAB) for production, APK for testing
- **Signing**: Handled automatically by EAS

## Building for iOS

### Build for App Store

```bash
npm run build:ios
```

Or directly:
```bash
eas build --platform ios --profile production
```

### iOS Build Configuration

- **Bundle Identifier**: `com.famguardacehubtech`
- **Signing**: Requires Apple Developer account
- **Certificates**: Managed by EAS

### iOS Build Requirements

1. **Apple Developer Account**
   - Active Apple Developer Program membership
   - App Store Connect access

2. **Credentials Setup**
   - EAS can automatically manage credentials
   - Or manually configure in Apple Developer Portal

3. **App Store Connect**
   - App must be created in App Store Connect
   - Bundle ID must match

## Building for Both Platforms

```bash
npm run build:all
```

Or directly:
```bash
eas build --platform all --profile production
```

## Build Process

### 1. Start Build

```bash
eas build --platform android --profile production
```

### 2. Monitor Build

- Build progress is shown in terminal
- Or check [expo.dev/builds](https://expo.dev/builds)

### 3. Download Build

Once complete:
- Download link is provided in terminal
- Or download from Expo dashboard

## Build Configuration Files

### eas.json

Contains build profiles and configuration:
- Build profiles (development, preview, production, etc.)
- Environment variables
- Platform-specific settings
- Build optimization flags

### app.config.js

Dynamic configuration that:
- Injects environment variables at build time
- Configures app metadata
- Sets up plugins

### app.json

Static Expo configuration:
- App name, slug, version
- Icons and splash screens
- Permissions
- Platform-specific settings

## Version Management

### Version Numbers

- **Version**: Set in `app.json` (e.g., "1.0.1")
- **Version Code** (Android): Auto-incremented in production builds
- **Build Number** (iOS): Managed by EAS

### Updating Version

1. Update version in `app.json`:
   ```json
   {
     "version": "1.0.2"
   }
   ```

2. Update version in `app.config.js`:
   ```javascript
   version: "1.0.2"
   ```

3. Commit changes:
   ```bash
   git add app.json app.config.js
   git commit -m "Bump version to 1.0.2"
   ```

## Submitting to App Stores

### Google Play Store

1. **Build AAB**
   ```bash
   eas build --platform android --profile production
   ```

2. **Upload to Play Console**
   - Go to [Play Console](https://play.google.com/console)
   - Create new release
   - Upload AAB file
   - Fill in release notes
   - Submit for review

3. **Requirements**
   - App signing key (managed by EAS)
   - Store listing assets
   - Privacy policy URL
   - Content rating

### Apple App Store

1. **Build for App Store**
   ```bash
   eas build --platform ios --profile production
   ```

2. **Submit with EAS Submit**
   ```bash
   eas submit --platform ios
   ```

3. **Or Manual Upload**
   - Download IPA from Expo dashboard
   - Upload via Transporter app or Xcode
   - Submit in App Store Connect

4. **Requirements**
   - App Store Connect app created
   - Store listing assets
   - Privacy policy URL
   - App review information

## Continuous Integration

### GitHub Actions Example

```yaml
name: Build and Submit

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm install -g eas-cli
      - run: eas build --platform all --profile production --non-interactive
```

## Build Optimization

### Environment Variables

- Set `NODE_ENV=production` for production builds
- Use build-specific environment variables
- Avoid committing sensitive data

### Build Flags

Configured in `eas.json`:
- `EXPO_NO_TYPESCRIPT_CHECK`: Skip TypeScript checks
- `NODE_OPTIONS`: Node.js options
- `EXPO_USE_FAST_RESOLVER`: Use fast resolver

### Code Optimization

- Remove console logs in production (babel plugin configured)
- Optimize images and assets
- Enable code splitting where possible

## Troubleshooting Builds

### Common Build Errors

1. **Missing Environment Variables**
   - Verify all EAS secrets are set
   - Check secret names match exactly

2. **Signing Errors (iOS)**
   - Verify Apple Developer account
   - Check bundle identifier matches
   - Ensure certificates are valid

3. **Google Maps API Key**
   - Verify API key is correct
   - Check API restrictions
   - Ensure APIs are enabled

4. **Build Timeouts**
   - Large builds may timeout
   - Check build logs for specific errors
   - Try building again

### Build Logs

View detailed logs:
```bash
eas build:view [BUILD_ID]
```

Or check in Expo dashboard.

### Clearing Build Cache

If builds are failing unexpectedly:
```bash
eas build --clear-cache --platform android
```

## Build Artifacts

### Android

- **APK**: Direct installation file
- **AAB**: App Bundle for Play Store

### iOS

- **IPA**: App archive for App Store or TestFlight

### Download Locations

- Expo dashboard: [expo.dev/builds](https://expo.dev/builds)
- Direct download link in terminal after build

## Best Practices

1. **Test Before Production**
   - Always test preview builds
   - Use internal distribution first
   - Test on multiple devices

2. **Version Control**
   - Tag releases in Git
   - Document changes in release notes
   - Keep version numbers consistent

3. **Security**
   - Never commit secrets
   - Use EAS secrets for sensitive data
   - Review permissions before release

4. **Monitoring**
   - Monitor build times
   - Review build logs
   - Track build success rates

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Google Play Console](https://play.google.com/console)

