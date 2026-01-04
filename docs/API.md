# API and Services Documentation

This document describes the API services and business logic layer of the FamGuard (SafeZone) application.

## Overview

The app uses Supabase as the backend API. Services in `src/services/` provide a clean abstraction layer over Supabase operations.

## Supabase Client

### Initialization

Located in `src/lib/supabase.ts`:

```typescript
import { supabase } from '../lib/supabase';
```

### Configuration

- **URL**: From `EXPO_PUBLIC_SUPABASE_URL`
- **Anon Key**: From `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **Auth**: PKCE flow enabled
- **Realtime**: Enabled with event limits

## Services

### Location Service

**File**: `src/services/locationService.ts`

Manages location tracking and sharing.

#### Functions

```typescript
// Start location tracking
startLocationTracking(): Promise<void>

// Stop location tracking
stopLocationTracking(): Promise<void>

// Get current location
getCurrentLocation(): Promise<Location>

// Update user location in database
updateUserLocation(location: Location): Promise<void>

// Get family member locations
getFamilyMemberLocations(): Promise<FamilyMember[]>
```

#### Usage

```typescript
import { locationService } from '../services/locationService';

// Start tracking
await locationService.startLocationTracking();

// Get current location
const location = await locationService.getCurrentLocation();
```

### Incident Proximity Service

**File**: `src/services/incidentProximityService.ts`

Detects nearby incidents and calculates proximity.

#### Functions

```typescript
// Get incidents near location
getNearbyIncidents(
  location: Location,
  radiusKm: number
): Promise<Incident[]>

// Calculate distance to incident
calculateDistance(
  location1: Location,
  location2: Location
): number

// Check if user is near incident
isNearIncident(
  userLocation: Location,
  incident: Incident,
  thresholdKm: number
): boolean
```

#### Usage

```typescript
import { incidentProximityService } from '../services/incidentProximityService';

// Get nearby incidents
const incidents = await incidentProximityService.getNearbyIncidents(
  userLocation,
  5 // 5km radius
);
```

### Check-In Service

**File**: `src/services/checkInService.ts`

Handles check-in functionality.

#### Functions

```typescript
// Create manual check-in
createCheckIn(
  location?: Location,
  message?: string
): Promise<UserCheckIn>

// Get user check-ins
getUserCheckIns(
  limit?: number
): Promise<UserCheckIn[]>

// Get check-in settings
getCheckInSettings(): Promise<CheckInSettings>

// Update check-in settings
updateCheckInSettings(
  settings: Partial<CheckInSettings>
): Promise<CheckInSettings>

// Check for missed check-ins
checkMissedCheckIns(): Promise<UserCheckIn[]>
```

#### Usage

```typescript
import { checkInService } from '../services/checkInService';

// Create check-in
await checkInService.createCheckIn(userLocation, "All safe!");

// Get settings
const settings = await checkInService.getCheckInSettings();
```

### Travel Advisory Service

**File**: `src/services/travelAdvisoryService.ts`

Manages travel advisories and route risk assessment.

#### Functions

```typescript
// Get travel advisories
getTravelAdvisories(
  state?: string,
  region?: string
): Promise<TravelAdvisory[]>

// Get route risk data
getRouteRisk(
  origin: Location,
  destination: Location
): Promise<RouteRiskData>

// Get active advisories for location
getAdvisoriesForLocation(
  location: Location
): Promise<TravelAdvisory[]>
```

#### Usage

```typescript
import { travelAdvisoryService } from '../services/travelAdvisoryService';

// Get advisories
const advisories = await travelAdvisoryService.getTravelAdvisories('Lagos');

// Get route risk
const risk = await travelAdvisoryService.getRouteRisk(origin, destination);
```

### Push Notification Service

**File**: `src/services/pushNotificationService.ts`

Handles push notifications.

#### Functions

```typescript
// Register for push notifications
registerForPushNotifications(): Promise<string | null>

// Get notification token
getNotificationToken(): Promise<string | null>

// Send push notification
sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: any
): Promise<void>

// Handle notification received
handleNotificationReceived(notification: Notification): void
```

#### Usage

```typescript
import { pushNotificationService } from '../services/pushNotificationService';

// Register
const token = await pushNotificationService.registerForPushNotifications();

