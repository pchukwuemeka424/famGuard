# Development Guide

This guide covers how to develop and work with the FamGuard (SafeZone) codebase.

## Getting Started

### Starting the Development Server

```bash
npm start
```

This starts the Expo development server. You can then:
- Press `i` to open iOS simulator
- Press `a` to open Android emulator
- Press `w` to open in web browser
- Scan QR code with Expo Go app on your device

### Running on Specific Platforms

```bash
# iOS (macOS only)
npm run ios

# Android
npm run android

# Web
npm run web
```

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo development server |
| `npm run ios` | Run on iOS simulator |
| `npm run android` | Run on Android emulator |
| `npm run web` | Run in web browser |
| `npm run export:embed` | Export embedded assets |

## Project Structure

```
src/
├── components/        # Reusable React components
├── context/          # React Context providers (state management)
├── screens/          # Screen components (UI pages)
├── services/         # Business logic and API services
├── tasks/            # Background tasks
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── lib/              # Library configurations
```

## Code Organization

### Components

Reusable UI components should be placed in `src/components/`.

Example:
```typescript
// src/components/ErrorBoundary.tsx
import React from 'react';

export class ErrorBoundary extends React.Component {
  // Component implementation
}
```

### Screens

Screen components represent full pages in the app. They're located in `src/screens/`.

Example:
```typescript
// src/screens/HomeScreen.tsx
import React from 'react';
import { View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View>
      <Text>Home Screen</Text>
    </View>
  );
}
```

### Context Providers

State management is handled through React Context. Context providers are in `src/context/`.

Available contexts:
- `AuthContext` - Authentication state
- `ConnectionContext` - Family connections
- `IncidentContext` - Incident data
- `AppSettingContext` - App settings
- `TravelAdvisoryContext` - Travel advisories
- `CheckInContext` - Check-in functionality

### Services

Business logic and API interactions are in `src/services/`.

Services:
- `locationService.ts` - Location tracking and sharing
- `incidentProximityService.ts` - Incident proximity detection
- `checkInService.ts` - Check-in functionality
- `travelAdvisoryService.ts` - Travel advisory management
- `pushNotificationService.ts` - Push notifications
- `offlineMapsService.ts` - Offline map management

### Types

TypeScript type definitions are in `src/types/index.ts`.

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Follow the existing code style
- Use TypeScript for type safety
- Add comments for complex logic
- Keep components small and focused

### 3. Test Your Changes

- Test on iOS simulator/device
- Test on Android emulator/device
- Test edge cases and error scenarios

### 4. Commit Changes

```bash
git add .
git commit -m "Description of changes"
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define types for all props and state
- Avoid `any` type - use proper types or `unknown`

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks

### Naming Conventions

- **Components**: PascalCase (e.g., `HomeScreen.tsx`)
- **Functions**: camelCase (e.g., `getUserLocation`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_COUNT`)
- **Types/Interfaces**: PascalCase (e.g., `User`, `Location`)

### File Organization

- One component per file
- Co-locate related files
- Use index files for clean imports

## State Management

### Using Context

```typescript
import { useAuth } from '../context/AuthContext';

function MyComponent() {
  const { user, isAuthenticated } = useAuth();
  
  // Use context values
}
```

### Local State

For component-specific state, use `useState`:

```typescript
const [count, setCount] = useState(0);
```

### Async Operations

Use `useEffect` for side effects:

```typescript
useEffect(() => {
  async function fetchData() {
    const data = await fetchUserData();
    setUserData(data);
  }
  fetchData();
}, []);
```

## API Integration

### Supabase Client

The Supabase client is configured in `src/lib/supabase.ts`.

```typescript
import { supabase } from '../lib/supabase';

// Example: Fetch data
const { data, error } = await supabase
  .from('users')
  .select('*');
```

### Error Handling

Always handle errors:

```typescript
try {
  const result = await someAsyncOperation();
} catch (error) {
  logger.error('Operation failed:', error);
  // Handle error appropriately
}
```

## Navigation

Navigation is handled by React Navigation.

### Stack Navigation

```typescript
import { useNavigation } from '@react-navigation/native';

const navigation = useNavigation();

// Navigate to screen
navigation.navigate('ScreenName', { param: value });
```

### Tab Navigation

Tabs are defined in `App.tsx` in the `MainTabs` component.

## Background Tasks

Background tasks are defined in `src/tasks/`.

### Location Background Task

The location background task runs periodically to update user location.

See `src/tasks/locationBackgroundTask.ts` for implementation.

## Debugging

### React Native Debugger

1. Install React Native Debugger
2. Start the app
3. Open debugger (Cmd+D on iOS, Cmd+M on Android)
4. Select "Debug"

### Console Logging

Use the logger utility:

```typescript
import { logger } from '../utils/logger';

logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### Network Debugging

- Use React Native Debugger's Network tab
- Check Supabase Dashboard for database queries
- Use browser DevTools for web version

## Testing

### Manual Testing Checklist

- [ ] Test on iOS device/simulator
- [ ] Test on Android device/emulator
- [ ] Test with different network conditions
- [ ] Test offline functionality
- [ ] Test error scenarios
- [ ] Test edge cases

### Future: Automated Testing

Consider adding:
- Unit tests with Jest
- Component tests with React Native Testing Library
- E2E tests with Detox

## Performance Optimization

### Image Optimization

- Use appropriate image sizes
- Lazy load images when possible
- Use WebP format when supported

### List Optimization

- Use `FlatList` for long lists
- Implement `keyExtractor` properly
- Use `getItemLayout` when possible

### Memory Management

- Clean up subscriptions in `useEffect` cleanup
- Avoid memory leaks with proper cleanup
- Monitor memory usage in development

## Environment Variables

Environment variables are loaded from `.env` file.

Access in code:
```typescript
import Constants from 'expo-constants';

const apiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_KEY;
```

## Hot Reloading

Expo supports Fast Refresh automatically:
- Save a file to see changes instantly
- State is preserved when possible
- Errors are shown inline

## Common Development Tasks

### Adding a New Screen

1. Create screen component in `src/screens/`
2. Add route to `App.tsx` navigation
3. Add type to `src/types/index.ts` if needed

### Adding a New Service

1. Create service file in `src/services/`
2. Export functions from service
3. Import and use in components/contexts

### Adding a New Context

1. Create context file in `src/context/`
2. Export provider and hook
3. Wrap app in provider in `App.tsx`

## Troubleshooting Development Issues

### Metro Bundler Issues

```bash
# Clear cache and restart
npm start -- --clear
```

### TypeScript Errors

```bash
# Check TypeScript configuration
npx tsc --noEmit
```

### Build Errors

- Check `app.json` and `app.config.js`
- Verify environment variables
- Check platform-specific configurations

## Resources

- [React Native Documentation](https://reactnative.dev/)
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

