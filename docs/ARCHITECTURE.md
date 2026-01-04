# Architecture Documentation

This document describes the architecture and design decisions of the FamGuard (SafeZone) application.

## Overview

FamGuard is a React Native mobile application built with Expo, using Supabase as the backend. The app follows a component-based architecture with context-based state management.

## Technology Stack

### Frontend
- **React Native**: Cross-platform mobile framework
- **Expo SDK 54**: Development platform and tooling
- **TypeScript**: Type-safe JavaScript
- **React Navigation**: Navigation library
- **React Context API**: State management

### Backend
- **Supabase**: Backend-as-a-Service
  - PostgreSQL database
  - Authentication
  - Realtime subscriptions
  - Edge Functions

### Services & APIs
- **Google Maps API**: Maps and location services
- **Expo Location**: Location tracking
- **Expo Notifications**: Push notifications
- **Expo Background Fetch**: Background tasks

## Project Structure

```
safezone/
├── src/
│   ├── components/          # Reusable UI components
│   ├── context/             # State management (React Context)
│   ├── screens/             # Screen components
│   ├── services/            # Business logic & API services
│   ├── tasks/               # Background tasks
│   ├── types/               # TypeScript definitions
│   ├── utils/               # Utility functions
│   └── lib/                 # Third-party library configs
├── assets/                  # Static assets (images, icons)
├── supabase/                # Backend configuration
│   ├── functions/           # Edge Functions
│   └── migrations/         # Database migrations
├── plugins/                 # Expo config plugins
└── scripts/                 # Build & setup scripts
```

## Architecture Patterns

### Component Architecture

The app follows a component-based architecture:

```
App (Root)
├── ErrorBoundary
├── SafeAreaProvider
├── AuthProvider
├── AppSettingProvider
├── ConnectionProvider
├── IncidentProvider
├── TravelAdvisoryProvider
└── CheckInProvider
    └── NavigationContainer
        └── Stack Navigator
            └── Tab Navigator
                └── Screens
```

### State Management

State is managed using React Context API:

1. **Global State** (Context Providers)
   - `AuthContext`: User authentication state
   - `AppSettingContext`: App-wide settings
   - `ConnectionContext`: Family connections
   - `IncidentContext`: Incident data
   - `TravelAdvisoryContext`: Travel advisories
   - `CheckInContext`: Check-in state

2. **Local State** (useState)
   - Component-specific state
   - UI state (modals, forms, etc.)

3. **Server State** (Supabase)
   - Database data
   - Real-time subscriptions
   - Cached data

### Data Flow

```
User Action
    ↓
Screen Component
    ↓
Context Hook / Service
    ↓
Supabase API
    ↓
Database
    ↓
Realtime Update
    ↓
Context Update
    ↓
UI Re-render
```

## Key Components

### Navigation Structure

#### Stack Navigator (Root)
- Authentication screens (Welcome, Login, Signup)
- Main app screens
- Modal screens (Settings, Details, etc.)

#### Tab Navigator (Main App)
- Home (Map view)
- Incidents (Incident feed)
- Connections (Family members)
- Profile (User profile)

### Context Providers

#### AuthContext
- Manages user authentication
- Handles login/logout
- Provides user session
- Manages locked state

#### ConnectionContext
- Manages family connections
- Handles connection invitations
- Tracks location sharing
- Manages connection status

#### IncidentContext
- Fetches incident data
- Manages incident filters
- Handles incident reporting
- Provides proximity detection

#### AppSettingContext
- App-wide settings
- Feature toggles (hide incidents, etc.)
- SOS lock functionality

## Services Layer

Services handle business logic and API interactions:

### LocationService
- Location tracking
- Background location updates
- Location sharing
- Geofencing

### IncidentProximityService
- Detects nearby incidents
- Calculates distances
- Filters by proximity
- Triggers notifications

### CheckInService
- Manual check-ins
- Automatic check-ins
- Check-in scheduling
- Missed check-in alerts

### TravelAdvisoryService
- Fetches travel advisories
- Route risk assessment
- Advisory notifications

### PushNotificationService
- Sends push notifications
- Manages notification tokens
- Handles notification permissions

