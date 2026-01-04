import React, { useState, useEffect } from 'react';
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

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

interface LoginScreenProps {
  navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [quickLoginLoading, setQuickLoginLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showQuickLogin, setShowQuickLogin] = useState<boolean>(false);
  const { login, lastLoggedInEmail, lastLoggedInName } = useAuth();

  // Check if there's a last logged in email when component mounts
  useEffect(() => {
    if (lastLoggedInEmail) {
      setShowQuickLogin(true);
      setEmail(lastLoggedInEmail);
    }
  }, [lastLoggedInEmail]);

  const handleLogin = async (): Promise<void> => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (): Promise<void> => {
    if (!lastLoggedInEmail || !password) {
      setError('Please enter your password');
      return;
    }

    setQuickLoginLoading(true);
    setError('');

    try {
      await login(lastLoggedInEmail, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setQuickLoginLoading(false);
    }
  };


  return (
    <SafeAreaView style={[styles.container, showQuickLogin && styles.quickLoginContainer]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {showQuickLogin && lastLoggedInEmail ? (
            <View style={styles.quickLoginScreen}>
              {/* Background Blob Shapes */}
              <View style={styles.blobContainer}>
                <View style={[styles.blob, styles.blob1]} />
                <View style={[styles.blob, styles.blob2]} />
                <View style={[styles.blob, styles.blob3]} />
              </View>

              {/* Back Button */}
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => {
                  setShowQuickLogin(false);
                  setPassword('');
                  setError('');
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              {/* Main Content */}
              <View style={styles.quickLoginContent}>
                <View style={styles.welcomeBackContainer}>
                  <Text style={styles.welcomeBackText}>
                    Welcome{'\n'}back! {lastLoggedInName && lastLoggedInName}
                  </Text>
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
                      autoFocus={true}
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
                  style={[styles.quickLoginButton, quickLoginLoading && styles.buttonDisabled]} 
                  onPress={handleQuickLogin}
                  disabled={quickLoginLoading || loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.quickLoginButtonText}>
                    {quickLoginLoading ? 'Signing In...' : 'Login'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.forgotPasswordLink}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>

                <Text style={styles.companyText}>
                  Acehub Technologies Ltd
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.content}>
              {/* Background Blob Shapes */}
              <View style={styles.blobContainer}>
                <View style={[styles.blob, styles.blob1]} />
                <View style={[styles.blob, styles.blob2]} />
                <View style={[styles.blob, styles.blob3]} />
              </View>

              <View style={styles.header}>
                <Text style={styles.title}>Welcome</Text>
                <Text style={styles.subtitle}>Sign in to your account to continue</Text>
              </View>

              <View style={styles.form}>
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

                <TouchableOpacity 
                  style={styles.forgotPassword}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {!showQuickLogin && (
                <TouchableOpacity 
                  style={[styles.button, loading && styles.buttonDisabled]} 
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Text>
                </TouchableOpacity>
              )}

              {!showQuickLogin && (
                <>
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.dividerLine} />
                  </View>
                </>
              )}

              <View style={styles.signupContainer}>
                <Text style={styles.signupText}>Don't have an account? </Text>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('Signup')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.companyText}>
                Acehub Technologies Ltd
              </Text>
            </View>
          )}
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
  quickLoginContainer: {
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
    justifyContent: 'center',
  },
  header: {
    marginBottom: 48,
    alignItems: 'center',
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
    textAlign: 'center',
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 32,
    marginTop: -8,
  },
  forgotPasswordText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '400',
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
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
  },
  signupLink: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  quickLoginScreen: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 20 : 40,
    left: 24,
    zIndex: 10,
    padding: 8,
  },
  quickLoginContent: {
    position: 'relative',
    zIndex: 1,
    marginTop: 60,
  },
  welcomeBackContainer: {
    marginBottom: 48,
    alignItems: 'flex-start',
  },
  welcomeBackText: {
    fontSize: 42,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 0,
    letterSpacing: -1,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: -0.3,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  quickLoginButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
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
  quickLoginButtonText: {
    color: '#DC2626',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
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
});

