import React, { createContext, useState, useContext, useEffect, useRef, ReactNode } from 'react';
import { checkInService } from '../services/checkInService';
import { useAuth } from './AuthContext';
import { useConnection } from './ConnectionContext';
import { supabase } from '../lib/supabase';
import type { UserCheckIn, CheckInSettings } from '../types';

interface CheckInContextType {
  settings: CheckInSettings | null;
  lastCheckIn: UserCheckIn | null;
  recentCheckIns: UserCheckIn[];
  connectionCheckIns: Map<string, UserCheckIn>;
  loading: boolean;
  checkIn: (status?: UserCheckIn['status'], message?: string, isEmergency?: boolean) => Promise<boolean>;
  updateSettings: (updates: Partial<CheckInSettings>) => Promise<boolean>;
  refreshCheckIns: () => Promise<void>;
  loadSettings: () => Promise<void>;
  getConnectionCheckIn: (userId: string) => UserCheckIn | undefined;
}

const CheckInContext = createContext<CheckInContextType | undefined>(undefined);

export const useCheckIn = (): CheckInContextType => {
  const context = useContext(CheckInContext);
  if (!context) {
    throw new Error('useCheckIn must be used within CheckInProvider');
  }
  return context;
};

interface CheckInProviderProps {
  children: ReactNode;
}

