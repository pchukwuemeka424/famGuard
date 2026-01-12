import React, { createContext, useState, useContext, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { locationService } from '../services/locationService';
import type { FamilyMember, Location } from '../types';

interface ConnectionContextType {
  connections: FamilyMember[];
  locationSharingEnabled: boolean;
  setLocationSharingEnabled: (enabled: boolean) => Promise<void>;
  loading: boolean;
  refreshConnections: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export const useConnection = (): ConnectionContextType => {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within ConnectionProvider');
  }
  return context;
};

interface ConnectionProviderProps {
  children: ReactNode;
}

export const ConnectionProvider: React.FC<ConnectionProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [connections, setConnections] = useState<FamilyMember[]>([]);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState<boolean>(false);
  const [locationUpdateFrequencyMinutes, setLocationUpdateFrequencyMinutes] = useState<number>(60); // Default 1 hour
  const [loading, setLoading] = useState<boolean>(true);
  const realtimeChannelRef = useRef<any>(null);
  const settingsChannelRef = useRef<any>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isIntentionallyClosingRef = useRef<boolean>(false);
  const subscriptionSetupInProgressRef = useRef<boolean>(false);

  // Load initial connections, settings, and set up real-time subscriptions
  useEffect(() => {
    if (user?.id) {
      loadSettings().then(() => {
        loadConnections().then(() => {
          // Set up real-time subscription after data is loaded
          setupRealtimeSubscription();
        });
      });
      setupSettingsRealtimeSubscription();
    }

    return () => {
      // Cleanup realtime subscriptions
      isIntentionallyClosingRef.current = true;
      subscriptionSetupInProgressRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (realtimeChannelRef.current) {
        try {
          supabase.removeChannel(realtimeChannelRef.current);
        } catch (error) {
          // Silently handle cleanup errors - channel may already be removed
        }
        realtimeChannelRef.current = null;
      }

      if (settingsChannelRef.current) {
        try {
          supabase.removeChannel(settingsChannelRef.current);
        } catch (error) {
          // Silently handle cleanup errors - channel may already be removed
        }
        settingsChannelRef.current = null;
      }
      
      isReconnectingRef.current = false;
    };
  }, [user?.id]);

  // Load settings from database
  const loadSettings = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('location_update_frequency_minutes, location_sharing_enabled')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If settings don't exist, create default settings
        if (error.code === 'PGRST116') {
          await createDefaultSettings();
          setLocationUpdateFrequencyMinutes(60); // Default 1 hour
          setLocationSharingEnabled(false);
        } else {
          console.error('Error loading settings:', error);
          // Use defaults on error
          setLocationUpdateFrequencyMinutes(60);
          setLocationSharingEnabled(false);
        }
      } else if (data) {
        setLocationUpdateFrequencyMinutes(data.location_update_frequency_minutes || 60);
        if (data.location_sharing_enabled !== undefined) {
          setLocationSharingEnabled(data.location_sharing_enabled);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      // Use defaults on error
      setLocationUpdateFrequencyMinutes(60);
      setLocationSharingEnabled(false);
    }
  };

  // Create default settings if they don't exist
  const createDefaultSettings = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          location_update_frequency_minutes: 60, // Default 1 hour
          location_sharing_enabled: false,
          notifications_enabled: true,
          community_reports_enabled: true,
        });

      if (error) {
        console.error('Error creating default settings:', error);
      }
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  // Set up real-time subscription for settings changes
  const setupSettingsRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription if any
    if (settingsChannelRef.current) {
      supabase.removeChannel(settingsChannelRef.current);
      settingsChannelRef.current = null;
    }

    // Subscribe to user_settings table changes
    const channelName = `connection_context_settings:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Settings update detected in ConnectionContext:', payload.eventType);
          const newData = payload.new as any;
          if (newData) {
            if (newData.location_update_frequency_minutes !== undefined) {
              setLocationUpdateFrequencyMinutes(newData.location_update_frequency_minutes || 60);
            }
            if (newData.location_sharing_enabled !== undefined) {
              setLocationSharingEnabled(newData.location_sharing_enabled);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to settings real-time updates in ConnectionContext');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to settings real-time updates');
        }
      });

    settingsChannelRef.current = channel;
  };

  // Handle location sharing toggle and periodic updates
  useEffect(() => {
    if (!user?.id) return;

    let locationWatchSubscription: any = null;
    let locationUpdateInterval: NodeJS.Timeout | null = null;

    const updateConnectionsLocation = async (): Promise<void> => {
      if (!user?.id || !locationSharingEnabled) return;

      try {
        const currentLocation = await locationService.getCurrentLocation();
        if (!currentLocation) return;

        // Check if location update should be blocked (user stationary for 1+ hour within 30m)
        if (locationService.shouldBlockLocationUpdate(currentLocation)) {
          if (__DEV__) {
            console.log('Skipping connection location update - user stationary for 1+ hour');
          }
          return;
        }

        // Get current battery level
        const batteryLevel = await locationService.getBatteryLevel();

        // Update location for all connections where this user is the connected user
        // (i.e., update the location that others see)
        const { error } = await supabase
          .from('connections')
          .update({
            location_latitude: currentLocation.latitude,
            location_longitude: currentLocation.longitude,
            location_address: currentLocation.address || null,
            location_updated_at: new Date().toISOString(),
            battery_level: batteryLevel,
          })
          .eq('connected_user_id', user.id)
          .eq('status', 'connected');

        if (error) {
          console.error('Error updating connection location:', error);
        } else {
          // Notify location service that update was made (for blocking logic)
          locationService.notifyLocationUpdated(currentLocation);
          // Refresh connections to update UI
          await refreshConnections();
        }
      } catch (error) {
        console.error('Error in updateConnectionsLocation:', error);
      }
    };

    if (locationSharingEnabled) {
      // Get initial location
      updateConnectionsLocation();

      // Set up periodic location updates based on user settings
      const updateIntervalMs = locationUpdateFrequencyMinutes * 60 * 1000; // Convert minutes to milliseconds
      locationUpdateInterval = setInterval(() => {
        updateConnectionsLocation();
      }, updateIntervalMs);
    } else {
      // Clear location when sharing is disabled
      supabase
        .from('connections')
        .update({
          location_latitude: null,
          location_longitude: null,
          location_address: null,
          location_updated_at: null,
        })
        .eq('connected_user_id', user.id)
        .eq('status', 'connected')
        .then(() => {
          refreshConnections();
        });
    }

    return () => {
      if (locationUpdateInterval) {
        clearInterval(locationUpdateInterval);
      }
      if (locationWatchSubscription) {
        locationWatchSubscription.remove();
      }
    };
  }, [locationSharingEnabled, locationUpdateFrequencyMinutes, user?.id]);

  const handleSetLocationSharingEnabled = async (enabled: boolean): Promise<void> => {
    if (!user?.id) return;

    try {
      setLocationSharingEnabled(enabled);
      
      // Save to database
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user.id,
            location_sharing_enabled: enabled,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Error saving location sharing setting:', error);
        // Revert on error
        setLocationSharingEnabled(!enabled);
      } else {
        console.log('Location sharing setting saved:', enabled);
      }
      
      // The location update will be handled by the useEffect hook above
      // Just refresh connections to update UI
      await refreshConnections();
    } catch (error) {
      console.error('Error saving location sharing setting:', error);
      // Revert on error
      setLocationSharingEnabled(!enabled);
    }
  };

  const loadConnections = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      setLoading(true);
      await refreshConnections();
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshConnections = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      // Load connections from the connections table
      const { data: connectionsData, error: connectionsError } = await supabase
        .from('connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .order('created_at', { ascending: false });

      if (connectionsError) {
        console.error('Error loading connections:', connectionsError);
        setConnections([]);
        return;
      }

      // Transform connections to FamilyMember format
      const transformedConnections: FamilyMember[] = (connectionsData || []).map((conn) => {
        const hasLocation = conn.location_latitude && conn.location_longitude;
        const locationUpdatedAt = conn.location_updated_at 
          ? new Date(conn.location_updated_at).getTime() 
          : 0;
        const now = Date.now();
        const fiveMinutesAgo = now - (5 * 60 * 1000);
        // Consider online if location was updated within last 5 minutes
        const isOnline = hasLocation && locationUpdatedAt > fiveMinutesAgo;
        const shareLocation = hasLocation || false;

        const lastSeenLocation = hasLocation ? {
          latitude: conn.location_latitude,
          longitude: conn.location_longitude,
          address: conn.location_address || undefined,
        } : undefined;

        return {
          id: conn.id,
          userId: conn.connected_user_id,
          name: conn.connected_user_name,
          relationship: 'Connection',
          phone: conn.connected_user_phone || '',
          photo: conn.connected_user_photo,
          location: hasLocation ? {
            latitude: conn.location_latitude,
            longitude: conn.location_longitude,
            address: conn.location_address || undefined,
          } : {
            latitude: 0,
            longitude: 0,
          },
          lastSeen: conn.location_updated_at || conn.updated_at || conn.created_at,
          isOnline: isOnline,
          shareLocation: shareLocation,
          batteryLevel: conn.battery_level ?? 100, // Get from database or default to 100
          // Enhanced last seen information
          lastSeenLocation: lastSeenLocation,
          lastSeenAddress: conn.location_address || undefined,
        };
      });

      // Filter out the current user
      const filteredConnections = transformedConnections.filter(
        (conn) => conn.userId && conn.userId !== user.id
      );

      setConnections(filteredConnections);
    } catch (error) {
      console.error('Error refreshing connections:', error);
      setConnections([]);
    }
  };

  /**
   * Sets up real-time subscription for connection updates.
   * When changes occur (INSERT, UPDATE, DELETE), automatically refreshes connection data.
   * All screens using useConnection() hook will automatically receive updates through React Context.
   */
  const setupRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Prevent multiple simultaneous subscription attempts
    if (subscriptionSetupInProgressRef.current || isReconnectingRef.current) {
      if (__DEV__) {
        console.log('⚠️ Subscription setup already in progress, skipping...');
      }
      return;
    }

    // Mark that we're setting up a subscription
    subscriptionSetupInProgressRef.current = true;

    // Clear any pending reconnection timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Remove existing subscription
    isIntentionallyClosingRef.current = true;
    if (realtimeChannelRef.current) {
      try {
        supabase.removeChannel(realtimeChannelRef.current);
      } catch (error) {
        console.warn('Error removing existing channel:', error);
      }
      realtimeChannelRef.current = null;
    }
    isIntentionallyClosingRef.current = false;

    // Subscribe to connections table changes with real-time updates
    const channelName = `connections:${user.id}`;
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: true },
          presence: { key: user.id },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Only log in development mode and for significant events
          if (__DEV__ && (payload.eventType === 'INSERT' || payload.eventType === 'DELETE')) {
            console.log('Realtime connection update received:', payload.eventType);
          }
          
          // Handle new connections
          if (payload.eventType === 'INSERT') {
            const newConnection = payload.new;
            if (newConnection.connected_user_id !== user.id) {
              // Refresh data only when new connection is added (not current user)
              refreshConnections().catch((error) => {
                console.error('Error refreshing connections after real-time update:', error);
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const newData = payload.new;
            const oldData = payload.old;

            // Only process changes from other users
            if (newData.connected_user_id === user.id) {
              // Don't refresh for own changes to prevent loops
              return;
            }

            // Check if there's a meaningful change
            const hasLocationChange = 
              newData.location_latitude !== oldData.location_latitude ||
              newData.location_longitude !== oldData.location_longitude;
            const hasStatusChange = newData.status !== oldData.status;

            // Always refresh if there's a meaningful change
            if (hasLocationChange || hasStatusChange) {
              refreshConnections().catch((error) => {
                console.error('Error refreshing connections after real-time update:', error);
              });
            }

          } else if (payload.eventType === 'DELETE') {
            // Connection was removed - always refresh
            refreshConnections().catch((error) => {
              console.error('Error refreshing after connection deletion:', error);
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscriptionSetupInProgressRef.current = false;
          isReconnectingRef.current = false;
          if (__DEV__) {
            console.log('✅ Successfully subscribed to real-time updates for connections');
          }
        } else if (status === 'CHANNEL_ERROR') {
          subscriptionSetupInProgressRef.current = false;
          isReconnectingRef.current = false;
          // Only log error in dev mode to reduce console spam
          if (__DEV__) {
            console.error('❌ Error subscribing to real-time updates for connections');
          }
          // Only reconnect if not intentionally closing and user still exists
          if (!isIntentionallyClosingRef.current && user?.id && !reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              if (!isIntentionallyClosingRef.current && user?.id) {
                isReconnectingRef.current = true;
                if (__DEV__) {
                  console.log('Attempting to reconnect real-time subscription...');
                }
                setupRealtimeSubscription();
              }
            }, 10000); // 10 second delay to prevent rapid reconnection loops
          }
        } else if (status === 'TIMED_OUT') {
          subscriptionSetupInProgressRef.current = false;
          isReconnectingRef.current = false;
          // Only reconnect if not intentionally closing and user still exists
          if (!isIntentionallyClosingRef.current && user?.id && !reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              if (!isIntentionallyClosingRef.current && user?.id) {
                isReconnectingRef.current = true;
                if (__DEV__) {
                  console.log('Real-time subscription timed out, reconnecting...');
                }
                setupRealtimeSubscription();
              }
            }, 5000); // 5 second delay for timeout
          }
        } else if (status === 'CLOSED') {
          subscriptionSetupInProgressRef.current = false;
          // CLOSED status is normal when replacing channels, so we don't auto-reconnect
          // Only reconnect if this was unexpected (channel is null and we're not intentionally closing)
          if (!isIntentionallyClosingRef.current && !isReconnectingRef.current && !reconnectTimeoutRef.current && user?.id) {
            // Check if channel was actually closed unexpectedly (not replaced)
            const wasUnexpectedClose = !realtimeChannelRef.current;
            
            if (wasUnexpectedClose) {
              // Small delay to avoid race conditions
              reconnectTimeoutRef.current = setTimeout(() => {
                reconnectTimeoutRef.current = null;
                // Double-check conditions before reconnecting
                if (!realtimeChannelRef.current && !isIntentionallyClosingRef.current && user?.id) {
                  isReconnectingRef.current = true;
                  if (__DEV__) {
                    console.log('Real-time subscription closed unexpectedly, reconnecting...');
                  }
                  setupRealtimeSubscription();
                }
              }, 3000); // 3 second delay for unexpected closes
            }
          }
        }
      });

    realtimeChannelRef.current = channel;
  };


  return (
    <ConnectionContext.Provider
      value={{
        connections,
        locationSharingEnabled,
        setLocationSharingEnabled: handleSetLocationSharingEnabled,
        loading,
        refreshConnections,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

