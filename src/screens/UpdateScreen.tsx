import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Image,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

interface UpdateScreenProps {
  onUpdate?: () => void;
}

export default function UpdateScreen({ onUpdate }: UpdateScreenProps) {
  const currentVersion = Constants.expoConfig?.version || '1.0.1';
  
  const handleUpdatePress = async () => {
    const appStoreUrl = Platform.select({
      ios: 'https://apps.apple.com/gb/app/famsguard/id6757821633', // Replace with actual App Store ID
      android: 'https://play.google.com/store/apps/details?id=com.famguardacehubtech',
    });

    if (appStoreUrl) {
      const canOpen = await Linking.canOpenURL(appStoreUrl);
      if (canOpen) {
        await Linking.openURL(appStoreUrl);
      } else {
        // Fallback: try to open store app
        const fallbackUrl = Platform.select({
          ios: 'itms-apps://apps.apple.com/app/idYOUR_APP_ID',
          android: 'market://details?id=com.famguardacehubtech',
        });
        if (fallbackUrl) {
          await Linking.openURL(fallbackUrl).catch(() => {
            // If all else fails, open web URL
            Linking.openURL(appStoreUrl);
          });
        }
      }
    }

    if (onUpdate) {
      onUpdate();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* App Icon */}
        <View style={styles.logoContainer}>
          <View style={styles.iconCircle}>
            <Image 
              source={require('../../assets/icon.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Update Icon */}
        <View style={styles.updateIconContainer}>
          <View style={styles.updateIconOuter}>
            <Ionicons name="arrow-down-circle" size={64} color="#FFFFFF" />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Update Required</Text>
        
        {/* Subtitle */}
        <Text style={styles.subtitle}>
          A new version of FamGuard is available
        </Text>

        {/* Message */}
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>
            Please update to the latest version to continue using the app and access new features.
          </Text>
          <Text style={styles.versionText}>
            Current Version: {currentVersion}
          </Text>
        </View>

        {/* Update Button */}
        <TouchableOpacity
          style={styles.updateButton}
          onPress={handleUpdatePress}
          activeOpacity={0.8}
        >
          <Ionicons name="cloud-download-outline" size={24} color="#FFFFFF" />
          <Text style={styles.updateButtonText}>Update Now</Text>
        </TouchableOpacity>

        {/* Info Text */}
        <Text style={styles.infoText}>
          The app will automatically open the {Platform.OS === 'ios' ? 'App Store' : 'Play Store'} for you
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FEE2E2',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  logoImage: {
    width: 80,
    height: 80,
  },
  updateIconContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateIconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  messageContainer: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 40,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 16,
  },
  versionText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 12,
    minWidth: 200,
    ...Platform.select({
      ios: {
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    lineHeight: 18,
  },
});
