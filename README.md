# FamGuard

**Your Family's Safety Network**

FamGuard is a comprehensive mobile safety application built with React Native and Expo that enables families to stay connected, share locations in real-time, and receive community safety alerts.

## 🎯 Features

### Core Functionality
- **Real-time Location Sharing**: Share your location with trusted family members and connections
- **Incident Reporting**: Report and view community safety incidents in your area
- **Travel Advisories**: Receive safety alerts and advisories for your travel destinations
- **Check-in System**: Scheduled check-ins to let your family know you're safe
- **Connection Management**: Connect with family members and manage your safety network
- **Offline Maps**: Access maps even when offline
- **Push Notifications**: Real-time notifications for incidents, check-ins, and safety alerts

### Privacy & Security
- **App Lock**: Secure your app with lock functionality
- **Privacy Controls**: Granular control over location sharing and data visibility
- **Emergency Notes**: Store important emergency information
- **Battery Optimization**: Smart battery-saving modes

### Customization
- **Location Accuracy Settings**: Adjust location update frequency and accuracy
- **Notification Filters**: Customize which notifications you receive
- **Language & Region**: Multi-language support
- **Units**: Metric/Imperial unit preferences
- **Sleep Mode**: Configure quiet hours for notifications

## 🛠 Tech Stack

- **Framework**: React Native with Expo SDK 54
- **Navigation**: React Navigation (Stack & Bottom Tabs)
- **Backend**: Supabase (Authentication, Database, Real-time)
- **Maps**: React Native Maps with Google Maps integration
- **Notifications**: Expo Notifications
- **Location**: Expo Location
- **State Management**: React Context API
- **Language**: TypeScript

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI for builds (`npm install -g eas-cli`)
- iOS Simulator (for iOS development) or Android Studio (for Android development)
- Supabase account and project
- Google Maps API key

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd safezone
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Set up your environment variables using EAS secrets or create a `.env` file (for local development):

```bash
# Required environment variables
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_EXPO_PROJECT_ID=your_expo_project_id
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
EXPO_PUBLIC_DELETE_ACCOUNT_URL=https://safezone.app/delete-account
```

For production builds, set these as EAS secrets:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value your_value
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value your_value
eas secret:create --scope project --name EXPO_PUBLIC_EXPO_PROJECT_ID --value your_value
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value your_value
```

See `EAS_ENV_SETUP.md` and `ENV_SETUP.md` for detailed setup instructions.

### 4. Database Setup

Run the Supabase migrations:

```bash
# Apply migrations in order
cd supabase/migrations
# Run migrations using Supabase CLI or your database management tool
```

See `CHECK_AUTH_SETUP.md` for authentication setup details.

### 5. Run the App

#### Development Mode

```bash
# Start Expo development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on Web
npm run web
```

#### Production Build

```bash
# Build for Android (APK)
npm run build:android:apk

# Build for Android (Production)
npm run build:android

# Build for iOS
npm run build:ios

# Build for all platforms
npm run build:all
```

## 📁 Project Structure

```
safezone/
├── src/
│   ├── components/          # Reusable components
│   │   └── ErrorBoundary.tsx
│   ├── context/             # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── ConnectionContext.tsx
│   │   ├── IncidentContext.tsx
│   │   ├── TravelAdvisoryContext.tsx
│   │   ├── CheckInContext.tsx
│   │   └── AppSettingContext.tsx
│   ├── screens/             # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── MapScreen.tsx
│   │   ├── IncidentFeedScreen.tsx
│   │   ├── ConnectionScreen.tsx
│   │   └── ...
│   ├── services/            # Business logic services
│   │   ├── locationService.ts
│   │   ├── notificationService.ts
│   │   ├── checkInService.ts
│   │   ├── travelAdvisoryService.ts
│   │   └── offlineMapsService.ts
│   ├── lib/                 # Third-party integrations
│   │   └── supabase.ts
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   └── utils/               # Utility functions
│       ├── logger.ts
│       ├── envValidation.ts
│       └── warningSuppression.ts
├── assets/                  # Images, icons, sounds
├── plugins/                 # Expo config plugins
├── scripts/                 # Build and setup scripts
├── supabase/                # Supabase functions and migrations
│   ├── functions/
│   └── migrations/
├── App.tsx                  # Main app entry point
├── app.config.js           # Expo configuration
└── package.json
```

## 🔧 Configuration

### App Configuration

The app configuration is managed in `app.config.js` and includes:
- App name, version, and bundle identifiers
- Platform-specific settings (iOS/Android)
- Plugin configurations
- Environment variable injection

### Build Configuration

Build profiles are defined in `eas.json`:
- **Development**: For testing builds
- **Production**: For app store releases
- **APK**: For direct Android distribution

## 📱 Platform-Specific Setup

### iOS

- Bundle Identifier: `com.safezone.app`
- Requires location permissions configuration in `Info.plist`
- Google Maps API key must be configured

### Android

- Package Name: `com.safezone.app`
- Requires location and network permissions
- Google Maps API key must be configured
- Network security config for API access

## 🔐 Security

- Authentication handled by Supabase
- Row-level security policies in database
- Secure credential storage
- App lock functionality
- Encrypted location data transmission

## 📚 Documentation

Additional documentation files:
- `CHECK_AUTH_SETUP.md` - Authentication setup guide
- `EAS_ENV_SETUP.md` - EAS environment variables setup
- `ENV_SETUP.md` - General environment setup
- `SETUP_CREDENTIALS.md` - Credential configuration
- `FIX_NETWORK_CONNECTION.md` - Network troubleshooting
- `NOTIFICATION_SOUND_SETUP.md` - Notification configuration
- `PUSH_NOTIFICATION_FIX.md` - Push notification troubleshooting
- `PRODUCTION_OPTIMIZATIONS.md` - Production build optimizations

## 🐛 Troubleshooting

### Common Issues

1. **Network Connection Errors**: See `FIX_NETWORK_CONNECTION.md`
2. **Push Notification Issues**: See `PUSH_NOTIFICATION_FIX.md`
3. **Build Failures**: Check EAS secrets are properly configured
4. **Maps Not Loading**: Verify Google Maps API key is set correctly

### Debug Mode

The app includes comprehensive logging. Check console output for detailed error messages.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is private and proprietary.

## 📞 Support

For support, email support@famguard.app or visit the Help & Support section in the app.

## 🔄 Version History

- **1.0.0** - Initial release
  - Core location sharing
  - Incident reporting
  - Connection management
  - Travel advisories
  - Check-in system

---

**Built with ❤️ for keeping families safe**

# famGuard
