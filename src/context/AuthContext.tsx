import React, { createContext, useState, useContext, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
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
          console.warn('Session refresh failed (non-critical, session remains active):', error);
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

      // Load authentication state from AsyncStorage
      const isAuth = await AsyncStorage.getItem('isAuthenticated');
      const userId = await AsyncStorage.getItem('userId');
      const userDataString = await AsyncStorage.getItem('user');

      // If we have stored auth state, restore it
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
            // User doesn't exist in database
            // Only clear if it's a permanent error (not a network issue)
            if (error?.code === 'PGRST116' || error?.code === '42P01') {
              // User truly doesn't exist - clear auth
              console.warn('Stored user not found in database, clearing auth state');
              await clearAuthState();
              return;
            } else {
              // Network or temporary error - keep session, try again later
              console.warn('Temporary error loading user, keeping session:', error);
              // Restore from stored data
              setUser(userData);
              setIsAuthenticated(true);
              return;
            }
          }

          // Update user data from database (in case it changed)
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

          // Set user and authenticated state
          setUser(updatedUserData);
        setIsAuthenticated(true);
          
          // Update stored user data
          await AsyncStorage.setItem('user', JSON.stringify(updatedUserData));
          await AsyncStorage.setItem('userId', userId);
          await AsyncStorage.setItem('isAuthenticated', 'true');
          
          console.log('Persistent login restored for user:', updatedUserData.email);
        } catch (parseError) {
          console.error('Error parsing stored user data:', parseError);
          await clearAuthState();
        }
      }
    } catch (error) {
      console.error('Error loading auth state:', error);
      // On error, try to restore from stored data instead of clearing
      const isAuth = await AsyncStorage.getItem('isAuthenticated');
      const userId = await AsyncStorage.getItem('userId');
      const userDataString = await AsyncStorage.getItem('user');
      
      if (isAuth === 'true' && userId && userDataString) {
        try {
          const userData = JSON.parse(userDataString) as User;
          setUser(userData);
          setIsAuthenticated(true);
          console.log('Restored session from stored data after error');
        } catch (parseError) {
          // Only clear if data is corrupted
          console.error('Corrupted stored data, clearing auth state');
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
      console.error('Error loading last logged in email:', error);
    }
  };

  const clearAuthState = async (): Promise<void> => {
    setIsAuthenticated(false);
    setUser(null);
    await AsyncStorage.removeItem('isAuthenticated');
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('userId');
  };

  const loadUserFromDatabase = async (userId: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error loading user:', error);
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
      }
    } catch (error) {
      console.error('Error in loadUserFromDatabase:', error);
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    try {
      // First, verify user exists in our users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (userError || !userData) {
        throw new Error('User not found');
      }

      // Verify password (in production, use bcrypt or similar)
      // For now, we'll do a simple comparison (NOT SECURE - should hash passwords)
      if (userData.password !== password) {
        throw new Error('Invalid password');
      }

      // Load user data
      await loadUserFromDatabase(userData.id);
      
      // Store email and name for quick login
      await AsyncStorage.setItem('lastLoggedInEmail', email);
      setLastLoggedInEmail(email);
      
      // Get name from userData (already loaded)
      if (userData.name) {
        await AsyncStorage.setItem('lastLoggedInName', userData.name);
        setLastLoggedInName(userData.name);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Login failed');
    }
  };

  const quickLogin = async (email: string): Promise<void> => {
    try {
      // Verify user exists in our users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (userError || !userData) {
        throw new Error('User not found');
      }

      // Load user data without password verification (quick login)
      await loadUserFromDatabase(userData.id);
    } catch (error: any) {
      console.error('Quick login error:', error);
      throw new Error(error.message || 'Quick login failed');
    }
  };

  const signup = async (name: string, email: string, phone: string, password: string): Promise<void> => {
    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create new user (in production, hash the password)
      const userId = Date.now().toString(); // Or use UUID
      
      const { data, error } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: email,
      name: name,
      phone: phone,
          password: password, // In production, hash this password
          is_group_admin: false,
        })
        .select()
        .single();

      if (error) {
        console.error('Signup error:', error);
        throw new Error(error.message || 'Signup failed');
      }

      if (data) {
        // Load user data
        await loadUserFromDatabase(data.id);
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      throw new Error(error.message || 'Signup failed');
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
      locationService.stopLocationSharing();
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
          console.warn('Error updating location sharing status on logout:', dbError);
        }
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
      
      console.log('User logged out successfully - location sharing stopped');
    } catch (error) {
      console.error('Logout error:', error);
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
        completeOnboarding,
        updateUser,
        clearLastLoggedInEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