export const CheckInProvider: React.FC<CheckInProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const { connections } = useConnection();
  const [settings, setSettings] = useState<CheckInSettings | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<UserCheckIn | null>(null);
  const [recentCheckIns, setRecentCheckIns] = useState<UserCheckIn[]>([]);
  const [connectionCheckIns, setConnectionCheckIns] = useState<Map<string, UserCheckIn>>(new Map());
  const [loading, setLoading] = useState<boolean>(false);
  const checkInChannelRef = useRef<any>(null);
  const isIntentionallyClosingRef = useRef<boolean>(false);

  // Initialize check-in service when user is available
  useEffect(() => {
    if (user?.id) {
      checkInService.initialize(user.id);
      loadSettings();
      refreshCheckIns();
      setupRealtimeSubscription();
    }

    return () => {
      checkInService.stop();
      cleanupRealtimeSubscription();
    };
  }, [user?.id]);

  // Set up real-time subscription for check-ins from connections
  const setupRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription
    if (checkInChannelRef.current) {
      isIntentionallyClosingRef.current = true;
      try {
        supabase.removeChannel(checkInChannelRef.current);
      } catch (error) {
        console.warn('Error removing existing check-in channel:', error);
      }
      checkInChannelRef.current = null;
      isIntentionallyClosingRef.current = false;
    }

    // Get all connected user IDs
    const connectedUserIds = connections
      .map((conn) => conn.userId)
      .filter((id): id is string => id !== undefined);

    if (connectedUserIds.length === 0) {
      return; // No connections to monitor
    }

    const channelName = `check_ins:${user.id}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    // Subscribe to each connected user's check-ins separately
    // Supabase doesn't support OR filters, so we need separate subscriptions
    connectedUserIds.forEach((connectedUserId) => {
      // Listen for INSERT events
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_check_ins',
          filter: `user_id=eq.${connectedUserId}`,
        },
        (payload) => {
          if (isIntentionallyClosingRef.current) return;

          const newCheckIn = payload.new;
          const checkIn = mapDbRowToCheckIn(newCheckIn);

          // Only process if it's from a connection (not ourselves)
          if (checkIn.userId !== user.id) {
            // Update connection check-ins map
            setConnectionCheckIns((prev) => {
              const newMap = new Map(prev);
              newMap.set(checkIn.userId, checkIn);
              return newMap;
            });

            // If it's an emergency or unsafe check-in, refresh immediately
            if (checkIn.isEmergency || checkIn.status === 'unsafe') {
              refreshCheckIns();
            }

            if (__DEV__) {
              console.log('Real-time check-in received from connection:', checkIn.userId, checkIn.status);
            }
          }
        }
      );

      // Listen for UPDATE events
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_check_ins',
          filter: `user_id=eq.${connectedUserId}`,
        },
        (payload) => {
          if (isIntentionallyClosingRef.current) return;

          const updatedCheckIn = payload.new;
          const checkIn = mapDbRowToCheckIn(updatedCheckIn);

          // Only process if it's from a connection (not ourselves)
          if (checkIn.userId !== user.id) {
            // Update connection check-ins map
            setConnectionCheckIns((prev) => {
              const newMap = new Map(prev);
              newMap.set(checkIn.userId, checkIn);
              return newMap;
            });

            // If status changed to missed, refresh
            if (checkIn.status === 'missed') {
              refreshCheckIns();
            }

            if (__DEV__) {
              console.log('Real-time check-in update received:', checkIn.userId, checkIn.status);
            }
          }
        }
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (__DEV__) {
          console.log(`✅ Successfully subscribed to check-ins real-time updates for ${connectedUserIds.length} connections`);
        }
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Error subscribing to check-ins real-time updates');
      }
    });

    checkInChannelRef.current = channel;
  };

  // Cleanup real-time subscription
  const cleanupRealtimeSubscription = (): void => {
    isIntentionallyClosingRef.current = true;
    if (checkInChannelRef.current) {
      try {
        supabase.removeChannel(checkInChannelRef.current);
      } catch (error) {
        console.warn('Error removing check-in channel during cleanup:', error);
      }
      checkInChannelRef.current = null;
    }
    isIntentionallyClosingRef.current = false;
  };

  // Re-setup subscription when connections change
  useEffect(() => {
    if (user?.id && connections.length > 0) {
      setupRealtimeSubscription();
    }

    return () => {
      cleanupRealtimeSubscription();
    };
  }, [user?.id, connections.length]);

  // Map database row to UserCheckIn
  const mapDbRowToCheckIn = (row: any): UserCheckIn => {
    return {
      id: row.id,
      userId: row.user_id,
      checkInType: row.check_in_type,
      location: row.location_latitude && row.location_longitude
        ? {
            latitude: row.location_latitude,
            longitude: row.location_longitude,
            address: row.location_address || undefined,
          }
        : undefined,
      status: row.status,
      message: row.message || undefined,
      nextCheckInDueAt: row.next_check_in_due_at || undefined,
      isEmergency: row.is_emergency,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const loadSettings = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const loadedSettings = await checkInService.loadSettings();
      if (loadedSettings) {
        setSettings(loadedSettings);
      } else {
        // If loading failed, try to create default settings
        console.log('Settings not found, attempting to create defaults...');
        const defaultSettings = await checkInService.loadSettings();
        setSettings(defaultSettings);
      }
    } catch (error) {
      console.error('Error loading check-in settings:', error);
      // Don't set loading to false here, let it stay true to show error state
    } finally {
      setLoading(false);
    }
  };

  const refreshCheckIns = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const [last, recent] = await Promise.all([
        checkInService.getLastCheckIn(),
        checkInService.getRecentCheckIns(10),
      ]);
      setLastCheckIn(last);
      setRecentCheckIns(recent);
    } catch (error) {
      console.error('Error refreshing check-ins:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkIn = async (
    status: UserCheckIn['status'] = 'safe',
    message?: string,
    isEmergency: boolean = false
  ): Promise<boolean> => {
    try {
      setLoading(true);
      const newCheckIn = await checkInService.checkIn(status, message, isEmergency);
      if (newCheckIn) {
        setLastCheckIn(newCheckIn);
        setRecentCheckIns([newCheckIn, ...recentCheckIns.slice(0, 9)]);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking in:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<CheckInSettings>): Promise<boolean> => {
    try {
      setLoading(true);
      const success = await checkInService.updateSettings(updates);
      if (success) {
        await loadSettings();
      }
      return success;
    } catch (error) {
      console.error('Error updating settings:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getConnectionCheckIn = (userId: string): UserCheckIn | undefined => {
    return connectionCheckIns.get(userId);
  };

  return (
    <CheckInContext.Provider
      value={{
        settings,
        lastCheckIn,
        recentCheckIns,
        connectionCheckIns,
        loading,
        checkIn,
        updateSettings,
        refreshCheckIns,
        loadSettings,
        getConnectionCheckIn,
      }}
    >
      {children}
    </CheckInContext.Provider>
  );
};

