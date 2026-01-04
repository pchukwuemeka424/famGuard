# Features Documentation

This document provides detailed information about all features in the FamGuard (SafeZone) application.

## Core Features

### 1. Real-time Location Sharing

**Description:**
Share your location with family members and view their locations on an interactive map in real-time.

**Key Functionality:**
- Continuous location tracking
- Background location updates
- Real-time location synchronization
- Location history
- Battery-optimized updates

**User Experience:**
- View all family members on map
- See last seen timestamp
- View battery level of connected devices
- See online/offline status

**Technical Details:**
- Uses Expo Location service
- Background task for location updates
- Supabase Realtime for synchronization
- Configurable update frequency

**Settings:**
- Location update frequency
- Location accuracy mode
- Battery saving mode
- Sleep mode (pause during sleep)

### 2. Incident Reporting

**Description:**
Report and view safety incidents in your area with filtering capabilities.

**Key Functionality:**
- Report incidents with location
- Categorize incidents (security, weather, etc.)
- Filter by distance and time
- Upvote/confirm incidents
- Anonymous reporting option

**User Experience:**
- Browse incident feed
- Filter by distance (1km, 5km, 10km, etc.)
- Filter by time (24h, 7d, 30d)
- View incident details
- Report new incidents

**Incident Types:**
- Security incidents
- Weather alerts
- Traffic issues
- General safety concerns

**Technical Details:**
- Stored in Supabase database
- Real-time updates via Realtime
- Proximity detection service
- Push notifications for nearby incidents

### 3. Travel Advisories

**Description:**
Get notified about security and weather advisories for specific regions.

**Key Functionality:**
- View travel advisories by state/region
- Route risk assessment
- Advisory notifications
- Risk level indicators (low, moderate, high, critical)

**User Experience:**
- Browse advisories by location
- Check route risk before travel
- Receive notifications for relevant advisories
- View advisory details and affected areas

**Advisory Types:**
- Security advisories
- Weather advisories
- Combined advisories

**Technical Details:**
- Stored in Supabase database
- Route risk calculation
- Location-based filtering
- Push notification integration

### 4. Check-in System

**Description:**
Manual and automatic check-ins to let family know you're safe.

**Key Functionality:**
- Manual check-ins
- Automatic check-ins during travel
- Scheduled check-ins
- Missed check-in alerts
- Emergency check-ins

**User Experience:**
- Quick check-in button
- Set check-in intervals
- Configure automatic check-ins
- View check-in history
- Receive missed check-in alerts

**Check-in Types:**
- Manual: User-initiated
- Automatic: Based on movement
- Scheduled: Time-based
- Emergency: SOS check-in

**Technical Details:**
- Background task monitoring
- Location-based triggers
- Notification system
- Database tracking

**Settings:**
- Check-in interval
- Auto-check-in enabled
- Travel speed threshold
- Missed check-in alert time

### 5. Offline Maps

**Description:**
Download maps for offline use when traveling.

**Key Functionality:**
- Download map regions
- View downloaded maps
- Manage offline maps
- Download progress tracking

**User Experience:**
- Select area to download
- Choose zoom level
- Monitor download progress
- View downloaded maps offline
- Delete downloaded maps

**Technical Details:**
- Map tile downloading
- Local storage management
- Progress tracking
- Storage optimization

### 6. Push Notifications

**Description:**
Receive alerts for nearby incidents, check-in reminders, and connection updates.

**Key Functionality:**
- Nearby incident alerts
- Check-in reminders
- Connection updates
- Travel advisory notifications
- Emergency alerts

**Notification Types:**
- Incident proximity alerts
- Check-in reminders
- Missed check-in alerts
- New connection requests
- Location sharing updates
- Travel advisory updates

**User Experience:**
- Notification settings screen
- Enable/disable notification types
- Notification history
- Sound and vibration settings

**Technical Details:**
- Expo Notifications
- FCM for Android
- APNs for iOS
- Supabase Edge Functions for sending

## Additional Features

### 7. Connection Management

**Description:**
Connect with family members and manage location sharing permissions.

**Key Functionality:**
- Send connection invitations
- Accept/reject connections
- Block connections
- Manage location sharing
- View connection status

**User Experience:**
- Connection screen
- Invite by phone number
- View pending invitations
- Manage active connections
- Control location sharing per connection

**Technical Details:**
- Invitation system
- Connection status tracking
- Location sharing permissions
- Real-time status updates

### 8. Profile Management

**Description:**
Customize your profile with emergency information and personal details.

