# Installation Guide

This guide will walk you through setting up the FamGuard (SafeZone) development environment.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

- **Node.js** (v18 or higher)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`

- **npm** (comes with Node.js) or **yarn**
  - Verify installation: `npm --version`

- **Git**
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify installation: `git --version`

### Development Tools

- **Expo CLI**
  ```bash
  npm install -g expo-cli
  ```

- **EAS CLI** (for building)
  ```bash
  npm install -g eas-cli
  ```

### Platform-Specific Requirements

#### iOS Development
- **macOS** (required for iOS development)
- **Xcode** (latest version from App Store)
- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```
- **CocoaPods** (for iOS dependencies)
  ```bash
  sudo gem install cocoapods
  ```

#### Android Development
- **Android Studio** (latest version)
- **Android SDK** (installed via Android Studio)
- **Java Development Kit (JDK)** 11 or higher
- **Android Emulator** (optional, for testing)

## Step-by-Step Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd safezone
```

### 2. Install Dependencies

```bash
npm install
```

This will install all project dependencies defined in `package.json`.

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
touch .env
```

Add the following environment variables to `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
EXPO_PUBLIC_EXPO_PROJECT_ID=your_expo_project_id
EXPO_PUBLIC_DELETE_ACCOUNT_URL=https://safezone.app/delete-account
```

**Important Notes:**
- All environment variables must be prefixed with `EXPO_PUBLIC_` to be accessible in the app
- Never commit the `.env` file to version control
- The `.env` file should be listed in `.gitignore`

### 4. Configure Google Maps

1. **Create a Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable Required APIs**
   - Navigate to "APIs & Services" > "Library"
   - Enable the following APIs:
     - Maps SDK for Android
     - Maps SDK for iOS
     - Places API (optional, for location search)

3. **Create API Key**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the API key

4. **Restrict API Key** (Recommended for production)
   - Click on the created API key
   - Under "Application restrictions", select:
     - Android apps: Add your package name and SHA-1 certificate fingerprint
     - iOS apps: Add your bundle identifier
   - Under "API restrictions", restrict to:
     - Maps SDK for Android
     - Maps SDK for iOS
     - Places API (if used)

5. **Add to Environment Variables**
   - Add the API key to your `.env` file as `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

### 5. Set Up Supabase

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Sign up or log in
   - Create a new project
   - Wait for the project to be fully provisioned

2. **Get Project Credentials**
   - Go to Project Settings > API
   - Copy the following:
     - Project URL → `EXPO_PUBLIC_SUPABASE_URL`
     - Anon/Public Key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

3. **Run Database Migrations**
   ```bash
   # Navigate to supabase directory
   cd supabase/migrations
   
   # Run migrations in order (check migration file names for order)
   # You can run them via Supabase Dashboard SQL Editor or CLI
   ```

4. **Set Up Authentication**
   - Go to Authentication > Providers in Supabase Dashboard
   - Configure email/password authentication
   - Optionally enable other providers (Google, Apple, etc.)

5. **Set Up Realtime** (if needed)
   - Realtime is enabled by default in Supabase
   - Ensure your database tables have Realtime enabled if needed

6. **Add to Environment Variables**
   - Add the credentials to your `.env` file

### 6. Configure iOS (macOS only)

1. **Install CocoaPods Dependencies**
   ```bash
   cd ios
   pod install
   cd ..
   ```

2. **Configure Bundle Identifier**
   - The bundle identifier is set in `app.json`: `com.famguardacehubtech`
   - Update if needed for your organization

### 7. Configure Android

1. **Set Up Google Services**
   - The `google-services.json` file should be in the root directory
   - This file is typically downloaded from Firebase Console
   - Ensure it matches your Android package name

2. **Configure Package Name**
   - The package name is set in `app.json`: `com.famguardacehubtech`
   - Update if needed for your organization

## Verification

### Verify Installation

1. **Check Node.js and npm**
   ```bash
   node --version
   npm --version
   ```

2. **Check Expo CLI**
   ```bash
   expo --version
   ```

3. **Check EAS CLI**
   ```bash
   eas --version
   ```

### Test the Setup

1. **Start the Development Server**
   ```bash
   npm start
   ```

2. **Run on iOS Simulator** (macOS only)
   ```bash
   npm run ios
   ```

3. **Run on Android Emulator**
   ```bash
   npm run android
   ```

4. **Run on Physical Device**
   - Install Expo Go app on your device
   - Scan the QR code from the terminal
   - Or use the development build

## Troubleshooting Installation

### Common Issues

1. **Node modules installation fails**
   - Clear npm cache: `npm cache clean --force`
   - Delete `node_modules` and `package-lock.json`
   - Run `npm install` again

2. **iOS pod install fails**
   - Update CocoaPods: `sudo gem install cocoapods`
   - Clear CocoaPods cache: `pod cache clean --all`
   - Delete `ios/Pods` and `ios/Podfile.lock`
   - Run `pod install` again

3. **Environment variables not loading**
   - Ensure variables are prefixed with `EXPO_PUBLIC_`
   - Restart the development server
   - Clear Expo cache: `expo start -c`

4. **Google Maps not working**
   - Verify API key is correct
   - Check API restrictions in Google Cloud Console
   - Ensure required APIs are enabled

5. **Supabase connection errors**
   - Verify credentials in `.env` file
   - Check Supabase project is active
   - Verify network connectivity

## Next Steps

After successful installation:

1. Read the [Development Guide](./DEVELOPMENT.md) to start developing
2. Review the [Configuration Guide](./CONFIGURATION.md) for advanced setup
3. Check the [Architecture Documentation](./ARCHITECTURE.md) to understand the project structure

## Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)

