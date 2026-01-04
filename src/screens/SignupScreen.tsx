import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';

type SignupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Signup'>;

interface SignupScreenProps {
  navigation: SignupScreenNavigationProp;
}

export default function SignupScreen({ navigation }: SignupScreenProps) {
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const { signup } = useAuth();

  // Format phone number to only allow digits and limit to 11 digits
  const formatPhoneNumber = (text: string): string => {
    // Remove all non-digit characters
    const digitsOnly = text.replace(/\D/g, '');
    // Limit to 11 digits
    return digitsOnly.slice(0, 11);
  };

  const handlePhoneChange = (text: string): void => {
    const formatted = formatPhoneNumber(text);
    setPhone(formatted);
    // Clear error when user starts typing
    if (error && error.includes('phone')) {
      setError('');
    }
  };

  const handleSignup = async (): Promise<void> => {
    if (!name || !email || !phone || !password) {
      setError('Please fill in all fields');
      return;
    }

    // Validate phone number is exactly 11 digits
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length !== 11) {
      setError('Phone number must be exactly 11 digits');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signup(name, email, phone, password);
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {/* Background Blob Shapes */}
            <View style={styles.blobContainer}>
              <View style={[styles.blob, styles.blob1]} />
              <View style={[styles.blob, styles.blob2]} />
              <View style={[styles.blob, styles.blob3]} />
            </View>

            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Sign up to get started with FamGuard</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Full Name</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={22} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your full name"
                    placeholderTextColor="#9CA3AF"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={22} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="call-outline" size={22} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 11-digit phone number"
                    placeholderTextColor="#9CA3AF"
                    value={phone}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    autoCorrect={false}
                    maxLength={11}
                  />
                </View>
                {phone.length > 0 && phone.length !== 11 && (
                  <Text style={styles.helperText}>
                    {phone.length}/11 digits
                  </Text>
                )}
              </View>

              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={22} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeIcon}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color="#6B7280"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity 
                style={[styles.button, loading && styles.buttonDisabled]} 
                onPress={handleSignup}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Creating Account...' : 'Sign Up'}
                </Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('Login')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loginLink}>Sign In</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.companyText}>
                Acehub Technologies Ltd
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DC2626',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 40,
  },
  backButton: {
    marginBottom: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 24,
  },
  form: {
    width: '100%',
  },
  inputWrapper: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 18,
    height: 58,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  inputIcon: {
    marginRight: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '400',
  },
  eyeIcon: {
    padding: 6,
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 10,
    flex: 1,
  },
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  buttonText: {
    color: '#DC2626',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.6,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.1,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
  },
  loginLink: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
  companyText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 24,
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 6,
    marginLeft: 4,
  },
});

