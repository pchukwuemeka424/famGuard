import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';

const { width, height } = Dimensions.get('window');

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
        {/* Background Gradient Circles */}
        <View style={styles.backgroundCircle1} />
        <View style={styles.backgroundCircle2} />

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
          {/* Logo/Icon */}
          <View style={styles.logoContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={80} color="#007AFF" />
            </View>
          </View>

          {/* App Name */}
          <Text style={styles.appName}>SafeZone</Text>
          <Text style={styles.tagline}>Your Family's Safety Network</Text>

          {/* Description */}
          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>
              Connect with your loved ones, share your location in real-time, and stay informed about safety in your community.
            </Text>
          </View>

          {/* Key Benefits */}
          <View style={styles.benefitsContainer}>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              <Text style={styles.benefitText}>Real-time location sharing</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              <Text style={styles.benefitText}>Community safety alerts</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              <Text style={styles.benefitText}>Secure & private</Text>
            </View>
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
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleLogin}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Already have an account? Login</Text>
          </TouchableOpacity>

          <Text style={styles.footerText}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </Animated.View>
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
    position: 'relative',
  },
  backgroundCircle1: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: (width * 1.2) / 2,
    backgroundColor: '#E3F2FD',
    top: -width * 0.3,
    left: -width * 0.1,
    opacity: 0.5,
  },
  backgroundCircle2: {
    position: 'absolute',
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: (width * 0.8) / 2,
    backgroundColor: '#F0F8FF',
    bottom: height * 0.2,
    right: -width * 0.2,
    opacity: 0.4,
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
    backgroundColor: '#F0F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  appName: {
    fontSize: 42,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 18,
    color: '#8E8E93',
    marginBottom: 32,
    fontWeight: '500',
  },
  descriptionContainer: {
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 16,
    color: '#3A3A3C',
    textAlign: 'center',
    lineHeight: 24,
  },
  benefitsContainer: {
    width: '100%',
    paddingHorizontal: 20,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  benefitText: {
    fontSize: 16,
    color: '#1C1C1E',
    marginLeft: 12,
    fontWeight: '500',
  },
  buttonContainer: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    paddingTop: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
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
    color: '#FFFFFF',
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
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
});