// Send notification
await pushNotificationService.sendPushNotification(
  userId,
  'Alert',
  'You have a new message'
);
```

### Offline Maps Service

**File**: `src/services/offlineMapsService.ts`

Manages offline map downloads.

#### Functions

```typescript
// Download offline map
downloadOfflineMap(
  name: string,
  center: Location,
  zoomLevel: number
): Promise<OfflineMap>

// Get downloaded maps
getDownloadedMaps(): Promise<OfflineMap[]>

// Delete offline map
deleteOfflineMap(mapId: string): Promise<void>

// Get download progress
getDownloadProgress(mapId: string): Promise<OfflineMapDownloadProgress>
```

#### Usage

```typescript
import { offlineMapsService } from '../services/offlineMapsService';

// Download map
const map = await offlineMapsService.downloadOfflineMap(
  'Lagos',
  { latitude: 6.5244, longitude: 3.3792 },
  12
);
```

## Database Tables

### Users

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo: string | null;
  bloodGroup: string | null;
  emergencyNotes: string | null;
  isGroupAdmin: boolean;
  isLocked?: boolean;
}
```

### Connections

```typescript
interface Connection {
  id: string;
  userId: string;
  connectedUserId: string;
  status: 'connected' | 'blocked';
  location: Location | null;
  locationUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Incidents

```typescript
interface Incident {
  id: string;
  type: string;
  title: string;
  description: string;
  location: Location;
  createdAt: string;
  reporter: IncidentReporter;
  upvotes: number;
  confirmed: boolean;
  category: string;
}
```

### Travel Advisories

```typescript
interface TravelAdvisory {
  id: string;
  state: string;
  region?: string;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  advisoryType: 'security' | 'weather' | 'combined';
  title: string;
  description: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
}
```

### Check-Ins

```typescript
interface UserCheckIn {
  id: string;
  userId: string;
  checkInType: 'manual' | 'automatic' | 'scheduled' | 'emergency';
  location?: Location;
  status: 'safe' | 'unsafe' | 'delayed' | 'missed';
  message?: string;
  createdAt: string;
}
```

## Supabase Edge Functions

### Send Push Notification

**Location**: `supabase/functions/send-push-notification/`

Sends push notifications via Supabase Edge Function.

**Endpoint**: `POST /functions/v1/send-push-notification`

**Request**:
```json
{
  "userId": "user-id",
  "title": "Notification Title",
  "body": "Notification Body",
  "data": {}
}
```

### Cleanup Expired Incidents

**Location**: `supabase/functions/cleanup-expired-incidents/`

Automatically cleans up expired incidents.

**Trigger**: Scheduled (cron job)

## Realtime Subscriptions

### Location Updates

```typescript
const channel = supabase
  .channel('locations')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'user_locations',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // Handle location update
  })
  .subscribe();
```

### New Incidents

```typescript
const channel = supabase
  .channel('incidents')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'incidents'
  }, (payload) => {
    // Handle new incident
  })
  .subscribe();
```

### Connection Updates

```typescript
const channel = supabase
  .channel('connections')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'connections'
  }, (payload) => {
    // Handle connection update
  })
  .subscribe();
```

## Authentication

### Sign Up

```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  options: {
    data: {
      name: 'User Name',
      phone: '+1234567890'
    }
  }
});
```

### Sign In

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});
```

### Sign Out

```typescript
await supabase.auth.signOut();
```

### Get Current User

```typescript
const { data: { user } } = await supabase.auth.getUser();
```

## Error Handling

### Service Error Pattern

```typescript
try {
  const result = await someService.operation();
  return result;
} catch (error) {
  logger.error('Service operation failed:', error);
  throw new Error('Operation failed');
}
```

### Supabase Error Handling

```typescript
const { data, error } = await supabase
  .from('table')
  .select('*');

if (error) {
  logger.error('Database error:', error);
  // Handle error
}
```

## Rate Limiting

Supabase has built-in rate limiting:
- Free tier: 500 requests/second
- Pro tier: Higher limits

## Best Practices

1. **Always handle errors**
   - Use try-catch blocks
   - Check for Supabase errors
   - Provide user feedback

2. **Use TypeScript types**
   - Define interfaces for data
   - Type function parameters
   - Type return values

3. **Cache when appropriate**
   - Cache frequently accessed data
   - Invalidate cache on updates
   - Use React Context for global state

4. **Optimize queries**
   - Select only needed columns
   - Use filters and pagination
   - Index database columns

5. **Handle loading states**
   - Show loading indicators
   - Handle empty states
   - Provide error states

## Resources

- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

