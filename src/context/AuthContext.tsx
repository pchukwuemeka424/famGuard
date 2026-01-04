import React, { createContext, useState, useContext, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, hasValidSupabaseConfig } from '../lib/supabase';
import { logger } from '../utils/logger';
import { pushNotificationService } from '../services/pushNotificationService';
import type { User } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  user: User | null;
  loading: boolean;
  lastLoggedInEmail: string | null;
  lastLoggedInName: string | null;
  login: (email: string, password: string) => Promise<void>;
  quickLogin: (email: string) => Promise<void>;
  signup: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  clearLastLoggedInEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastLoggedInEmail, setLastLoggedInEmail] = useState<string | null>(null);
  const [lastLoggedInName, setLastLoggedInName] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Update ref when user changes
  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user?.id]);

  useEffect(() => {
    loadAuthState();
    loadLastLoggedInEmail();
    
    // Set up periodic session refresh to keep session alive
    const sessionRefreshInterval = setInterval(async () => {
      const currentUserId = userIdRef.current;
      if (currentUserId) {
        // Silently refresh user data to keep session active
        try {
          const { data: dbUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentUserId)
            .single();
          
          if (dbUser) {
            // Update stored user data silently
            const updatedUserData: User = {
              id: dbUser.id,
              name: dbUser.name,
              email: dbUser.email,
              phone: dbUser.phone || '',
              photo: dbUser.photo,
              bloodGroup: dbUser.blood_group,
              emergencyNotes: dbUser.emergency_notes,
              isGroupAdmin: dbUser.is_group_admin || false,
              isLocked: dbUser.is_locked || false,
            };
            
            setUser(updatedUserData);
            await AsyncStorage.setItem('user', JSON.stringify(updatedUserData));
            await AsyncStorage.setItem('isAuthenticated', 'true');
            await AsyncStorage.setItem('userId', currentUserId);
          }
        } catch (error) {
          // Silently fail - don't logout on refresh errors
          // Keep session active even if refresh fails
          logger.warn('Session refresh failed (non-critical, session remains active):', error);
        }
      }
    }, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => {
      clearInterval(sessionRefreshInterval);
    };
  }, []);

  // Set up real-time subscription for lock status changes
  useEffect(() => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) return;

    const channel = supabase
      .channel(`user_lock_status:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${currentUserId}`,
        },
        async (payload) => {
          const newData = payload.new as any;
          if (newData) {
            // Reload user from database to get all updated fields
            await loadUserFromDatabase(currentUserId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loadAuthState = async (): Promise<void> => {
    try {
      setLoading(true);
      
      // Load onboarding state
      const onboarding = await AsyncStorage.getItem('hasCompletedOnboarding');
      if (onboarding === 'true') {
        setHasCompletedOnboarding(true);
      }

      // First, check Supabase Auth session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (session && session.user) {
        // We have an active Supabase session
        const userId = session.user.id;
        
        // Load user from database
        const { data: dbUser, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (dbError || !dbUser) {
          // User doesn't exist in database - might need to create profile
          if (dbError?.code === 'PGRST116') {
            // Create user profile from auth metadata
            const { data: newUser, error: createError } = await supabase
              .from('users')
              .insert({
                id: userId,
                email: session.user.email || '',
                name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
                phone: session.user.user_metadata?.phone || '',
                is_group_admin: false,
              })
              .select()
              .single();

            if (createError || !newUser) {
              logger.error('Error creating user profile:', createError?.message || String(createError));
              await clearAuthState();
              return;
            }
            
            await loadUserFromDatabase(newUser.id);
            return;
          } else {
            // Network or temporary error - try to restore from stored data
            logger.warn('Temporary error loading user, checking stored data:', dbError?.message || String(dbError));
            const userDataString = await AsyncStorage.getItem('user');
            if (userDataString) {
              try {
                const userData = JSON.parse(userDataString) as User;
                setUser(userData);
                setIsAuthenticated(true);
                return;
              } catch (parseError) {
                logger.error('Error parsing stored user data:', parseError);
              }
            }
            await clearAuthState();
            return;
          }
        }

        // User exists, load their data
        await loadUserFromDatabase(dbUser.id);
        
        // Automatically register push token if user doesn't exist in user_push_tokens
        registerPushTokenForUser(dbUser.id);
        return;
      }

      // No Supabase session, check stored auth state (legacy support)
      const isAuth = await AsyncStorage.getItem('isAuthenticated');
      const userId = await AsyncStorage.getItem('userId');
      const userDataString = await AsyncStorage.getItem('user');

      if (isAuth === 'true' && userId && userDataString) {
        try {
          const userData = JSON.parse(userDataString) as User;
          
          // Verify user still exists in database
          const { data: dbUser, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

          if (error || !dbUser) {
            if (error?.code === 'PGRST116' || error?.code === '42P01') {
              logger.warn('Stored user not found in database, clearing auth state');
              await clearAuthState();
              return;
            } else {
              // Network error - restore from stored data
              logger.warn('Temporary error loading user, keeping session:', error?.message || String(error));
              setUser(userData);
              setIsAuthenticated(true);
              return;
            }
          }

          // Update user data from database
          const updatedUserData: User = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            phone: dbUser.phone || '',
            photo: dbUser.photo,
            bloodGroup: dbUser.blood_group,
            emergencyNotes: dbUser.emergency_notes,
            isGroupAdmin: dbUser.is_group_admin || false,
            isLocked: dbUser.is_locked || false,
          };

          setUser(updatedUserData);
          setIsAuthenticated(true);
          
          await AsyncStorage.setItem('user', JSON.stringify(updatedUserData));
          await AsyncStorage.setItem('userId', userId);
          await AsyncStorage.setItem('isAuthenticated', 'true');
          
          // Automatically register push token if user doesn't exist in user_push_tokens
          registerPushTokenForUser(userId);
          
          logger.log('Persistent login restored for user:', updatedUserData.email);
        } catch (parseError) {
          logger.error('Error parsing stored user data:', parseError);
          await clearAuthState();
        }
      }
    } catch (error) {
      logger.error('Error loading auth state:', error);
      // Try to restore from stored data
      const isAuth = await AsyncStorage.getItem('isAuthenticated');
      const userId = await AsyncStorage.getItem('userId');
      const userDataString = await AsyncStorage.getItem('user');
      
      if (isAuth === 'true' && userId && userDataString) {
        try {
          const userData = JSON.parse(userDataString) as User;
          setUser(userData);
          setIsAuthenticated(true);
          logger.log('Restored session from stored data after error');
        } catch (parseError) {
          logger.error('Corrupted stored data, clearing auth state');
          await clearAuthState();
        }
      } else {
        await clearAuthState();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLastLoggedInEmail = async (): Promise<void> => {
    try {
      const email = await AsyncStorage.getItem('lastLoggedInEmail');
      const name = await AsyncStorage.getItem('lastLoggedInName');
      if (email) {
        setLastLoggedInEmail(email);
      }
      if (name) {
        setLastLoggedInName(name);
      }
    } catch (error) {
      logger.error('Error loading last logged in email:', error);
    }
  };

  const clearAuthState = async (): Promise<void> => {
    setIsAuthenticated(false);
    setUser(null);
    await AsyncStorage.removeItem('isAuthenticated');
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('userId');
  };

  /**
   * Automatically register push token for a user
   * This ensures the user exists in user_push_tokens table
   */
  const registerPushTokenForUser = async (userId: string): Promise<void> => {
    if (!userId) {
      logger.warn('Cannot register push token: No user ID provided');
      return;
    }

    // Delay slightly to ensure app is fully loaded
    setTimeout(async () => {
      try {
        // Check if user already has a token
        const { data: existingToken, error: checkError } = await supabase
          .from('user_push_tokens')
          .select('user_id, push_token, updated_at')
          .eq('user_id', userId)
          .single();

        if (existingToken && !checkError) {
          logger.log('Push token exists for user:', userId, 'Last updated:', existingToken.updated_at);
          // Still register to update token (in case device changed or token expired)
          logger.log('Updating push token to ensure it\'s current...');
        } else {
          // User doesn't have a token, register them
          logger.log('User not found in user_push_tokens, registering new push token...');
        }
        
        // First, explicitly request permission
        logger.log('🔔 Requesting notification permission for user:', userId);
        const hasPermission = await pushNotificationService.requestPermissionExplicitly();
        
        if (hasPermission) {
          // Permission granted, proceed with registration
          logger.log('✅ Permission granted, initializing push token registration...');
          try {
            await pushNotificationService.initialize(userId);
            logger.log('✅ Push token registered successfully for user:', userId);
            
            // Verify token was saved
            const { data: verifyToken, error: verifyError } = await supabase
              .from('user_push_tokens')
              .select('user_id, platform, device_id')
              .eq('user_id', userId)
              .single();
              
            if (verifyError || !verifyToken) {
              logger.error('❌ CRITICAL: Token registration reported success but token not found in database!', {
                userId,
                verifyError,
              });
            } else {
              logger.log('✅ Verified: Token exists in database for user:', userId, 'Platform:', verifyToken.platform);
            }
          } catch (initError: any) {
            logger.error('❌ Error during push token initialization:', {
              error: initError,
              message: initError?.message,
              userId,
            });
            throw initError;
          }
        } else {
          logger.warn('⚠️ Notification permission not granted, will retry later');
          // Retry after 5 seconds in case user grants permission
          setTimeout(async () => {
            logger.log('🔄 Retrying push token registration after permission delay...');
            const retryPermission = await pushNotificationService.requestPermissionExplicitly();
            if (retryPermission) {
              try {
                await pushNotificationService.initialize(userId);
                logger.log('✅ Push token registered on retry for user:', userId);
              } catch (retryError) {
                logger.error('❌ Retry registration failed:', retryError);
              }
            } else {
              logger.warn('⚠️ Permission still not granted on retry');
            }
          }, 5000);
        }
      } catch (error: any) {
        logger.error('Error in registerPushTokenForUser:', error);
        // Retry once after 3 seconds
        setTimeout(async () => {
          try {
            const hasPermission = await pushNotificationService.requestPermissionExplicitly();
            if (hasPermission) {
              await pushNotificationService.initialize(userId);
            }
          } catch (retryError) {
            logger.error('Push token registration retry failed:', retryError);
          }
        }, 3000);
      }
    }, 1500);
  };

  const loadUserFromDatabase = async (userId: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        logger.error('Error loading user:', error);
        return;
      }

      if (data) {
        const userData: User = {
          id: data.id,
          name: data.name,
          email: data.email,
          phone: data.phone || '',
          photo: data.photo,
          bloodGroup: data.blood_group,
          emergencyNotes: data.emergency_notes,
          isGroupAdmin: data.is_group_admin || false,
          isLocked: data.is_locked || false,
        };

        setUser(userData);
        setIsAuthenticated(true);
        await AsyncStorage.setItem('userId', userId);
        await AsyncStorage.setItem('isAuthenticated', 'true');
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        
        // Automatically register push token if user doesn't exist in user_push_tokens
        registerPushTokenForUser(userId);
      }
    } catch (error) {
      logger.error('Error in loadUserFromDatabase:', error);
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    // Check if Supabase is configured
    if (!hasValidSupabaseConfig) {
      if (__DEV__) {
        throw new Error('App is not configured. Please create a .env file with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.');
      }
      throw new Error('Unable to connect. Please check your internet connection and try again.');
    }

    try {
      // Step 1: Authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) {
        logger.error('Supabase Auth login error:', authError?.message || String(authError));
        if (authError.message?.includes('Invalid login credentials') || authError.message?.includes('invalid')) {
          throw new Error('Invalid email or password');
        }
        if (authError.message?.includes('network') || authError.message?.includes('fetch') || authError.message?.includes('Network request failed')) {
          throw new Error('Network error. Please check your internet connection and try again.');
        }
        throw new Error(authError.message || 'Login failed. Please try again.');
      }

      if (!authData.user) {
        throw new Error('Login failed. No user data received.');
      }

      const userId = authData.user.id;

      // Step 2: Load user data from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        logger.error('Error loading user data:', userError?.message || String(userError));
        // If user doesn't exist in users table, create it from auth metadata
        if (userError?.code === 'PGRST116') {
          // User doesn't exist in users table, create it
          const { data: newUserData, error: createError } = await supabase
            .from('users')
            .insert({
              id: userId,
              email: email,
              name: authData.user.user_metadata?.name || email.split('@')[0],
              phone: authData.user.user_metadata?.phone || '',
              is_group_admin: false,
            })
            .select()
            .single();

          if (createError || !newUserData) {
            throw new Error('Failed to load user profile');
          }
          
          await loadUserFromDatabase(newUserData.id);
          } else {
          if (userError?.message?.includes('network') || userError?.message?.includes('fetch') || userError?.message?.includes('Network request failed')) {
            throw new Error('Network error. Please check your internet connection and try again.');
          }
          throw new Error('Failed to load user profile');
        }
      } else {
        // Load user data
        await loadUserFromDatabase(userData.id);
      }
      
      // Store email and name for quick login
      await AsyncStorage.setItem('lastLoggedInEmail', email);
      setLastLoggedInEmail(email);
      
      if (userData?.name) {
        await AsyncStorage.setItem('lastLoggedInName', userData.name);
        setLastLoggedInName(userData.name);
      }
      
      // Automatically register push token if user doesn't exist in user_push_tokens
      registerPushTokenForUser(userId);
    } catch (error: any) {
      // Don't log if it's a user-friendly error we already threw
      if (!error.message || (!error.message.includes('Network error') && !error.message.includes('Invalid email') && !error.message.includes('Login failed'))) {
        logger.error('Login error:', error?.message || String(error));
      }
      // Provide user-friendly error messages
      if (error.message) {
        throw error;
      }
      throw new Error('Login failed. Please check your internet connection and try again.');
    }
  };

  const quickLogin = async (email: string): Promise<void> => {
    try {
      // Check if there's an existing session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session && session.user) {
        // Use existing session
        const userId = session.user.id;
        await loadUserFromDatabase(userId);
        return;
      }

      // If no session, verify user exists in our users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (userError || !userData) {
        throw new Error('User not found. Please sign in with your password.');
      }

      // Load user data without password verification (quick login)
      // Note: This is less secure but provides convenience
      await loadUserFromDatabase(userData.id);
    } catch (error: any) {
      // Don't log if it's a user-friendly error we already threw
      if (!error.message || (!error.message.includes('Network error') && !error.message.includes('Invalid email') && !error.message.includes('Login failed'))) {
        logger.error('Quick login error:', error?.message || String(error));
      }
      throw new Error(error.message || 'Quick login failed');
    }
  };

  const signup = async (name: string, email: string, phone: string, password: string): Promise<void> => {
    // Check if Supabase is configured
    if (!hasValidSupabaseConfig) {
      if (__DEV__) {
        throw new Error('App is not configured. Please create a .env file with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.');
      }
      throw new Error('Unable to connect. Please check your internet connection and try again.');
    }

    try {
      // Step 1: Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            name: name,
            phone: phone,
          },
        },
      });

      if (authError) {
        logger.error('Supabase Auth signup error:', authError?.message || String(authError));
        // Handle specific error cases
        if (authError.message?.includes('already registered') || 
            authError.message?.includes('already exists') ||
            authError.message?.includes('User already registered')) {
          throw new Error('User with this email already exists');
        }
        if (authError.message?.includes('network') || authError.message?.includes('fetch') || authError.message?.includes('Network request failed')) {
          throw new Error('Network error. Please check your internet connection and try again.');
        }
        throw new Error(authError.message || 'Signup failed. Please try again.');
      }

      if (!authData.user) {
        logger.error('Signup failed: No user returned from auth.signUp');
        throw new Error('Failed to create user account');
      }

      const userId = authData.user.id;
      logger.log('✅ Auth user created:', { userId, email, confirmed: authData.user.email_confirmed_at !== null });

      // Step 2: Wait a moment for database trigger to fire (if it exists)
      // Then check if user profile was created by trigger
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 3: Check if user profile exists (created by trigger or manually)
      let userData;
      
      // Try to get the user profile
      logger.log('🔍 Checking for user profile in public.users table...', { userId });
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // User doesn't exist, create it manually (trigger might not be set up)
        logger.log('⚠️ User profile not found in public.users, creating manually...');
        logger.log('💡 Tip: Install the database trigger from supabase/migrations/20250119000000_sync_auth_users.sql');
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: email,
            name: name,
            phone: phone,
            is_group_admin: false,
          })
          .select()
          .single();

        if (createError) {
          logger.error('❌ Error creating user record:', createError?.message || String(createError));
          if (createError.message?.includes('network') || createError.message?.includes('fetch') || createError.message?.includes('Network request failed')) {
            throw new Error('Network error. Please check your internet connection and try again.');
          }
          if (createError.code === '23505') { // Unique constraint violation
            throw new Error('User with this email already exists');
          }
          throw new Error(createError.message || 'Failed to create user profile');
        }
        logger.log('✅ User profile created manually:', newUser.id);
        userData = newUser;
      } else if (fetchError) {
        logger.error('❌ Error fetching user profile:', fetchError?.message || String(fetchError));
        if (fetchError.message?.includes('network') || fetchError.message?.includes('fetch') || fetchError.message?.includes('Network request failed')) {
          throw new Error('Network error. Please check your internet connection and try again.');
        }
        throw new Error('Failed to load user profile');
      } else {
        logger.log('✅ User profile found (created by trigger):', existingUser.id);
        userData = existingUser;
      }

      // Step 4: Create default user settings if they don't exist
      try {
        const { data: existingSettings } = await supabase
          .from('user_settings')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (!existingSettings) {
          await supabase
            .from('user_settings')
            .insert({
              user_id: userId,
              location_sharing_enabled: false, // Location sharing disabled by default until user enables it
            });
        }
      } catch (settingsError) {
        logger.warn('Error creating user settings (non-critical):', settingsError);
        // Non-critical, continue with signup
      }

      // Step 5: If email confirmation is required, user might not have a session yet
      // Check if we have a session, if not, sign in after signup
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session && authData.user) {
        // Try to sign in immediately (works if email confirmation is disabled)
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });
        
        if (signInError) {
          logger.warn('Could not sign in immediately after signup:', signInError?.message || String(signInError));
          // This is okay if email confirmation is required
        }
      }

      // Step 6: Load user data
      if (userData) {
        await loadUserFromDatabase(userData.id);
        
        // Automatically register push token if user doesn't exist in user_push_tokens
        registerPushTokenForUser(userData.id);
      } else {
        throw new Error('Failed to create user profile');
      }
    } catch (error: any) {
      // Don't log if it's a user-friendly error we already threw
      if (!error.message || (!error.message.includes('Network error') && !error.message.includes('already exists') && !error.message.includes('Failed to'))) {
        logger.error('Signup error:', error?.message || String(error));
      }
      // Provide user-friendly error messages
      if (error.message) {
        throw error;
      }
      throw new Error('Signup failed. Please check your internet connection and try again.');
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Store email and name before clearing auth state for quick login
      const currentEmail = user?.email;
      const currentName = user?.name;
      const currentUserId = user?.id;
      
      // Stop all location services if active
      const { locationService } = await import('../services/locationService');
      await locationService.stopLocationSharing();
      locationService.stopEmergencyLocationTracking();
      locationService.stopSOSLocationTracking();
      
      // Disable location sharing in database and clear location data
      if (currentUserId) {
        try {
          // Disable location sharing in user_settings
          await supabase
            .from('user_settings')
            .update({ location_sharing_enabled: false })
            .eq('user_id', currentUserId);
          
          // Clear location data from connections table
          await supabase
            .from('connections')
            .update({
              location_latitude: null,
              location_longitude: null,
              location_address: null,
              location_updated_at: null,
            })
            .eq('connected_user_id', currentUserId)
            .eq('status', 'connected');
          
          // Set user as offline in family_members if exists
          await supabase
            .from('family_members')
            .update({
              is_online: false,
              share_location: false,
              last_seen: new Date().toISOString(),
            })
            .eq('user_id', currentUserId);
        } catch (dbError) {
          // Log but don't fail logout if database operations fail
          logger.warn('Error updating location sharing status on logout:', dbError?.message || String(dbError));
        }
      }
      
      // Remove push token
      try {
        await pushNotificationService.removePushToken();
      } catch (pushError) {
        logger.warn('Error removing push token:', pushError);
      }
      
      // Clear Supabase session if any
      try {
        await supabase.auth.signOut();
      } catch (supabaseError) {
        // Ignore if not using Supabase Auth
      }
      
      // Clear all auth state
      await clearAuthState();
      
      // Store last logged in email and name for quick login
      if (currentEmail) {
        await AsyncStorage.setItem('lastLoggedInEmail', currentEmail);
        setLastLoggedInEmail(currentEmail);
      }
      if (currentName) {
        await AsyncStorage.setItem('lastLoggedInName', currentName);
        setLastLoggedInName(currentName);
      }
      
      logger.log('User logged out successfully - location sharing stopped');
    } catch (error) {
      logger.error('Logout error:', error);
      // Still clear state even if there's an error
      await clearAuthState();
    }
  };

  const clearLastLoggedInEmail = async (): Promise<void> => {
    await AsyncStorage.removeItem('lastLoggedInEmail');
    await AsyncStorage.removeItem('lastLoggedInName');
    setLastLoggedInEmail(null);
    setLastLoggedInName(null);
  };

  const completeOnboarding = async (): Promise<void> => {
    setHasCompletedOnboarding(true);
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
  };

  const updateUser = async (updates: Partial<User>): Promise<void> => {
    if (!user) return;

    try {
      // Map User type to database columns
      const dbUpdates: any = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.email) dbUpdates.email = updates.email;
      if (updates.phone) dbUpdates.phone = updates.phone;
      if (updates.photo !== undefined) dbUpdates.photo = updates.photo;
      if (updates.bloodGroup !== undefined) dbUpdates.blood_group = updates.bloodGroup;
      if (updates.emergencyNotes !== undefined) dbUpdates.emergency_notes = updates.emergencyNotes;
      if (updates.isGroupAdmin !== undefined) dbUpdates.is_group_admin = updates.isGroupAdmin;

      const { error } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', user.id);

      if (error) {
        console.error('Error updating user:', error);
        throw error;
      }

      // Reload user from database
      await loadUserFromDatabase(user.id);
    } catch (error) {
      console.error('Error in updateUser:', error);
      throw error;
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (!user?.id) {
      throw new Error('No user to delete');
    }

    try {
      const userId = user.id;

      // Stop all location services
      try {
        const { locationService } = await import('../services/locationService');
        await locationService.stopLocationSharing();
        locationService.stopEmergencyLocationTracking();
        locationService.stopSOSLocationTracking();
      } catch (error) {
        console.warn('Error stopping location services:', error);
      }

      // Delete all user-related data in order (respecting foreign key constraints)
      // 1. Delete connections where user is the owner
      await supabase
        .from('connections')
        .delete()
        .eq('user_id', userId);
      
      // 2. Delete connections where user is the connected user
      await supabase
        .from('connections')
        .delete()
        .eq('connected_user_id', userId);

      // 3. Delete connection codes
      await supabase
        .from('connection_codes')
        .delete()
        .eq('user_id', userId);

      // 4. Delete notifications
      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId);

      // 5. Delete location history
      await supabase
        .from('location_history')
        .delete()
        .eq('user_id', userId);

      // 6. Delete incidents created by user
      await supabase
        .from('incidents')
        .delete()
        .eq('user_id', userId);

      // 7. Delete user settings (CASCADE should handle this, but being explicit)
      await supabase
        .from('user_settings')
        .delete()
        .eq('user_id', userId);

      // 8. Delete push tokens
      await supabase
        .from('user_push_tokens')
        .delete()
        .eq('user_id', userId);

      // 9. Delete family member entries
      await supabase
        .from('family_members')
        .delete()
        .eq('user_id', userId);

      // 10. Delete family member requests
      await supabase
        .from('family_member_requests')
        .delete()
        .eq('requester_user_id', userId);

      // 11. Delete user check-ins
      await supabase
        .from('user_check_ins')
        .delete()
        .eq('user_id', userId);

      // 12. Delete check-in settings
      await supabase
        .from('check_in_settings')
        .delete()
        .eq('user_id', userId);

      // 13. Delete travel advisories created by user (if any)
      await supabase
        .from('travel_advisories')
        .delete()
        .eq('created_by_user_id', userId);

      // 14. If user is admin, delete family group and all members (CASCADE will handle members)
      const { data: familyGroups } = await supabase
        .from('family_groups')
        .select('id')
        .eq('admin_id', userId);

      if (familyGroups && familyGroups.length > 0) {
        for (const group of familyGroups) {
          await supabase
            .from('family_groups')
            .delete()
            .eq('id', group.id);
        }
      }

      // 15. Finally, delete the user (this should cascade to user_settings)
      const { error: deleteUserError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (deleteUserError) {
        console.error('Error deleting user:', deleteUserError);
        throw deleteUserError;
      }

      // Clear Supabase session if any
      try {
        await supabase.auth.signOut();
      } catch (supabaseError) {
        // Ignore if not using Supabase Auth
      }

      // Clear all auth state
      await clearAuthState();

      console.log('User account deleted successfully');
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        hasCompletedOnboarding,
        user,
        loading,
        lastLoggedInEmail,
        lastLoggedInName,
        login,
        quickLogin,
        signup,
        logout,
        deleteAccount,
        completeOnboarding,
        updateUser,
        clearLastLoggedInEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

