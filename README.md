# FamGuard (SafeZone)

A comprehensive family safety and location sharing mobile application built with React Native and Expo. FamGuard helps families stay connected and informed about each other's safety through real-time location sharing, incident reporting, travel advisories, and emergency features.

## 📱 Features

### Core Features
- **Real-time Location Sharing**: Share your location with family members and view their locations on an interactive map
- **Incident Reporting**: Report and view safety incidents in your area with filtering by distance and time
- **Travel Advisories**: Get notified about security and weather advisories for specific regions
- **Check-in System**: Manual and automatic check-ins to let family know you're safe
- **Offline Maps**: Download maps for offline use when traveling
- **Push Notifications**: Receive alerts for nearby incidents, check-in reminders, and connection updates
- **Emergency Features**: SOS lock functionality and emergency notes for first responders
- **Connection Management**: Connect with family members and manage location sharing permissions

### Additional Features
- **Battery Optimization**: Configurable location update frequency and battery-saving modes
- **Sleep Mode**: Pause location sharing during sleep hours
- **Profile Management**: Customize profile with emergency information, blood group, and notes
- **Multi-language Support**: Language and region settings
- **Units Configuration**: Choose between metric and imperial units
- **Privacy Controls**: Granular control over location sharing and incident visibility

## 🛠 Tech Stack

- **Framework**: React Native with Expo SDK 54
- **Navigation**: React Navigation (Stack & Bottom Tabs)
- **Backend**: Supabase (Authentication, Database, Realtime)
- **Maps**: React Native Maps with Google Maps integration
- **State Management**: React Context API
- **Background Tasks**: Expo Task Manager & Background Fetch
- **Notifications**: Expo Notifications
- **Location Services**: Expo Location
- **Storage**: AsyncStorage
- **Language**: TypeScript

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`) - for building

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd safezone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
   EXPO_PUBLIC_EXPO_PROJECT_ID=your_expo_project_id
   EXPO_PUBLIC_DELETE_ACCOUNT_URL=https://safezone.app/delete-account
   ```

4. **Start development server**
   ```bash
   npm start
   ```

For detailed installation instructions, see [Installation Guide](./docs/INSTALLATION.md).

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) directory:

- **[Installation Guide](./docs/INSTALLATION.md)** - Complete setup instructions
- **[Development Guide](./docs/DEVELOPMENT.md)** - How to develop and contribute
- **[Building Guide](./docs/BUILDING.md)** - Building and deployment instructions
- **[Architecture Documentation](./docs/ARCHITECTURE.md)** - System architecture and design
- **[Configuration Guide](./docs/CONFIGURATION.md)** - Configuration options and settings
- **[API Documentation](./docs/API.md)** - API services and endpoints
- **[Features Documentation](./docs/FEATURES.md)** - Detailed feature descriptions
- **[Troubleshooting Guide](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🏃 Development

### Running the App

```bash
# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on Web
npm run web
```

See [Development Guide](./docs/DEVELOPMENT.md) for more details.

## 🏗 Building

This project uses EAS Build for creating production builds.

```bash
# Build Android APK
npm run build:android:apk

# Build Android Production (AAB)
npm run build:android

# Build iOS Production
npm run build:ios

# Build for both platforms
npm run build:all
```

See [Building Guide](./docs/BUILDING.md) for detailed instructions.

## 📁 Project Structure

```
safezone/
├── docs/                  # Documentation
├── src/
│   ├── components/        # Reusable React components
│   ├── context/           # React Context providers
│   ├── screens/           # Screen components
│   ├── services/          # Business logic and API services
│   ├── tasks/             # Background tasks
│   ├── types/             # TypeScript definitions
│   └── utils/             # Utility functions
├── supabase/              # Backend configuration
│   ├── functions/         # Edge Functions
│   └── migrations/       # Database migrations
├── assets/                # Static assets
└── plugins/               # Expo config plugins
```

See [Architecture Documentation](./docs/ARCHITECTURE.md) for detailed structure.

## 🔧 Configuration

Key configuration files:
- `app.json` - Static Expo configuration
- `app.config.js` - Dynamic configuration
- `eas.json` - EAS Build configuration
- `.env` - Environment variables (not committed)

See [Configuration Guide](./docs/CONFIGURATION.md) for all configuration options.

## 🔐 Security & Privacy

- **Authentication**: Handled by Supabase Auth
- **Location Data**: Encrypted in transit and at rest
- **API Keys**: Stored as EAS secrets, never committed
- **Permissions**: Minimal required permissions
- **Data Privacy**: User data only shared with connected family members

## 📱 Platform Support

- **iOS**: 13.0+
- **Android**: API level 21+ (Android 5.0+)
- **Web**: Supported (limited functionality)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [Development Guide](./docs/DEVELOPMENT.md) for coding standards and best practices.

## 📄 License

This project is private and proprietary. All rights reserved.

## 👥 Support

For support, please contact the development team or open an issue in the repository.

## 🔄 Version History

- **v1.0.1** - Current version
  - Initial release with core features
  - Location sharing
  - Incident reporting
  - Travel advisories
  - Check-in system
  - Offline maps support

## 📚 Additional Resources

- [Google Play Location Declaration](./GOOGLE_PLAY_LOCATION_DECLARATION.md)
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Supabase Documentation](https://supabase.com/docs)

---

**Built with ❤️ by AceHub Technologies Ltd UK**
