# User Permissions Guide

This document outlines all the permissions users need to grant for the FamGuards app to function properly.

## Location Permissions

### iOS Permissions

**Required for Foreground Location:**
- **"While Using the App"** - Allows location tracking when the app is open
- Permission message shown: *"FamGuards needs your location to share it with family members and show nearby safety incidents."*

**Required for Background Location:**
- **"Always"** - Allows location tracking even when the app is closed or in the background
- Permission message shown: *"FamGuards needs your location to share it with family members even when the app is in the background."*
- Additional message: *"FamGuards needs your location to share it with family members and keep them updated about your safety."*

**How to Grant:**
1. When prompted, tap **"Allow While Using App"** first
2. Then tap **"Change to Always Allow"** when prompted
3. Or go to: **Settings > Privacy & Security > Location Services > FamGuards > Select "Always"**

**Additional iOS Settings:**
- **Background App Refresh**: Enable in Settings > General > Background App Refresh > FamGuards
- **Location Services**: Must be enabled in Settings > Privacy & Security > Location Services

### Android Permissions

**Required for Foreground Location:**
- **"Allow only while using the app"** - Basic location permission
- Permission message shown: *"FamGuards needs your location to share it with family members and show nearby safety incidents."*

**Required for Background Location:**
- **"Allow all the time"** - Background location permission (CRITICAL for background tracking)
- This is a separate permission request that appears after granting foreground permission
- Permission message shown: *"FamGuards needs your location to share it with family members and show nearby safety incidents."*

**How to Grant:**
1. When prompted, tap **"Allow"** for location permission
2. When the background location permission dialog appears, tap **"Allow all the time"**
3. Or go to: **Settings > Apps > FamGuards > Permissions > Location > Select "Allow all the time"**

**Additional Android Settings:**
- **Battery Optimization**: Disable for best results
  - Go to: **Settings > Apps > FamGuards > Battery > Unrestricted**
- **Location Services**: Must be enabled in Settings > Location

## Notification Permissions

### iOS Notifications

**Required:**
- **Allow Notifications** - To receive emergency alerts and safety notifications
- Permission is requested when user enables notifications in app settings

**How to Grant:**
1. When prompted, tap **"Allow"**
2. Or go to: **Settings > Notifications > FamGuards > Enable "Allow Notifications"**

### Android Notifications

**Required:**
- **Show notifications** - To receive emergency alerts and safety notifications
- Permission is automatically requested on Android 13+ devices

**How to Grant:**
1. When prompted, tap **"Allow"**
2. Or go to: **Settings > Apps > FamGuards > Notifications > Enable "Show notifications"**

## Permission Status Messages

### If Location Services Are Disabled

**iOS:**
- Message: *"Location services are disabled. Please enable location services in Settings."*
- Action: Go to Settings > Privacy & Security > Location Services > Enable

**Android:**
- Message: *"Location services are disabled. Please enable location services in your device settings."*
- Action: Go to Settings > Location > Enable

### If Permission Is Denied

**iOS:**
- Message: *"Location permission is permanently denied. Please enable it in Settings > Privacy > Location Services."*
- Action: Go to Settings > Privacy & Security > Location Services > FamGuards > Select "Always"

**Android:**
- Message: *"Location permission is permanently denied. Please enable it in App Settings > Permissions > Location."*
- Action: Go to Settings > Apps > FamGuards > Permissions > Location > Select "Allow all the time"

## Permission Flow

### First Time Setup

1. **User enables location sharing** in the app
2. **Foreground permission** is requested first
   - iOS: "While Using the App" or "Always"
   - Android: "Allow only while using the app"
3. **Background permission** is requested (if needed)
   - iOS: "Always" permission
   - Android: "Allow all the time" permission
4. **Notification permission** is requested when user enables notifications

### Permission Requirements by Feature

| Feature | Foreground Permission | Background Permission | Notification Permission |
|---------|---------------------|---------------------|----------------------|
| View Map | ✅ Required | ❌ Not Required | ❌ Not Required |
| Share Location (Foreground) | ✅ Required | ❌ Not Required | ❌ Not Required |
| Share Location (Background) | ✅ Required | ✅ **Required** | ❌ Not Required |
| Emergency Alerts | ❌ Not Required | ❌ Not Required | ✅ Required |
| Incident Notifications | ❌ Not Required | ❌ Not Required | ✅ Required |
| Check-in Reminders | ❌ Not Required | ❌ Not Required | ✅ Required |

## Troubleshooting

### Location Not Updating in Background

**iOS:**
1. Check Settings > Privacy & Security > Location Services > FamGuards is set to "Always"
2. Check Settings > General > Background App Refresh > FamGuards is enabled
3. Ensure Location Services is enabled globally

**Android:**
1. Check Settings > Apps > FamGuards > Permissions > Location is set to "Allow all the time"
2. Check Settings > Apps > FamGuards > Battery > Set to "Unrestricted"
3. Ensure Location Services is enabled globally

### Notifications Not Working

**iOS:**
1. Check Settings > Notifications > FamGuards > Allow Notifications is enabled
2. Check Do Not Disturb is not blocking notifications

**Android:**
1. Check Settings > Apps > FamGuards > Notifications > Show notifications is enabled
2. Check Do Not Disturb is not blocking notifications

## Important Notes

1. **Background location requires "Always" permission** on both iOS and Android
2. **Android users must select "Allow all the time"** - "While using the app" is not sufficient for background tracking
3. **iOS users must select "Always"** - "While Using the App" is not sufficient for background tracking
4. **Battery optimization** may affect background location on Android - users should disable it for best results
5. **Background App Refresh** must be enabled on iOS for background location to work reliably

## User-Facing Messages

When users deny permissions, they will see helpful messages guiding them to enable permissions in device settings, with options to open Settings directly from the app.