### OfflineMapsService
- Downloads map tiles
- Manages offline maps
- Map caching

## Background Tasks

### Location Background Task

Runs periodically to update user location:
- Configurable update frequency
- Battery optimization
- Background execution
- Error handling

## Database Schema

### Key Tables

- **users**: User profiles and authentication
- **connections**: Family member connections
- **incidents**: Safety incident reports
- **travel_advisories**: Travel advisory data
- **check_ins**: User check-in records
- **app_settings**: App-wide settings
- **notifications**: Push notification records

### Relationships

```
users
  ├── connections (many-to-many via connections table)
  ├── check_ins (one-to-many)
  ├── app_settings (one-to-one)
  └── notifications (one-to-many)

incidents
  └── (standalone, referenced by location)

travel_advisories
  └── (standalone, referenced by location)
```

## Security Architecture

### Authentication
- Supabase Auth handles authentication
- JWT tokens for API access
- Session management
- Account locking (SOS lock)

### Data Security
- Row Level Security (RLS) in Supabase
- Encrypted data in transit (HTTPS)
- Secure API key storage
- Environment variable protection

### Privacy
- Location data only shared with connections
- User controls data sharing
- Anonymous incident reporting option
- Privacy settings

## Real-time Features

### Supabase Realtime

The app uses Supabase Realtime for:
- Location updates
- Connection status
- New incidents
- Check-in notifications

### Implementation

```typescript
// Subscribe to location updates
supabase
  .channel('locations')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'user_locations'
  }, (payload) => {
    // Handle location update
  })
  .subscribe()
```

## Error Handling

### Error Boundary
- Catches React component errors
- Prevents app crashes
- Shows error UI

### Service Error Handling
- Try-catch blocks in services
- Error logging
- User-friendly error messages
- Fallback behavior

### Network Error Handling
- Retry logic
- Offline detection
- Cached data fallback
- Error notifications

## Performance Optimizations

### Code Splitting
- Lazy loading screens
- Dynamic imports
- Route-based splitting

### Image Optimization
- Appropriate image sizes
- Lazy loading
- Caching

### List Optimization
- FlatList for long lists
- Proper key extraction
- Virtualization

### Memory Management
- Cleanup in useEffect
- Unsubscribe from subscriptions
- Clear timers
- Release resources

## Testing Strategy

### Current State
- Manual testing
- Device testing
- Platform-specific testing

### Future Improvements
- Unit tests (Jest)
- Component tests (React Native Testing Library)
- E2E tests (Detox)
- Integration tests

## Deployment Architecture

### Build Process
1. Code compilation
2. Asset bundling
3. Environment variable injection
4. Platform-specific builds
5. Signing and packaging

### Distribution
- **Development**: Expo Go / Development builds
- **Testing**: Internal distribution (APK/IPA)
- **Production**: App Store / Play Store

## Scalability Considerations

### Database
- Indexed queries
- Efficient data structures
- Pagination for large datasets
- Caching strategies

### API
- Rate limiting
- Request batching
- Efficient queries
- Connection pooling

### Client
- Data pagination
- Lazy loading
- Caching
- Optimistic updates

## Future Architecture Improvements

1. **State Management**
   - Consider Redux or Zustand for complex state
   - Implement proper caching layer

2. **API Layer**
   - Add API client abstraction
   - Implement request/response interceptors
   - Add retry logic

3. **Testing**
   - Add comprehensive test suite
   - Implement CI/CD testing

4. **Monitoring**
   - Add error tracking (Sentry)
   - Performance monitoring
   - Analytics

## Design Decisions

### Why React Context over Redux?
- Simpler for current app size
- Less boilerplate
- Sufficient for current needs
- Can migrate later if needed

### Why Supabase?
- Rapid development
- Built-in authentication
- Real-time capabilities
- PostgreSQL database
- Edge Functions

### Why Expo?
- Faster development
- Over-the-air updates
- Built-in tooling
- Cross-platform support

## Resources

- [React Native Architecture](https://reactnative.dev/docs/architecture-overview)
- [Expo Architecture](https://docs.expo.dev/)
- [Supabase Architecture](https://supabase.com/docs)
- [React Navigation](https://reactnavigation.org/docs/getting-started)