**Key Functionality:**
- Edit profile information
- Add emergency notes
- Set blood group
- Upload profile photo
- Manage personal information

**Profile Information:**
- Name
- Email
- Phone number
- Photo
- Blood group
- Emergency notes

**User Experience:**
- Profile screen
- Edit profile screen
- Emergency notes screen
- Photo upload

**Technical Details:**
- Supabase storage for photos
- Profile data in database
- Real-time profile updates

### 9. Emergency Features

**Description:**
SOS lock functionality and emergency notes for first responders.

**Key Functionality:**
- SOS lock (lock account)
- Emergency notes display
- Emergency contact information
- Quick access to emergency features

**SOS Lock:**
- Lock account remotely
- Prevent unauthorized access
- Emergency contact notification
- Location sharing continues

**Emergency Notes:**
- Medical information
- Allergies
- Emergency contacts
- Special instructions

**User Experience:**
- Emergency button
- Locked screen
- Emergency notes screen
- Quick access from lock screen

### 10. Battery Optimization

**Description:**
Configurable location update frequency and battery-saving modes.

**Key Functionality:**
- Adjust location update frequency
- Battery saving mode
- Background task optimization
- Power-aware location updates

**Settings:**
- Location update frequency (1min, 5min, 15min, etc.)
- Battery saving mode toggle
- Background location settings
- Power optimization options

**User Experience:**
- Battery saving screen
- Location frequency settings
- Battery level indicators
- Optimization recommendations

### 11. Sleep Mode

**Description:**
Pause location sharing during sleep hours.

**Key Functionality:**
- Set sleep hours
- Automatic pause/resume
- Custom sleep schedule
- Override option

**User Experience:**
- Sleep mode settings screen
- Set start/end times
- Enable/disable sleep mode
- View sleep schedule

**Technical Details:**
- Time-based location pausing
- Automatic resumption
- Background task awareness

### 12. Privacy Controls

**Description:**
Granular control over location sharing and incident visibility.

**Key Functionality:**
- Control location sharing per connection
- Hide incident feed (if enabled)
- Hide report incident feature (if enabled)
- Privacy settings

**Settings:**
- Location sharing toggle per connection
- Feature visibility settings
- Privacy preferences
- Data sharing controls

**User Experience:**
- Privacy settings in profile
- Per-connection controls
- Feature visibility toggles

### 13. Multi-language Support

**Description:**
Language and region settings for internationalization.

**Key Functionality:**
- Language selection
- Region settings
- Localized content
- Date/time formatting

**User Experience:**
- Language selection screen
- Region settings
- Localized UI elements

### 14. Units Configuration

**Description:**
Choose between metric and imperial units.

**Key Functionality:**
- Unit system selection
- Distance units (km/miles)
- Temperature units (Celsius/Fahrenheit)
- Consistent unit display

**User Experience:**
- Units settings screen
- Toggle between metric/imperial
- Consistent unit display throughout app

### 15. Notifications Management

**Description:**
Comprehensive notification settings and history.

**Key Functionality:**
- Notification preferences
- Notification history
- Notification types management
- Sound and vibration settings

**User Experience:**
- Notifications screen
- Enable/disable notification types
- View notification history
- Configure notification sounds

## Feature Flags

Some features can be hidden via app settings:

- **Hide Report Incident**: Hide the report incident feature
- **Hide Incident Feed**: Hide the incident feed tab
- **SOS Lock**: Enable/disable SOS lock feature

These are controlled via the `app_settings` table in the database.

## User Flows

### Location Sharing Flow

1. User grants location permissions
2. Location tracking starts
3. Location updates sent to database
4. Connected users receive updates via Realtime
5. Map displays all connected users

### Incident Reporting Flow

1. User opens report incident screen
2. Selects incident type and category
3. Adds description and location
4. Optionally makes report anonymous
5. Submits incident
6. Incident appears in feed
7. Nearby users receive notification

### Check-in Flow

1. User enables check-in settings
2. Sets check-in interval
3. Manual check-in or automatic trigger
4. Check-in recorded in database
5. Connected users notified
6. Missed check-in triggers alert

## Future Features

Potential features for future releases:

- Geofencing alerts
- Group messaging
- Emergency SOS button
- Location history timeline
- Weather integration
- Route planning with risk assessment
- Family groups management
- Activity timeline
- Photo sharing
- Voice messages

## Resources

- [User Manual](../assets/manual/) - Screenshots and guides
- [API Documentation](./API.md) - Technical API details
- [Architecture Documentation](./ARCHITECTURE.md) - System architecture

