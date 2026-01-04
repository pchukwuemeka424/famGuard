import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';

type WelcomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Welcome'>;

interface WelcomeScreenProps {
  navigation: WelcomeScreenNavigationProp;
}

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Animate content on mount
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleGetStarted = () => {
    navigation.navigate('Login');
  };

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Background Blob Shapes */}
        <View style={styles.blobContainer}>
          <View style={[styles.blob, styles.blob1]} />
          <View style={[styles.blob, styles.blob2]} />
          <View style={[styles.blob, styles.blob3]} />
        </View>

        {/* Main Content */}
        <Animated.View
          style={[
            styles.mainContent,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          {/* App Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.iconCircle}>
              <Image 
                source={require('../../assets/icon.png')} 
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* App Name */}
          <Text style={styles.appName}>FamGuard</Text>
          <Text style={styles.tagline}>Your Family's Safety Network</Text>

          {/* Simple Description */}
          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>
              Stay connected with your loved ones and keep them safe with real-time location sharing and community safety alerts.
            </Text>
          </View>
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View
          style={[
            styles.buttonContainer,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleGetStarted}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color="#DC2626" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleLogin}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Already have an account? Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => navigation.navigate('UserManual')}
            activeOpacity={0.8}
          >
            <Ionicons name="book-outline" size={18} color="#FFFFFF" />
            <Text style={styles.manualButtonText}>User Manual</Text>
          </TouchableOpacity>

          <Text style={styles.footerText}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
          
          <Text style={styles.companyText}>
            Acehub Technologies Ltd
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DC2626',
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  logoContainer: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  appName: {
    fontSize: 42,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 32,
    fontWeight: '500',
  },
  descriptionContainer: {
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    paddingTop: 20,
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  primaryButtonText: {
    color: '#DC2626',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
    letterSpacing: 0.5,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  manualButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  companyText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  blobContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 50,
    opacity: 0.2,
  },
  blob1: {
    width: 200,
    height: 200,
    backgroundColor: '#F87171',
    top: 50,
    right: -30,
  },
  blob2: {
    width: 180,
    height: 180,
    backgroundColor: '#EF4444',
    bottom: 100,
    left: -20,
  },
  blob3: {
    width: 160,
    height: 160,
    backgroundColor: '#FCA5A5',
    top: '40%',
    right: 40,
  },
});

