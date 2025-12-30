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
                <View style={[styles.blob, styles.blobMustard]} />
                <View style={[styles.blob, styles.blobTeal]} />
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
                <Ionicons name="chevron-back" size={24} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Main Content */}
              <View style={styles.quickLoginContent}>
                <View style={styles.welcomeBackContainer}>
                  <Text style={styles.welcomeBackText}>Welcome back!</Text>
                  {lastLoggedInName && (
                    <Text style={styles.userNameText}>{lastLoggedInName}</Text>
                  )}
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.underlineLabel}>Password</Text>
                  <View style={styles.underlineInputContainer}>
                    <TextInput
                      style={styles.underlineInput}
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
                        size={20}
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
              </View>
            </View>
          ) : (
            <View style={styles.content}>
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
    backgroundColor: '#F9FAFB',
  },
  quickLoginContainer: {
    backgroundColor: '#F5F5DC',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
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
    color: '#111827',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
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
    color: '#374151',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 18,
    height: 58,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
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
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '400',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
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
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
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
    color: '#FFFFFF',
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
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    color: '#6B7280',
    fontSize: 15,
  },
  signupLink: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
  quickLoginScreen: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 32,
    justifyContent: 'center',
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
  },
  blobMustard: {
    width: 280,
    height: 280,
    backgroundColor: '#D4A574',
    top: -80,
    left: -80,
    borderRadius: 140,
    transform: [{ scaleX: 1.2 }, { scaleY: 0.9 }],
  },
  blobTeal: {
    width: 320,
    height: 320,
    backgroundColor: '#7FB3B3',
    bottom: -100,
    right: -100,
    borderRadius: 160,
    transform: [{ scaleX: 1.1 }, { scaleY: 0.95 }],
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
    color: '#374151',
    marginBottom: 12,
    letterSpacing: -1,
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#6B7280',
    letterSpacing: -0.3,
  },
  underlineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  underlineInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#374151',
    paddingBottom: 12,
  },
  underlineInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '400',
    paddingVertical: 8,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  quickLoginButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
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
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

