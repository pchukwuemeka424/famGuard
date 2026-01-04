# Troubleshooting Guide

This guide helps you resolve common issues when developing, building, or running the FamGuard (SafeZone) application.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Development Issues](#development-issues)
- [Build Issues](#build-issues)
- [Runtime Issues](#runtime-issues)
- [Platform-Specific Issues](#platform-specific-issues)
- [API and Backend Issues](#api-and-backend-issues)

## Installation Issues

### Node Modules Installation Fails

**Symptoms:**
- `npm install` fails with errors
- Dependency conflicts
- Permission errors

**Solutions:**

1. **Clear npm cache**
   ```bash
   npm cache clean --force
   ```

2. **Delete and reinstall**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check Node.js version**
   ```bash
   node --version  # Should be v18 or higher
   ```

4. **Use specific npm version**
   ```bash
   npm install --legacy-peer-deps
   ```

### iOS Pod Install Fails

**Symptoms:**
- `pod install` fails in iOS directory
- CocoaPods errors

**Solutions:**

1. **Update CocoaPods**
   ```bash
   sudo gem install cocoapods
   ```

2. **Clear CocoaPods cache**
   ```bash
   pod cache clean --all
   ```

3. **Reinstall pods**
   ```bash
   cd ios
   rm -rf Pods Podfile.lock
   pod install
   cd ..
   ```

4. **Update repo**
   ```bash
   pod repo update
   ```

## Development Issues

### Metro Bundler Won't Start

**Symptoms:**
- `npm start` fails
- Port already in use
- Cache issues

**Solutions:**

1. **Clear Metro cache**
   ```bash
   npm start -- --clear
   ```

2. **Kill process on port**
   ```bash
   # Find process
   lsof -ti:8081
   # Kill process
   kill -9 $(lsof -ti:8081)
   ```

3. **Reset Metro bundler**
   ```bash
   watchman watch-del-all
   rm -rf node_modules
   npm install
   npm start -- --reset-cache
   ```

### Hot Reload Not Working

**Symptoms:**
- Changes not reflecting
- App not updating

**Solutions:**

1. **Restart development server**
   ```bash
   # Stop server (Ctrl+C)
   npm start
   ```

2. **Reload app**
   - Shake device or press Cmd+D (iOS) / Cmd+M (Android)
   - Select "Reload"

3. **Clear cache**
   ```bash
   npm start -- --clear
   ```

### TypeScript Errors

**Symptoms:**
- Type errors in IDE
- Build fails with type errors

**Solutions:**

1. **Check TypeScript version**
   ```bash
   npx tsc --version
   ```

2. **Run type check**
   ```bash
   npx tsc --noEmit
   ```

3. **Restart TypeScript server**
   - In VS Code: Cmd+Shift+P > "TypeScript: Restart TS Server"

4. **Check tsconfig.json**
   - Verify configuration is correct
   - Check for syntax errors

## Build Issues

### Environment Variables Not Loading

**Symptoms:**
- API calls fail
- Supabase connection errors
- Google Maps not loading

**Solutions:**

1. **Check .env file**
   - Verify file exists in root directory
   - Check variable names have `EXPO_PUBLIC_` prefix
   - Ensure no syntax errors

2. **Restart development server**
   ```bash
   # Stop and restart
   npm start
   ```

3. **Clear cache**
   ```bash
   npm start -- --clear
   ```

4. **For EAS builds, check secrets**
   ```bash
   eas secret:list
   ```

### EAS Build Fails

**Symptoms:**
- Build fails in EAS
- Missing credentials
- Configuration errors

**Solutions:**

1. **Check build logs**
   ```bash
   eas build:view [BUILD_ID]
   ```

2. **Verify EAS secrets**
   ```bash
   eas secret:list
   ```

3. **Check app.json and app.config.js**
   - Verify syntax is correct
   - Check for missing required fields

4. **Clear build cache**
   ```bash
   eas build --clear-cache --platform android
   ```

### iOS Build Issues

**Symptoms:**
- Code signing errors
- Provisioning profile issues
- Xcode build failures

**Solutions:**

1. **Check Apple Developer account**
   - Verify account is active
   - Check membership status

2. **Verify bundle identifier**
   - Check `app.json` bundle ID
   - Ensure it matches App Store Connect

3. **Let EAS manage credentials**
   - EAS can auto-manage certificates
   - Or configure manually in Apple Developer Portal

4. **Check Xcode version**
   - Ensure Xcode is up to date
   - Command line tools installed

### Android Build Issues

**Symptoms:**
- Gradle build failures
- Signing errors
- Package name conflicts

**Solutions:**

1. **Check package name**
   - Verify in `app.json`
   - Ensure uniqueness

2. **Check Google Services**
   - Verify `google-services.json` exists
   - Check package name matches

3. **Gradle issues**
   ```bash
   cd android
   ./gradlew clean
   cd ..
   ```

4. **Check Android SDK**
   - Verify SDK is installed
   - Check build tools version

## Runtime Issues

### App Crashes on Startup

**Symptoms:**
- App crashes immediately
- White/black screen
- No error message

**Solutions:**

1. **Check error logs**
   - React Native Debugger
   - Device logs
   - Metro bundler output

2. **Verify environment variables**
   - Check `.env` file
   - Verify all required variables are set

3. **Check dependencies**
   ```bash
   npm install
   ```

4. **Clear app data**
   - Uninstall and reinstall app
   - Clear app cache

### Location Not Working

**Symptoms:**
- Location not updating
- Permission denied
- Location inaccurate

**Solutions:**

1. **Check permissions**
   - Verify location permissions granted
   - Check in device settings

2. **Check location services**
   - Ensure device location is enabled
   - Check GPS signal

3. **Verify configuration**
   - Check `app.json` permissions
   - Verify location service is started

4. **Check background location**
   - Verify background location permission
   - Check battery optimization settings

### Supabase Connection Errors

**Symptoms:**
- API calls fail
- Authentication errors
- Database errors

**Solutions:**

1. **Verify credentials**
   - Check `EXPO_PUBLIC_SUPABASE_URL`
   - Check `EXPO_PUBLIC_SUPABASE_ANON_KEY`

2. **Check Supabase project**
   - Verify project is active
   - Check project status in dashboard

3. **Check network**
   - Verify internet connection
   - Check firewall settings

4. **Review error messages**
   - Check Supabase dashboard logs
   - Review error details

### Google Maps Not Loading

**Symptoms:**
- Maps show blank
- API key errors
- Maps not rendering

**Solutions:**

1. **Verify API key**
   - Check `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
   - Verify key is correct

2. **Check API restrictions**
   - Verify API key restrictions
   - Check package name/bundle ID matches

3. **Enable APIs**
   - Maps SDK for Android
   - Maps SDK for iOS
   - Verify APIs are enabled

4. **Check billing**
   - Verify Google Cloud billing is enabled
   - Check API quotas

### Push Notifications Not Working

**Symptoms:**
- Notifications not received
- Permission denied
- Token not registered

**Solutions:**

1. **Check permissions**
   - Verify notification permission granted
   - Check device notification settings

2. **Check token registration**
   - Verify token is obtained
   - Check token is sent to server

3. **iOS: Check APNs**
   - Verify APNs certificate
   - Check provisioning profile

4. **Android: Check FCM**
   - Verify `google-services.json`
   - Check Firebase project setup

## Platform-Specific Issues

### iOS Issues

#### Simulator Issues

**Solutions:**
- Restart simulator
- Reset simulator: Device > Erase All Content and Settings
- Check Xcode version compatibility

#### Device Issues

**Solutions:**
- Check device iOS version
- Verify provisioning profile
- Check device UDID is registered

### Android Issues

#### Emulator Issues

**Solutions:**
- Restart emulator
- Create new AVD
- Check Android SDK version

#### Device Issues

**Solutions:**
- Enable USB debugging
- Check device Android version
- Verify device drivers installed

## API and Backend Issues

### Database Connection Errors

**Solutions:**
1. Check Supabase project status
2. Verify database is accessible
3. Check RLS policies
4. Review connection string

### Realtime Not Working

**Solutions:**
1. Verify Realtime is enabled
2. Check table replication settings
3. Verify subscription code
4. Check network connectivity

### Edge Functions Errors

**Solutions:**
1. Check function logs in Supabase dashboard
2. Verify function deployment
3. Check function code for errors
4. Review function permissions

## Performance Issues

### Slow App Performance

**Solutions:**
1. Check for memory leaks
2. Optimize images
3. Use FlatList for long lists
4. Profile with React DevTools

### High Battery Usage

**Solutions:**
1. Optimize location update frequency
2. Use battery-saving location mode
3. Reduce background tasks
4. Check for infinite loops

## Getting Help

### Debug Information to Collect

1. **Error messages**
   - Full error text
   - Stack traces

2. **Environment**
   - Node.js version
   - npm version
   - OS version
   - Device/emulator info

3. **Configuration**
   - `app.json` contents
   - Environment variables (sanitized)
   - Build configuration

4. **Logs**
   - Metro bundler output
   - Device logs
   - Build logs

### Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/react-native)

## Common Error Messages

### "Unable to resolve module"

**Solution:**
```bash
rm -rf node_modules
npm install
npm start -- --reset-cache
```

### "Network request failed"

**Solution:**
- Check internet connection
- Verify API endpoints
- Check firewall settings

### "Permission denied"

**Solution:**
- Request permissions properly
- Check device settings
- Verify permission strings in `app.json`

### "Build failed with an exception"

**Solution:**
- Check build logs for specific error
- Verify dependencies
- Check platform-specific configuration

---

If you continue to experience issues, please:
1. Collect debug information
2. Check existing issues
3. Create a new issue with details

