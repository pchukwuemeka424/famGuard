import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Image,
} from 'react-native';

interface SplashScreenProps {
  onFinish?: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start main animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate loading dots with stagger
    const createDotAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    createDotAnimation(dot1Anim, 0).start();
    createDotAnimation(dot2Anim, 200).start();
    createDotAnimation(dot3Anim, 400).start();

    // Auto finish after minimum display time
    const timer = setTimeout(() => {
      if (onFinish) {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onFinish();
        });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <View style={styles.container}>
      {/* Background Blob Shapes */}
      <View style={styles.blobContainer}>
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />
        <View style={[styles.blob, styles.blob3]} />
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: slideAnim },
            ],
          },
        ]}
      >
        {/* App Icon/Logo */}
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
        <Text style={styles.tagline}>Stay Safe, Stay Connected</Text>
      </Animated.View>

      {/* Loading Indicator */}
      <Animated.View
        style={[
          styles.loadingContainer,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.loadingDot,
            {
              opacity: dot1Anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
              transform: [
                {
                  scale: dot1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.2],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.loadingDot,
            {
              opacity: dot2Anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
              transform: [
                {
                  scale: dot2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.2],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.loadingDot,
            {
              opacity: dot3Anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
              transform: [
                {
                  scale: dot3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.2],
                  }),
                },
              ],
            },
          ]}
        />
      </Animated.View>

      {/* Company Name */}
      <View style={styles.companyContainer}>
        <Text style={styles.companyText}>
          Acehub Technologies Ltd
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  logoImage: {
    width: 100,
    height: 100,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 24,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 8,
    fontWeight: '400',
  },
  loadingContainer: {
    flexDirection: 'row',
    marginTop: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 4,
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
  companyContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  companyText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});

