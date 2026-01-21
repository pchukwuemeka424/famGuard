import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  AppState,
  AppStateStatus,
  RefreshControl,
  Linking,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { supabase } from '../lib/supabase';
import { locationService } from '../services/locationService';
import type { MainTabParamList, RootStackParamList, Connection, ConnectionInvitation } from '../types';

type ConnectionScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Connections'>,
  StackNavigationProp<RootStackParamList>
>;

interface ConnectionScreenProps {
  navigation: ConnectionScreenNavigationProp;
}

export default function ConnectionScreen({ navigation }: ConnectionScreenProps) {
  const { user } = useAuth();
  const { locationSharingEnabled } = useConnection();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showInviteByPhoneModal, setShowInviteByPhoneModal] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [sendingInvitation, setSendingInvitation] = useState<boolean>(false);
  const [pendingInvitations, setPendingInvitations] = useState<ConnectionInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showGenerateCodeModal, setShowGenerateCodeModal] = useState<boolean>(false);
  const [showEnterCodeModal, setShowEnterCodeModal] = useState<boolean>(false);
  const [connectionCode, setConnectionCode] = useState<string>('');
  const [codeInput, setCodeInput] = useState<string>('');
  const [generatingCode, setGeneratingCode] = useState<boolean>(false);
  const [connectingByCode, setConnectingByCode] = useState<boolean>(false);
  const phoneInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);
  const connectionsChannelRef = useRef<any>(null);
  const usersChannelRef = useRef<any>(null);
  const invitationsChannelRef = useRef<any>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const updateLocationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const blankScreenReloadAttemptedRef = useRef<boolean>(false);

  // Create a refresh handler that reloads everything
  // Note: This is defined early but will call functions defined later
  // The functions will be available when the callback executes
  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!user?.id) {
      setRefreshing(false);
      setLoading(false);
      return;
    }
    
    console.log('🔄 Refreshing connections...');
    setRefreshing(true);
    setLoading(true); // Also set main loading state
    
    try {
      // Force reload by clearing existing subscriptions first
      if (connectionsChannelRef.current) {
        supabase.removeChannel(connectionsChannelRef.current);
        connectionsChannelRef.current = null;
      }
      if (usersChannelRef.current) {
        supabase.removeChannel(usersChannelRef.current);
        usersChannelRef.current = null;
      }
      if (invitationsChannelRef.current) {
        supabase.removeChannel(invitationsChannelRef.current);
        invitationsChannelRef.current = null;
      }
      
      // Reload connections and invitations in parallel
      await Promise.all([
        loadConnections(),
        loadPendingInvitations(),
      ]);
      
      // Re-establish subscriptions after a small delay to ensure cleanup is complete
      setTimeout(() => {
        setupConnectionsRealtimeSubscription();
        setupInvitationsRealtimeSubscription();
      }, 100);
      
      // Update location if sharing is enabled
      if (locationSharingEnabled) {
        updateConnectionsLocation();
      }
    } catch (error) {
      console.error('❌ Error refreshing connections:', error);
      // Ensure loading state is cleared even on error
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, locationSharingEnabled]);

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        user?.id
      ) {
        // App has come to the foreground - reload connections and re-establish subscriptions
        console.log('App came to foreground, reloading connections...');
        handleRefresh();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user?.id, handleRefresh]);

  // Reload connections when screen comes into focus (e.g., after device unlock)
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        console.log('ConnectionScreen focused, reloading connections...');
        handleRefresh();
      }
    }, [user?.id, handleRefresh])
  );

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    // Initial load
    loadConnections();
    
    // Update location immediately if sharing is enabled, then periodically
    if (locationSharingEnabled) {
      updateConnectionsLocation();
    }
    
    // Update location for connections periodically (only if sharing is enabled)
    updateLocationIntervalRef.current = setInterval(() => {
      if (locationSharingEnabled) {
        updateConnectionsLocation();
      }
    }, 45 * 60 * 1000); // Update every 45 minutes

    // Set up real-time subscriptions for connections
    setupConnectionsRealtimeSubscription();
    loadPendingInvitations();
    setupInvitationsRealtimeSubscription();

    return () => {
      if (updateLocationIntervalRef.current) {
        clearInterval(updateLocationIntervalRef.current);
        updateLocationIntervalRef.current = null;
      }
      // Cleanup real-time subscriptions
      if (connectionsChannelRef.current) {
        supabase.removeChannel(connectionsChannelRef.current);
        connectionsChannelRef.current = null;
      }
      if (usersChannelRef.current) {
        supabase.removeChannel(usersChannelRef.current);
        usersChannelRef.current = null;
      }
      if (invitationsChannelRef.current) {
        supabase.removeChannel(invitationsChannelRef.current);
        invitationsChannelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, locationSharingEnabled]);

  // Safety check: If screen is blank (not loading, no connections, but user exists), reload
  useEffect(() => {
    if (user?.id && !loading && connections.length === 0 && !refreshing && !blankScreenReloadAttemptedRef.current) {
      // Small delay to avoid race conditions, then check again
      const timeoutId = setTimeout(() => {
        if (user?.id && !loading && connections.length === 0 && !blankScreenReloadAttemptedRef.current) {
          console.log('⚠️ Screen appears blank, triggering reload...');
          blankScreenReloadAttemptedRef.current = true;
          handleRefresh().finally(() => {
            // Reset after reload completes
            setTimeout(() => {
              blankScreenReloadAttemptedRef.current = false;
            }, 5000);
          });
        }
      }, 2000); // Increased delay to 2 seconds to avoid race conditions
      
      return () => clearTimeout(timeoutId);
    } else if (connections.length > 0) {
      // Reset flag when connections are loaded
      blankScreenReloadAttemptedRef.current = false;
    }
  }, [user?.id, loading, connections.length, refreshing, handleRefresh]);

  const updateConnectionsLocation = async (): Promise<void> => {
    if (!user?.id || !locationSharingEnabled) return;

    try {
      // Request permissions if needed (important for Android)
      const hasPermission = await locationService.checkPermissions();
      if (!hasPermission) {
        console.warn('Location permission not granted, requesting permission...');
        const permissionResult = await locationService.requestPermissions();
        if (!permissionResult.granted) {
          console.warn('Location permission denied:', permissionResult.message);
          // On Android, show alert if permission is permanently denied
          if (Platform.OS === 'android' && permissionResult.message && !permissionResult.canAskAgain) {
            Alert.alert(
              'Location Permission Required',
              permissionResult.message || 'Location permission is required to share your location with connections.',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Open Settings', 
                  onPress: () => {
                    Linking.openSettings().catch((error) => {
                      console.error('Error opening settings:', error);
                    });
                  }
                },
              ]
            );
          }
          return;
        }
      }

      // Use getCurrentLocation with requestPermissionIfNeeded for Android compatibility
      // This ensures permissions are requested if needed
      const currentLocation = await locationService.getCurrentLocation(true);
      if (!currentLocation) {
        console.warn('Could not get current location - location may not be available');
        // On Android, try using getCurrentLocationFast as fallback
        if (Platform.OS === 'android') {
          const fastLocation = await locationService.getCurrentLocationFast(true, true);
          if (fastLocation) {
            // Always force geocoding to get actual address
            const geocodedAddress = await locationService.getAddressFromCoordinates(
              fastLocation.latitude,
              fastLocation.longitude,
              true // Force geocoding
            );
            const address = geocodedAddress || fastLocation.address || null;
            
            const batteryLevel = await locationService.getBatteryLevel();
            const { error } = await supabase
              .from('connections')
              .update({
                location_latitude: fastLocation.latitude,
                location_longitude: fastLocation.longitude,
                location_address: address,
                location_updated_at: new Date().toISOString(),
                battery_level: batteryLevel,
              })
              .eq('connected_user_id', user.id)
              .eq('status', 'connected')
              .eq('location_sharing_enabled', true); // Only update connections where location sharing is enabled

            if (error) {
              console.error('Error updating connection location (fast mode):', error);
            } else {
              // Notify location service that update was made (for blocking logic)
              locationService.notifyLocationUpdated(fastLocation);
              console.log('Location updated successfully (fast mode) with address:', address ? 'yes' : 'no');
            }
          }
        }
        return;
      }

      // Check if location update should be blocked (user stationary for 1+ hour within 30m)
      if (locationService.shouldBlockLocationUpdate(currentLocation)) {
        if (__DEV__) {
          console.log('Skipping connection location update - user stationary for 1+ hour');
        }
        return;
      }

      // Always force geocoding to get actual address
      const geocodedAddress = await locationService.getAddressFromCoordinates(
        currentLocation.latitude,
        currentLocation.longitude,
        true // Force geocoding
      );
      const address = geocodedAddress || currentLocation.address || null;
      // Update location object with address
      if (address) {
        currentLocation.address = address;
      }

      // Get current battery level
      const batteryLevel = await locationService.getBatteryLevel();

      // Update location for all connections where this user is the connected user
      // (i.e., update the location that others see)
      // Only update connections where location_sharing_enabled is true
      const locationUpdatedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('connections')
        .update({
          location_latitude: currentLocation.latitude,
          location_longitude: currentLocation.longitude,
          location_address: currentLocation.address || null,
          location_updated_at: locationUpdatedAt,
          battery_level: batteryLevel,
        })
        .eq('connected_user_id', user.id)
        .eq('status', 'connected')
        .eq('location_sharing_enabled', true) // Only update connections where location sharing is enabled
        .select('id, user_id'); // Select to verify update succeeded and get user_id for reverse update

      if (error) {
        console.error('Error updating connection location:', error);
        // On Android, log more details for debugging
        if (Platform.OS === 'android') {
          console.error('Android location update error:', {
            errorCode: error.code,
            errorMessage: error.message,
            errorDetails: error.details,
            userId: user.id,
            location: {
              lat: currentLocation.latitude,
              lng: currentLocation.longitude,
            },
          });
        }
      } else {
        const updatedCount = data?.length || 0;
        console.log(`Location updated successfully (${updatedCount} connection(s)):`, {
          lat: currentLocation.latitude.toFixed(6),
          lng: currentLocation.longitude.toFixed(6),
          hasAddress: !!currentLocation.address,
          updatedAt: locationUpdatedAt,
          platform: Platform.OS,
        });
        
        // Verify update on Android
        if (Platform.OS === 'android' && updatedCount === 0) {
          console.warn('⚠️ Location update returned 0 rows - connection may not exist or query failed');
        } else if (updatedCount > 0) {
          // Notify location service that update was made (for blocking logic)
          locationService.notifyLocationUpdated(currentLocation);
          
          // Also update the reverse connections (where this user is the main user)
          // This ensures both sides of the connection have location data
          // We update where user_id = current user.id and connected_user_id = the other user
          // This updates the location that the current user sees for their connections
          try {
            const { error: reverseError } = await supabase
              .from('connections')
              .update({
                location_latitude: currentLocation.latitude,
                location_longitude: currentLocation.longitude,
                location_address: currentLocation.address || null,
                location_updated_at: locationUpdatedAt,
                battery_level: batteryLevel,
              })
              .eq('user_id', user.id)
              .eq('status', 'connected')
              .is('location_latitude', null); // Only update if location is null (initial update)
            
            if (reverseError) {
              console.warn('Warning: Could not update reverse connection location:', reverseError);
            } else {
              console.log('✅ Reverse connection location updated (if needed)');
            }
          } catch (reverseUpdateError) {
            console.warn('Warning: Error updating reverse connection location:', reverseUpdateError);
            // Don't fail the main update if reverse update fails
          }
        }
      }
      // Real-time subscription will automatically update the UI when location is updated
      // No need to manually reload - real-time will handle it
    } catch (error) {
      console.error('Error in updateConnectionsLocation:', error);
      // On Android, log more details for debugging
      if (Platform.OS === 'android' && __DEV__) {
        console.error('Android location update error details:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  };


  const setupConnectionsRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription if any
    if (connectionsChannelRef.current) {
      supabase.removeChannel(connectionsChannelRef.current);
      connectionsChannelRef.current = null;
    }

    // Subscribe to connections table changes
    // Listen for both INSERT/UPDATE/DELETE on connections where user_id matches (user's own connections)
    // and UPDATE events where connected_user_id matches (location updates from connected users)
    const connectionsChannel = supabase
      .channel(`connection_screen_connections:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('Connection change detected:', payload.eventType, payload.new || payload.old);
          
          if (payload.eventType === 'DELETE') {
            console.log('Connection deleted via real-time:', payload.old?.id);
            // Update state directly - remove deleted connection
            setConnections((prev) => prev.filter((conn) => conn.id !== payload.old?.id));
            // Refresh connections to ensure all data is current
            setTimeout(() => {
              loadConnections();
            }, 300);
          } else if (payload.eventType === 'INSERT') {
            console.log('New connection added via real-time:', payload.new?.id);
            // Reload to get full connection data with user details
            loadConnections().then(() => {
              // After loading, automatically update location for the new connection
              // This ensures the connection shows as online with location immediately
              if (locationSharingEnabled) {
                // Small delay to ensure connection is fully loaded
                setTimeout(() => {
                  updateConnectionsLocation();
                }, 500);
              }
            });
          } else if (payload.eventType === 'UPDATE') {
            console.log('Connection updated via real-time:', payload.new?.id);
            // Update state directly for location updates and location sharing settings
            if (payload.new) {
              setConnections((prev) =>
                prev.map((conn) =>
                  conn.id === payload.new.id
                    ? {
                        ...conn,
                        location: payload.new.location_latitude && payload.new.location_longitude
                          ? {
                              latitude: payload.new.location_latitude,
                              longitude: payload.new.location_longitude,
                              address: payload.new.location_address || undefined,
                            }
                          : null,
                        locationUpdatedAt: payload.new.location_updated_at || null,
                        locationSharingEnabled: payload.new.location_sharing_enabled !== undefined 
                          ? payload.new.location_sharing_enabled 
                          : conn.locationSharingEnabled ?? true,
                      }
                    : conn
                )
              );
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'connections',
          filter: `connected_user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Location update detected from connected user via real-time:', payload.new?.id);
          // Update state directly with new location data and location sharing settings
          if (payload.new) {
            setConnections((prev) =>
              prev.map((conn) =>
                conn.connectedUserId === payload.new.connected_user_id
                  ? {
                      ...conn,
                      location: payload.new.location_latitude && payload.new.location_longitude
                        ? {
                            latitude: payload.new.location_latitude,
                            longitude: payload.new.location_longitude,
                            address: payload.new.location_address || undefined,
                          }
                        : null,
                      locationUpdatedAt: payload.new.location_updated_at || null,
                      locationSharingEnabled: payload.new.location_sharing_enabled !== undefined 
                        ? payload.new.location_sharing_enabled 
                        : conn.locationSharingEnabled ?? true,
                    }
                  : conn
              )
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'connections',
          filter: `connected_user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Connection deleted by other user via real-time:', payload.old?.id);
          // When the other user removes their connection to us, update state directly
          // This handles cases where the other user removes the connection from their side
          setConnections((prev) => prev.filter((conn) => conn.connectedUserId !== payload.old?.user_id));
          // Refresh connections to ensure all data is current
          setTimeout(() => {
            loadConnections();
          }, 300);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to connections real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to connections real-time updates');
        }
      });

    connectionsChannelRef.current = connectionsChannel;
  };

  const setupUsersRealtimeSubscription = (connectedUserIds: string[]): void => {
    if (!user?.id || connectedUserIds.length === 0) return;

    // Remove existing subscription if any
    if (usersChannelRef.current) {
      supabase.removeChannel(usersChannelRef.current);
      usersChannelRef.current = null;
    }

    // Subscribe to users table changes (for lock status updates)
    const usersChannel = supabase
      .channel(`connection_screen_users:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=in.(${connectedUserIds.join(',')})`,
        },
        (payload) => {
          console.log('User lock status change detected via real-time:', payload.new?.id);
          // Update lock status directly in connections state
          if (payload.new) {
            setConnections((prev) =>
              prev.map((conn) =>
                conn.connectedUserId === payload.new.id
                  ? { ...conn, isLocked: payload.new.is_locked || false }
                  : conn
              )
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to users real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to users real-time updates');
        }
      });

    usersChannelRef.current = usersChannel;
  };


  const loadPendingInvitations = async (): Promise<void> => {
    if (!user?.id || !user?.phone) return;

    try {
      setLoadingInvitations(true);
      // Normalize user phone for comparison
      const normalizedUserPhone = user.phone.replace(/[\s\-\(\)]/g, '');
      
      // Get all pending invitations and filter by normalized phone
      const { data, error } = await supabase
        .from('connection_invitations')
        .select('*')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading pending invitations:', error);
        return;
      }

      if (data) {
        // Filter by normalized phone number
        const filteredData = data.filter((inv) => {
          if (!inv.invitee_phone) return false;
          const normalizedInviteePhone = inv.invitee_phone.replace(/[\s\-\(\)]/g, '');
          return normalizedInviteePhone === normalizedUserPhone;
        });

        const formattedInvitations: ConnectionInvitation[] = filteredData.map((inv) => ({
          id: inv.id,
          inviterUserId: inv.inviter_user_id,
          inviterName: inv.inviter_name,
          inviterPhone: inv.inviter_phone,
          inviterEmail: inv.inviter_email,
          inviterPhoto: inv.inviter_photo,
          inviteePhone: inv.invitee_phone,
          status: inv.status,
          expiresAt: inv.expires_at,
          acceptedAt: inv.accepted_at,
          createdAt: inv.created_at,
          updatedAt: inv.updated_at,
        }));
        setPendingInvitations(formattedInvitations);
      }
    } catch (error) {
      console.error('Error in loadPendingInvitations:', error);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const setupInvitationsRealtimeSubscription = (): void => {
    if (!user?.id || !user?.phone) return;

    // Remove existing subscription if any
    if (invitationsChannelRef.current) {
      supabase.removeChannel(invitationsChannelRef.current);
      invitationsChannelRef.current = null;
    }

    // Subscribe to connection_invitations table changes
    // Note: We subscribe to all invitations and filter by normalized phone in the handler
    // because Supabase real-time filters don't support complex phone number matching
    const invitationsChannel = supabase
      .channel(`connection_screen_invitations:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_invitations',
        },
        async (payload) => {
          const newInvitation = payload.new;
          if (!newInvitation) return;

          // Normalize phone numbers for comparison
          const normalizedUserPhone = user.phone?.replace(/\D/g, '') || '';
          const normalizedInviteePhone = newInvitation.invitee_phone?.replace(/\D/g, '') || '';

          // Check if this invitation is for the current user
          if (normalizedInviteePhone === normalizedUserPhone && newInvitation.status === 'pending') {
            console.log('New invitation received for current user:', newInvitation.id);
            
            // Check if notification was already sent to prevent duplicates
            // Check if a notification already exists for this invitation (created within last 5 seconds)
            const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
            const { data: existingNotification } = await supabase
              .from('notifications')
              .select('id, created_at')
              .eq('user_id', user.id)
              .eq('type', 'connection_added')
              .eq('title', 'Connection Invitation')
              .contains('data', { 
                type: 'connection_invitation',
                inviterUserId: newInvitation.inviter_user_id 
              })
              .gte('created_at', fiveSecondsAgo)
              .limit(1)
              .maybeSingle();

            // Notifications removed - invitation data is still tracked
            
            // Update invitations state directly from real-time payload
            const formattedInvitation: ConnectionInvitation = {
              id: newInvitation.id,
              inviterUserId: newInvitation.inviter_user_id,
              inviterName: newInvitation.inviter_name,
              inviterPhone: newInvitation.inviter_phone,
              inviterEmail: newInvitation.inviter_email,
              inviterPhoto: newInvitation.inviter_photo,
              inviteePhone: newInvitation.invitee_phone,
              status: newInvitation.status,
              expiresAt: newInvitation.expires_at,
              acceptedAt: newInvitation.accepted_at,
              createdAt: newInvitation.created_at,
              updatedAt: newInvitation.updated_at,
            };
            setPendingInvitations((prev) => [formattedInvitation, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'connection_invitations',
        },
        (payload) => {
          const updatedInvitation = payload.new;
          const oldInvitation = payload.old;
          if (!updatedInvitation) return;

          // Normalize phone numbers for comparison
          const normalizedUserPhone = user.phone?.replace(/\D/g, '') || '';
          const normalizedInviteePhone = updatedInvitation.invitee_phone?.replace(/\D/g, '') || '';

          // Check if this invitation is for the current user or sent by the current user
          if (normalizedInviteePhone === normalizedUserPhone || updatedInvitation.inviter_user_id === user.id) {
            console.log('Invitation update detected:', payload.eventType);
            
            // If invitation was accepted, connection will be created and real-time will handle it
            if (updatedInvitation.status === 'accepted' && oldInvitation?.status === 'pending') {
              console.log('Invitation accepted via real-time, connection will be created automatically');
              // Real-time subscription for connections will automatically update when connection is created
            }
            
            // Update invitations state directly from real-time payload
            if (updatedInvitation.status === 'rejected' || updatedInvitation.status === 'accepted') {
              // Remove from pending invitations
              setPendingInvitations((prev) => prev.filter((inv) => inv.id !== updatedInvitation.id));
            } else if (updatedInvitation.status === 'pending') {
              // Update existing invitation or add if new
              const formattedInvitation: ConnectionInvitation = {
                id: updatedInvitation.id,
                inviterUserId: updatedInvitation.inviter_user_id,
                inviterName: updatedInvitation.inviter_name,
                inviterPhone: updatedInvitation.inviter_phone,
                inviterEmail: updatedInvitation.inviter_email,
                inviterPhoto: updatedInvitation.inviter_photo,
                inviteePhone: updatedInvitation.invitee_phone,
                status: updatedInvitation.status,
                expiresAt: updatedInvitation.expires_at,
                acceptedAt: updatedInvitation.accepted_at,
                createdAt: updatedInvitation.created_at,
                updatedAt: updatedInvitation.updated_at,
              };
              setPendingInvitations((prev) => {
                const existingIndex = prev.findIndex((inv) => inv.id === formattedInvitation.id);
                if (existingIndex >= 0) {
                  const updated = [...prev];
                  updated[existingIndex] = formattedInvitation;
                  return updated;
                }
                return [formattedInvitation, ...prev];
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'connection_invitations',
        },
        (payload) => {
          const deletedInvitation = payload.old;
          if (!deletedInvitation) return;

          // Normalize phone numbers for comparison
          const normalizedUserPhone = user.phone?.replace(/\D/g, '') || '';
          const normalizedInviteePhone = deletedInvitation.invitee_phone?.replace(/\D/g, '') || '';

          // Check if this invitation was for the current user or sent by the current user
          if (normalizedInviteePhone === normalizedUserPhone || deletedInvitation.inviter_user_id === user.id) {
            console.log('Invitation deleted via real-time:', deletedInvitation.id);
            // Update state directly - remove deleted invitation
            setPendingInvitations((prev) => prev.filter((inv) => inv.id !== deletedInvitation.id));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to invitations real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to invitations real-time updates');
        }
      });

    invitationsChannelRef.current = invitationsChannel;
  };

  const formatPhoneNumber = (text: string): string => {
    // Remove all non-digit characters
    const digitsOnly = text.replace(/\D/g, '');
    
    // Limit to 11 digits
    if (digitsOnly.length > 11) {
      return digitsOnly.slice(0, 11);
    }
    
    return digitsOnly;
  };

  const sendInvitationByPhone = async (): Promise<void> => {
    if (!user?.id || !phoneInput.trim()) {
      Alert.alert('Invalid Input', 'Please enter a phone number.');
      return;
    }

    // Normalize phone number (remove all non-digit characters)
    const normalizedPhone = phoneInput.replace(/\D/g, '');

    if (normalizedPhone.length !== 11) {
      Alert.alert('Invalid Phone', 'Please enter an 11-digit phone number.');
      return;
    }

    // Check if trying to invite self
    if (user.phone && normalizedPhone === user.phone.replace(/[\s\-\(\)]/g, '')) {
      Alert.alert('Invalid Phone', 'You cannot invite yourself.');
      setPhoneInput('');
      return;
    }

    try {
      setSendingInvitation(true);

      // Check if phone number exists in users table
      // Try exact match first, then try with different formats
      let existingUser = null;
      let userError = null;

      // Try exact match
      const { data: exactMatch, error: exactError } = await supabase
        .from('users')
        .select('id, name, email, phone')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (exactMatch) {
        existingUser = exactMatch;
      } else if (exactError && exactError.code !== 'PGRST116') {
        userError = exactError;
      } else {
        // Try with common formats (with spaces, dashes, etc.)
        const formats = [
          normalizedPhone,
          normalizedPhone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'),
          normalizedPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'),
          normalizedPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'),
        ];

        for (const format of formats) {
          const { data: formatMatch } = await supabase
            .from('users')
            .select('id, name, email, phone')
            .eq('phone', format)
            .maybeSingle();

          if (formatMatch) {
            existingUser = formatMatch;
            break;
          }
        }
      }

      if (userError) {
        console.error('Error checking user:', userError);
        Alert.alert('Error', 'Failed to check phone number. Please try again.');
        return;
      }

      if (!existingUser) {
        // Phone number doesn't exist - show error message
        Alert.alert(
          'User Not Found',
          'This phone number is not registered on the app. Please ask them to download the app first to accept your invitation.',
          [{ text: 'OK' }]
        );
        setPhoneInput('');
        return;
      }

      // Check if already connected
      const { data: existingConnection } = await supabase
        .from('connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('connected_user_id', existingUser.id)
        .single();

      if (existingConnection) {
        Alert.alert('Already Connected', 'You are already connected to this user.');
        setPhoneInput('');
        setShowInviteByPhoneModal(false);
        return;
      }

      // Check if there's already a pending invitation
      const { data: existingInvitation } = await supabase
        .from('connection_invitations')
        .select('id')
        .eq('inviter_user_id', user.id)
        .eq('invitee_phone', normalizedPhone)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (existingInvitation) {
        Alert.alert('Invitation Sent', 'You have already sent an invitation to this phone number.');
        setPhoneInput('');
        setShowInviteByPhoneModal(false);
        return;
      }

      // Create invitation (expires in 7 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error: inviteError } = await supabase
        .from('connection_invitations')
        .insert({
          inviter_user_id: user.id,
          inviter_name: user.name,
          inviter_phone: user.phone,
          inviter_email: user.email,
          inviter_photo: user.photo,
          invitee_phone: normalizedPhone,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        });

      if (inviteError) {
        console.error('Error sending invitation:', inviteError);
        Alert.alert('Error', 'Failed to send invitation. Please try again.');
        return;
      }

      // Check if a notification already exists for this invitation (to prevent duplicates)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: existingNotification } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', existingUser.id)
        .eq('type', 'connection_added')
        .eq('title', 'Connection Invitation')
        .contains('data', {
          type: 'connection_invitation',
          inviterUserId: user.id,
        })
        .gte('created_at', fiveMinutesAgo)
        .limit(1)
        .maybeSingle();

      // Only create notification if one doesn't already exist
      if (!existingNotification) {
        // Create notification for the invitee in database
        const notificationTitle = 'Connection Invitation';
        const notificationBody = `${user.name} wants to connect with you`;
        
        await supabase
          .from('notifications')
          .insert({
            user_id: existingUser.id,
            title: notificationTitle,
            body: notificationBody,
            type: 'connection_added',
            data: {
              type: 'connection_invitation',
              inviterUserId: user.id,
              inviterName: user.name,
            },
          });

        // Send push notification to the invitee
        try {
          const { data: pushResult, error: pushError } = await supabase.functions.invoke(
            'send-push-notification',
            {
              body: {
                user_ids: [existingUser.id],
                title: notificationTitle,
                body: notificationBody,
                data: {
                  type: 'connection_invitation',
                  inviterUserId: user.id,
                  inviterName: user.name,
                  timestamp: new Date().toISOString(),
                },
              },
            }
          );

          if (pushError) {
            console.error('Error sending connection request push notification:', pushError);
            // Don't fail the invitation if push notification fails
          } else if (pushResult) {
            const sentCount = pushResult.sent || 0;
            if (sentCount > 0) {
              console.log(`✅ Connection request push notification sent to ${existingUser.name}`);
            } else {
              console.log(`ℹ️ Connection request push notification: ${pushResult.message || 'No push token found'}`);
            }
          }
        } catch (pushError: any) {
          console.error('Exception sending connection request push notification:', pushError);
          // Don't fail the invitation if push notification fails
        }
      }

      Alert.alert('Invitation Sent', `Invitation sent to ${normalizedPhone}. They will receive a notification.`);
      setPhoneInput('');
      setShowInviteByPhoneModal(false);
      // Real-time subscription will automatically update invitations for the recipient
      // No need to manually reload
    } catch (error) {
      console.error('Error in sendInvitationByPhone:', error);
      Alert.alert('Error', 'Failed to send invitation. Please try again.');
    } finally {
      setSendingInvitation(false);
    }
  };

  const acceptInvitation = async (invitationId: string): Promise<void> => {
    if (!user?.id) return;

    try {
      // Call the database function to accept invitation
      // This will create a connection and update the invitation status
      // Real-time subscriptions will automatically update the UI
      const { data, error } = await supabase.rpc('accept_connection_invitation', {
        p_invitation_id: invitationId,
        p_invitee_user_id: user.id,
      });

      if (error) {
        console.error('Error accepting invitation:', error);
        Alert.alert('Error', 'Failed to accept invitation. Please try again.');
        return;
      }

      if (data && data.length > 0) {
        const result = data[0];
        if (result.success) {
          // Send push notification to the inviter that their invitation was accepted
          try {
            // Get inviter user ID from the invitation
            const { data: invitationData } = await supabase
              .from('connection_invitations')
              .select('inviter_user_id')
              .eq('id', invitationId)
              .single();

            if (invitationData?.inviter_user_id) {
              const { data: pushResult, error: pushError } = await supabase.functions.invoke(
                'send-push-notification',
                {
                  body: {
                    user_ids: [invitationData.inviter_user_id],
                    title: 'Connection Accepted',
                    body: `${user?.name || 'Someone'} accepted your connection invitation`,
                    data: {
                      type: 'connection_added',
                      connectionId: result.connection_id,
                      timestamp: new Date().toISOString(),
                    },
                  },
                }
              );

              if (pushError) {
                console.error('Error sending connection accepted push notification:', pushError);
              } else if (pushResult?.sent > 0) {
                console.log('✅ Connection accepted push notification sent');
              }
            }
          } catch (notifError) {
            console.error('Exception sending connection accepted push notification:', notifError);
          }

          Alert.alert('Connected!', 'You are now connected.');
          // Automatically update location when connection is accepted
          // This ensures the connection shows as online with location immediately
          if (locationSharingEnabled) {
            // Small delay to ensure connection is fully created in database
            setTimeout(() => {
              updateConnectionsLocation();
            }, 500);
          }
          // Real-time subscriptions will automatically update connections and invitations
          // No need to manually reload - real-time will handle it
        } else {
          Alert.alert('Error', result.message || 'Failed to accept invitation.');
        }
      }
    } catch (error) {
      console.error('Error in acceptInvitation:', error);
      Alert.alert('Error', 'Failed to accept invitation. Please try again.');
    }
  };

  const rejectInvitation = async (invitationId: string): Promise<void> => {
    try {
      // Update invitation status to rejected
      // Real-time subscription will automatically update the UI
      const { error } = await supabase
        .from('connection_invitations')
        .update({ status: 'rejected' })
        .eq('id', invitationId);

      if (error) {
        console.error('Error rejecting invitation:', error);
        Alert.alert('Error', 'Failed to reject invitation. Please try again.');
        return;
      }

      // Real-time subscription will automatically reload pending invitations
      // No need to manually reload
    } catch (error) {
      console.error('Error in rejectInvitation:', error);
      Alert.alert('Error', 'Failed to reject invitation. Please try again.');
    }
  };

  const generateConnectionCode = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      setGeneratingCode(true);

      // Generate a 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Set expiration to 24 hours from now
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Invalidate any existing active codes for this user
      await supabase
        .from('connection_codes')
        .update({ is_used: true })
        .eq('user_id', user.id)
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString());

      // Create new code
      const { data, error } = await supabase
        .from('connection_codes')
        .insert({
          user_id: user.id,
          code: code,
          expires_at: expiresAt.toISOString(),
          is_used: false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error generating connection code:', error);
        Alert.alert('Error', 'Failed to generate connection code. Please try again.');
        return;
      }

      setConnectionCode(code);
      setShowGenerateCodeModal(true);
    } catch (error) {
      console.error('Error in generateConnectionCode:', error);
      Alert.alert('Error', 'Failed to generate connection code. Please try again.');
    } finally {
      setGeneratingCode(false);
    }
  };

  const connectByCode = async (): Promise<void> => {
    if (!user?.id || !codeInput.trim()) {
      Alert.alert('Invalid Input', 'Please enter a connection code.');
      return;
    }

    const normalizedCode = codeInput.trim().replace(/\s/g, '');

    if (normalizedCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a 6-digit connection code.');
      return;
    }

    try {
      setConnectingByCode(true);

      // Find the code
      const { data: codeData, error: codeError } = await supabase
        .from('connection_codes')
        .select('user_id')
        .eq('code', normalizedCode)
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (codeError || !codeData) {
        Alert.alert('Invalid Code', 'This connection code is invalid or has expired.');
        setCodeInput('');
        return;
      }

      // Get the code owner's details
      const { data: codeOwner, error: ownerError } = await supabase
        .from('users')
        .select('id, name, email, phone, photo')
        .eq('id', codeData.user_id)
        .single();

      if (ownerError || !codeOwner) {
        Alert.alert('Error', 'Code owner not found.');
        return;
      }

      // Check if trying to connect to self
      if (codeOwner.id === user.id) {
        Alert.alert('Invalid Code', 'You cannot use your own connection code.');
        setCodeInput('');
        return;
      }

      // Check if already connected
      const { data: existingConnection } = await supabase
        .from('connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('connected_user_id', codeOwner.id)
        .single();

      if (existingConnection) {
        Alert.alert('Already Connected', 'You are already connected to this user.');
        setCodeInput('');
        setShowEnterCodeModal(false);
        return;
      }

      // Mark code as used
      await supabase
        .from('connection_codes')
        .update({
          is_used: true,
          used_by_user_id: user.id,
        })
        .eq('id', (codeData as any).id);

      // Create connection (bidirectional connection will be created automatically by trigger)
      const { error: connectionError } = await supabase
        .from('connections')
        .insert({
          user_id: user.id,
          connected_user_id: codeOwner.id,
          connected_user_name: codeOwner.name,
          connected_user_email: codeOwner.email,
          connected_user_phone: codeOwner.phone,
          connected_user_photo: codeOwner.photo,
          status: 'connected',
        });

      if (connectionError) {
        console.error('Error creating connection:', connectionError);
        Alert.alert('Error', 'Failed to create connection. Please try again.');
        return;
      }

      // Send push notification to the code owner that someone used their code
      try {
        const { data: pushResult, error: pushError } = await supabase.functions.invoke(
          'send-push-notification',
          {
            body: {
              user_ids: [codeOwner.id],
              title: 'New Connection',
              body: `${user?.name || 'Someone'} connected with you using your connection code`,
              data: {
                type: 'connection_added',
                userId: user.id,
                userName: user?.name,
                timestamp: new Date().toISOString(),
              },
            },
          }
        );

        if (pushError) {
          console.error('Error sending connection push notification:', pushError);
        } else if (pushResult?.sent > 0) {
          console.log('✅ Connection push notification sent to code owner');
        }
      } catch (notifError) {
        console.error('Exception sending connection push notification:', notifError);
      }

      // Also create in-app notification for code owner
      try {
        await supabase.from('notifications').insert({
          user_id: codeOwner.id,
          title: 'New Connection',
          body: `${user?.name || 'Someone'} connected with you using your connection code`,
          type: 'connection_added',
          data: {
            userId: user.id,
            userName: user?.name,
          },
        });
      } catch (notifError) {
        console.error('Error creating in-app notification:', notifError);
      }

      Alert.alert('Connected!', `You are now connected to ${codeOwner.name}.`);
      setCodeInput('');
      setShowEnterCodeModal(false);

      // Automatically update location when connection is created via code
      // This ensures the connection shows as online with location immediately
      if (locationSharingEnabled) {
        // Small delay to ensure connection is fully created in database
        setTimeout(() => {
          updateConnectionsLocation();
        }, 500);
      }

      // Refresh connections
      setTimeout(() => {
        loadConnections();
      }, 500);
    } catch (error) {
      console.error('Error in connectByCode:', error);
      Alert.alert('Error', 'Failed to connect. Please try again.');
    } finally {
      setConnectingByCode(false);
    }
  };

  const loadConnections = async (): Promise<void> => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading connections:', error);
        setConnections([]); // Set empty array on error to prevent blank screen
        return;
      }

      if (data) {
        // Fetch locked status for each connected user
        const connectedUserIds = data.map(conn => conn.connected_user_id);
        const lockedStatusMap = new Map<string, boolean>();
        
        if (connectedUserIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, is_locked')
            .in('id', connectedUserIds);

          (usersData || []).forEach(u => {
            lockedStatusMap.set(u.id, u.is_locked || false);
          });
        }

        const formattedConnections: Connection[] = data
          .map((conn) => ({
            id: conn.id,
            userId: conn.user_id,
            connectedUserId: conn.connected_user_id,
            connectedUserName: conn.connected_user_name || 'Unknown User',
            connectedUserEmail: conn.connected_user_email,
            connectedUserPhone: conn.connected_user_phone,
            connectedUserPhoto: conn.connected_user_photo,
            status: conn.status,
            location: conn.location_latitude && conn.location_longitude ? {
              latitude: conn.location_latitude,
              longitude: conn.location_longitude,
              address: conn.location_address || undefined,
            } : null,
            locationUpdatedAt: conn.location_updated_at || null,
            createdAt: conn.created_at,
            updatedAt: conn.updated_at,
            isLocked: lockedStatusMap.get(conn.connected_user_id) || false,
            locationSharingEnabled: conn.location_sharing_enabled !== undefined ? conn.location_sharing_enabled : true, // Default to true if not set
          }))
          .filter((conn) => {
            // Filter out connections with missing critical data
            if (!conn.id || !conn.connectedUserId) {
              console.warn('⚠️ Filtering out connection with missing data:', conn);
              return false;
            }
            return true;
          });
        
        console.log(`✅ Loaded ${formattedConnections.length} connections`);
        setConnections(formattedConnections);

        // Update users subscription with new connected user IDs
        setupUsersRealtimeSubscription(connectedUserIds);
      }
    } catch (error) {
      console.error('Error in loadConnections:', error);
    } finally {
      setLoading(false);
    }
  };


  const unlockUser = async (connectedUserId: string, connectedUserName: string): Promise<void> => {
    Alert.alert(
      'Unlock User',
      `Are you sure you want to unlock ${connectedUserName}? This will restore their access to the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock',
          style: 'default',
          onPress: async () => {
            try {
              // Optimistically update the UI immediately
              setConnections((prev) =>
                prev.map((conn) =>
                  conn.connectedUserId === connectedUserId
                    ? { ...conn, isLocked: false }
                    : conn
                )
              );

              const { error } = await supabase
                .from('users')
                .update({ is_locked: false })
                .eq('id', connectedUserId);

              if (error) {
                console.error('Error unlocking user:', error);
                // Revert optimistic update on error
                setConnections((prev) =>
                  prev.map((conn) =>
                    conn.connectedUserId === connectedUserId
                      ? { ...conn, isLocked: true }
                      : conn
                  )
                );
                Alert.alert('Error', 'Failed to unlock user. Please try again.');
                return;
              }

              // Reload connections to ensure all data is fresh and properly formatted
              setTimeout(() => {
                console.log('🔄 Reloading connections after unlock...');
                loadConnections();
              }, 500);

              Alert.alert('Success', `${connectedUserName} has been unlocked and can now access the app.`);
            } catch (error) {
              console.error('Error in unlockUser:', error);
              // Revert optimistic update on error
              setConnections((prev) =>
                prev.map((conn) =>
                  conn.connectedUserId === connectedUserId
                    ? { ...conn, isLocked: true }
                    : conn
                )
              );
              Alert.alert('Error', 'Failed to unlock user. Please try again.');
            }
          },
        },
      ]
    );
  };

  const getConnectionStatus = (connection: Connection): { isOnline: boolean; statusText: string } => {
    if (!connection.locationUpdatedAt) {
      return { isOnline: false, statusText: 'Offline' };
    }

    const locationUpdatedAt = new Date(connection.locationUpdatedAt).getTime();
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    // Consider online if location was updated within last 5 minutes
    const isOnline = locationUpdatedAt > fiveMinutesAgo;
    return { 
      isOnline, 
      statusText: isOnline ? 'Online' : 'Offline' 
    };
  };



  const toggleLocationSharing = async (connectionId: string, connectedUserId: string, connectedUserName: string, currentValue: boolean): Promise<void> => {
    if (!user?.id) return;

    try {
      const newValue = !currentValue;
      
      // Optimistically update the UI
      setConnections((prev) =>
        prev.map((conn) =>
          conn.id === connectionId
            ? { ...conn, locationSharingEnabled: newValue }
            : conn
        )
      );

      // Update in database
      const { error } = await supabase
        .from('connections')
        .update({ location_sharing_enabled: newValue })
        .eq('id', connectionId);

      if (error) {
        console.error('Error toggling location sharing:', error);
        // Revert optimistic update on error
        setConnections((prev) =>
          prev.map((conn) =>
            conn.id === connectionId
              ? { ...conn, locationSharingEnabled: currentValue }
              : conn
          )
        );
        Alert.alert('Error', 'Failed to update location sharing setting. Please try again.');
        return;
      }

      // Also update the reverse connection (where this user is the connected user)
      // This ensures both sides of the connection have the same setting
      const { error: reverseError } = await supabase
        .from('connections')
        .update({ location_sharing_enabled: newValue })
        .eq('user_id', connectedUserId)
        .eq('connected_user_id', user.id);

      if (reverseError) {
        console.warn('Warning: Could not update reverse connection location sharing setting:', reverseError);
        // Don't fail if reverse update fails
      }

      // Show alert when location sharing is turned off
      if (!newValue) {
        Alert.alert(
          'Location Sharing Disabled',
          `${connectedUserName} won't be able to see your live location.`,
          [{ text: 'OK' }]
        );
      }

      // If location sharing was just enabled, update location immediately
      if (newValue && locationSharingEnabled) {
        setTimeout(() => {
          updateConnectionsLocation();
        }, 500);
      }

      console.log(`✅ Location sharing ${newValue ? 'enabled' : 'disabled'} for connection`);
    } catch (error) {
      console.error('Error in toggleLocationSharing:', error);
      // Revert optimistic update on error
      setConnections((prev) =>
        prev.map((conn) =>
          conn.id === connectionId
            ? { ...conn, locationSharingEnabled: currentValue }
            : conn
        )
      );
      Alert.alert('Error', 'Failed to update location sharing setting. Please try again.');
    }
  };

  const removeConnection = async (connectionId: string, connectedUserName: string): Promise<void> => {
            try {
              const connection = connections.find(c => c.id === connectionId);
              
      if (!connection) {
        console.error('Connection not found:', connectionId);
                return;
              }

      // Optimistically remove from UI immediately
      setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));

      // Delete the connection from both sides in parallel
      const [deleteResult1, deleteResult2] = await Promise.allSettled([
        // Delete this user's connection
        supabase
          .from('connections')
          .delete()
          .eq('id', connectionId),
        // Delete the reverse connection
        supabase
                  .from('connections')
                  .delete()
                  .eq('user_id', connection.connectedUserId)
          .eq('connected_user_id', connection.userId),
      ]);

      // Check for errors
      if (deleteResult1.status === 'rejected' || (deleteResult1.status === 'fulfilled' && deleteResult1.value.error)) {
        const error = deleteResult1.status === 'rejected' 
          ? deleteResult1.reason 
          : deleteResult1.value.error;
        console.error('Error removing connection:', error);
        
        // Revert optimistic update on error
        loadConnections();
        Alert.alert('Error', 'Failed to remove connection. Please try again.');
        return;
      }

      if (deleteResult2.status === 'rejected' || (deleteResult2.status === 'fulfilled' && deleteResult2.value.error)) {
        const error = deleteResult2.status === 'rejected' 
          ? deleteResult2.reason 
          : deleteResult2.value.error;
        console.warn('Error removing reverse connection (non-critical):', error);
        // Don't fail if reverse deletion fails - it might not exist
              }

              // Real-time subscription will automatically update the UI when connection is deleted
      // Also manually refresh to ensure all connections are current
      setTimeout(() => {
        loadConnections();
      }, 500);

      console.log(`✅ Connection removed: ${connectedUserName}`);
            } catch (error) {
              console.error('Error in removeConnection:', error);
      // Revert optimistic update on error
      loadConnections();
              Alert.alert('Error', 'Failed to remove connection. Please try again.');
            }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          {navigation.canGoBack() ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Connections</Text>
            {connections.length > 0 && (
              <Text style={styles.headerSubtitle}>
                {connections.length} {connections.length === 1 ? 'connection' : 'connections'}
              </Text>
            )}
          </View>
          <View style={styles.backButton} />
        </View>
      </View>

      {/* Main Content */}
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#007AFF"
              colors={['#007AFF']}
            />
          }
        >
        {/* Quick Actions Section */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={styles.quickActionCard}
            onPress={() => setShowInviteByPhoneModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIconContainer, styles.quickActionIconPrimary]}>
                <Ionicons name="call" size={24} color="#007AFF" />
              </View>
              <Text style={styles.quickActionTitle}>Invite by Phone</Text>
              <Text style={styles.quickActionSubtitle}>Send invitation</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={generateConnectionCode}
              disabled={generatingCode}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIconContainer, styles.quickActionIconSecondary]}>
                {generatingCode ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <Ionicons name="qr-code" size={24} color="#10B981" />
                )}
              </View>
              <Text style={styles.quickActionTitle}>
                {generatingCode ? 'Generating...' : 'Generate Code'}
              </Text>
              <Text style={styles.quickActionSubtitle}>Create code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => setShowEnterCodeModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIconContainer, styles.quickActionIconTertiary]}>
                <Ionicons name="keypad" size={24} color="#8B5CF6" />
              </View>
              <Text style={styles.quickActionTitle}>Enter Code</Text>
              <Text style={styles.quickActionSubtitle}>Connect now</Text>
            </TouchableOpacity>
          </View>
              </View>
        {/* Pending Invitations Section */}
        {pendingInvitations.length > 0 && (
          <View style={styles.invitationsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Invitations</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingInvitations.length}</Text>
              </View>
            </View>
            <View style={styles.invitationsList}>
              {pendingInvitations.map((invitation) => (
                <View key={invitation.id} style={styles.invitationCard}>
                  <View style={styles.invitationCardContent}>
                    <View style={styles.invitationAvatar}>
                      <Text style={styles.invitationAvatarText}>
                        {invitation.inviterName?.charAt(0).toUpperCase() || 'U'}
                      </Text>
                    </View>
                    <View style={styles.invitationDetails}>
                      <Text style={styles.invitationName}>{invitation.inviterName}</Text>
                      <Text style={styles.invitationText}>
                        Wants to connect with you
                      </Text>
                    </View>
                  </View>
                  <View style={styles.invitationActions}>
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => acceptInvitation(invitation.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={() => rejectInvitation(invitation.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-circle" size={18} color="#EF4444" />
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Connections Section */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loadingText}>Loading connections...</Text>
            </View>
          ) : connections.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}>
                <Ionicons name="people-outline" size={80} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyStateTitle}>No connections yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Start by inviting someone using the quick actions above
              </Text>
            </View>
          ) : (
            <View style={styles.connectionsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your Connections</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{connections.length}</Text>
                </View>
              </View>
              <View style={styles.connectionsList}>
              {connections.map((connection) => {
                // Skip rendering if connection data is incomplete
                if (!connection.connectedUserId || !connection.id) {
                  console.warn('⚠️ Skipping connection with incomplete data:', connection);
                  return null;
                }
                
                const displayName = connection.connectedUserName || 'Unknown User';
                
                return (
                  <View
                    key={connection.id} 
                    style={[
                      styles.connectionCard,
                      connection.isLocked && styles.connectionCardEmergency
                    ]}
                  >
                    {/* Emergency Banner */}
                    {connection.isLocked && (
                      <View style={styles.emergencyBanner}>
                        <Ionicons name="warning" size={16} color="#FFFFFF" />
                        <Text style={styles.emergencyBannerText}>EMERGENCY</Text>
                      </View>
                    )}

                    {/* Main Card Content */}
                    <View style={styles.connectionCardContent}>
                      {/* Avatar Section - Simplified */}
                      <View style={styles.avatarSection}>
                        <View style={[
                          styles.connectionAvatar,
                          connection.isLocked && styles.connectionAvatarEmergency
                        ]}>
                          <Text style={styles.connectionAvatarText}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        {connection.isLocked && (
                          <View style={styles.lockIconContainer}>
                            <Ionicons name="lock-closed" size={14} color="#DC2626" />
                          </View>
                        )}
                      </View>

                      {/* Info Section - Full Width */}
                      <View style={styles.infoSection}>
                        {/* Full Name - Prominent */}
                        <Text style={[
                          styles.connectionName,
                          connection.isLocked && styles.connectionNameEmergency
                        ]} numberOfLines={2}>
                          {displayName}
                        </Text>

                        {/* Status Messages */}
                        {connection.isLocked && (
                          <View style={styles.alertMessage}>
                            <Ionicons name="alert-circle" size={14} color="#DC2626" />
                            <Text style={styles.alertMessageText}>
                              Account locked - needs assistance
                            </Text>
                          </View>
                        )}
                        {!connection.locationSharingEnabled && (
                          <View style={styles.infoMessage}>
                            <Ionicons name="location-outline" size={12} color="#64748B" />
                            <Text style={styles.infoMessageText}>
                              Location sharing disabled
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Action Buttons - Full Width */}
                    <View style={styles.actionButtonsContainer}>
                      {connection.locationSharingEnabled && (
                        <TouchableOpacity
                          style={styles.mapButtonFullWidth}
                          onPress={async () => {
                            try {
                              // Priority 1: Get the last inserted location from location_history
                              // This is the most recent location that was actually saved
                              const locationFromHistory = await locationService.getLastLocationFromHistory(connection.connectedUserId);
                              
                              // If no location_history exists, navigate to MapScreen with null location
                              // MapScreen will show error message and hide current user location
                              if (!locationFromHistory || !locationFromHistory.latitude || !locationFromHistory.longitude) {
                                // Navigate with a default location (will be handled by MapScreen to show error)
                                navigation.navigate('MapView', {
                                  location: { latitude: 0, longitude: 0 }, // Dummy location, will be ignored
                                  title: connection.connectedUserName,
                                  showUserLocation: false, // Don't show current user's location when viewing connected user
                                  userId: connection.connectedUserId, // This is the target user we want to view
                                });
                                return;
                              }
                              
                              // If location_history exists, navigate with that location
                              navigation.navigate('MapView', {
                                location: locationFromHistory,
                                title: connection.connectedUserName,
                                showUserLocation: false, // Don't show current user's location when viewing connected user
                                userId: connection.connectedUserId, // This is the target user we want to view
                              });
                            } catch (error) {
                              console.error('Error getting location:', error);
                              // Navigate anyway - MapScreen will check and show error if needed
                              navigation.navigate('MapView', {
                                location: { latitude: 0, longitude: 0 }, // Dummy location, will be ignored
                                title: connection.connectedUserName,
                                showUserLocation: false, // Don't show current user's location when viewing connected user
                                userId: connection.connectedUserId, // This is the target user we want to view
                              });
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="map" size={18} color="#FFFFFF" />
                          <Text style={styles.mapButtonFullWidthText}>View on Map</Text>
                        </TouchableOpacity>
                      )}
                      
                      {/* Menu Button - Full Width */}
                      <TouchableOpacity
                        style={styles.menuButtonFullWidth}
                        onPress={() => {
                          Alert.alert(
                            connection.connectedUserName,
                            'Choose an action',
                            [
                              {
                                text: connection.isLocked ? 'Unlock Account' : 'Lock Account',
                                onPress: () => {
                                  if (connection.isLocked) {
                                    unlockUser(connection.connectedUserId, connection.connectedUserName);
                                  }
                                },
                                style: connection.isLocked ? 'default' : 'cancel',
                              },
                              {
                                text: 'Remove Connection',
                                onPress: () => removeConnection(connection.id, connection.connectedUserName),
                                style: 'destructive',
                              },
                              { text: 'Cancel', style: 'cancel' },
                            ]
                          );
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="#64748B" />
                        <Text style={styles.menuButtonFullWidthText}>More Options</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Location Sharing Toggle */}
                    <View style={styles.toggleSection}>
                      <View style={styles.toggleContent}>
                        <Ionicons 
                          name={connection.locationSharingEnabled ? "location" : "location-outline"} 
                          size={18} 
                          color={connection.locationSharingEnabled ? "#10B981" : "#94A3B8"} 
                        />
                        <Text style={[
                          styles.toggleLabel,
                          !connection.locationSharingEnabled && styles.toggleLabelDisabled
                        ]}>
                          Share my location
                        </Text>
                      </View>
                      <Switch
                        value={connection.locationSharingEnabled ?? true}
                        onValueChange={() => toggleLocationSharing(
                          connection.id,
                          connection.connectedUserId,
                          connection.connectedUserName,
                          connection.locationSharingEnabled ?? true
                        )}
                        trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor="#E2E8F0"
                      />
                    </View>
                  </View>
                );
              })}
              </View>
            </View>
          )}
        </ScrollView>

      {/* Invite by Phone Modal */}
      <Modal
        visible={showInviteByPhoneModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowInviteByPhoneModal(false);
          setPhoneInput('');
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowInviteByPhoneModal(false);
            setPhoneInput('');
          }}
        >
            <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardView}
          >
            <Pressable
              style={styles.invitePhoneModalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.invitePhoneModalHeader}>
                <Text style={styles.invitePhoneModalTitle}>Invite by Phone</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowInviteByPhoneModal(false);
                    setPhoneInput('');
                  }}
                  style={styles.invitePhoneModalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#000000" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.invitePhoneModalBody}>
                  <View style={styles.phoneInputContainer}>
                  <Ionicons name="call-outline" size={20} color="#007AFF" style={styles.phoneInputIcon} />
                    <TextInput
                      ref={phoneInputRef}
                      style={styles.phoneInput}
                    placeholder="Enter 11-digit phone number"
                      placeholderTextColor="#8E8E93"
                      value={phoneInput}
                      onChangeText={(text) => {
                        const formatted = formatPhoneNumber(text);
                        setPhoneInput(formatted);
                      }}
                      keyboardType="phone-pad"
                    autoFocus={true}
                      maxLength={11}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                    styles.invitePhoneModalButton,
                    (!phoneInput.trim() || sendingInvitation) && styles.invitePhoneModalButtonDisabled,
                    ]}
                    onPress={sendInvitationByPhone}
                    disabled={!phoneInput.trim() || sendingInvitation}
                  >
                    {sendingInvitation ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                      <Ionicons name="send" size={18} color="#FFFFFF" />
                      <Text style={styles.invitePhoneModalButtonText}>Send Invitation</Text>
                      </>
                    )}
                  </TouchableOpacity>

                <View style={styles.invitePhoneModalInfo}>
                  <Ionicons name="information-circle-outline" size={14} color="#8E8E93" />
                  <Text style={styles.invitePhoneModalInfoText}>
                    Invitation expires in 7 days
                    </Text>
                  </View>
                </View>
            </Pressable>
            </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Generate Connection Code Modal */}
      <Modal
        visible={showGenerateCodeModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowGenerateCodeModal(false);
          setConnectionCode('');
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowGenerateCodeModal(false);
            setConnectionCode('');
          }}
        >
          <Pressable
            style={styles.invitePhoneModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.invitePhoneModalHeader}>
              <Text style={styles.invitePhoneModalTitle}>Your Connection Code</Text>
                <TouchableOpacity
                  onPress={() => {
                  setShowGenerateCodeModal(false);
                  setConnectionCode('');
                  }}
                style={styles.invitePhoneModalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#000000" />
                </TouchableOpacity>
              </View>
              
            <View style={styles.invitePhoneModalBody}>
              <View style={styles.codeDisplayContainer}>
                <Text style={styles.codeDisplayText}>{connectionCode}</Text>
                  </View>

              <Text style={styles.codeDisplayHint}>
                Share this code with others to connect. The code expires in 24 hours.
                        </Text>

              <TouchableOpacity
                style={styles.invitePhoneModalButton}
                onPress={async () => {
                  // Copy to clipboard
                  await Clipboard.setStringAsync(connectionCode);
                  Alert.alert('Copied!', 'Connection code copied to clipboard.');
                }}
              >
                <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
                <Text style={styles.invitePhoneModalButtonText}>Copy Code</Text>
              </TouchableOpacity>
                      </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Enter Connection Code Modal */}
      <Modal
        visible={showEnterCodeModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowEnterCodeModal(false);
          setCodeInput('');
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowEnterCodeModal(false);
            setCodeInput('');
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardView}
          >
            <Pressable
              style={styles.invitePhoneModalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.invitePhoneModalHeader}>
                <Text style={styles.invitePhoneModalTitle}>Enter Connection Code</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowEnterCodeModal(false);
                    setCodeInput('');
                  }}
                  style={styles.invitePhoneModalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#000000" />
                </TouchableOpacity>
                </View>

              <View style={styles.invitePhoneModalBody}>
                  <View style={styles.phoneInputContainer}>
                  <Ionicons name="keypad-outline" size={20} color="#007AFF" style={styles.phoneInputIcon} />
                    <TextInput
                    ref={codeInputRef}
                      style={styles.phoneInput}
                    placeholder="Enter 6-digit code"
                      placeholderTextColor="#8E8E93"
                    value={codeInput}
                      onChangeText={(text) => {
                      const digitsOnly = text.replace(/\D/g, '').slice(0, 6);
                      setCodeInput(digitsOnly);
                      }}
                    keyboardType="number-pad"
                    autoFocus={true}
                    maxLength={6}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                    styles.invitePhoneModalButton,
                    (!codeInput.trim() || connectingByCode || codeInput.length !== 6) && styles.invitePhoneModalButtonDisabled,
                    ]}
                  onPress={connectByCode}
                  disabled={!codeInput.trim() || connectingByCode || codeInput.length !== 6}
                  >
                  {connectingByCode ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.invitePhoneModalButtonText}>Connect</Text>
                      </>
                    )}
                  </TouchableOpacity>

                <View style={styles.invitePhoneModalInfo}>
                  <Ionicons name="information-circle-outline" size={14} color="#8E8E93" />
                  <Text style={styles.invitePhoneModalInfoText}>
                    Enter the 6-digit code shared by the other person
                    </Text>
                  </View>
                </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  quickActionsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.4,
  },
  badge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
  },
      android: {
        elevation: 2,
      },
    }),
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  quickActionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionIconPrimary: {
    backgroundColor: '#EFF6FF',
  },
  quickActionIconSecondary: {
    backgroundColor: '#ECFDF5',
  },
  quickActionIconTertiary: {
    backgroundColor: '#F5F3FF',
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
    textAlign: 'center',
  },
  quickActionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  quickActionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButtonCard: {
    flex: 1,
    backgroundColor: '#F0F7FF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  actionButtonCardSecondary: {
    backgroundColor: '#E8F5E9',
    borderColor: '#34C759',
  },
  actionButtonIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionButtonIconContainerSecondary: {
    shadowColor: '#34C759',
  },
  actionButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 6,
    textAlign: 'center',
  },
  actionButtonDescription: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
  },
  instructionsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 16,
    borderRadius: 16,
    marginHorizontal: 16,
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  instructionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  instructionsList: {
    gap: 20,
  },
  instructionItem: {
    flexDirection: 'row',
    gap: 16,
  },
  instructionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  instructionContent: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  connectionsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  invitationsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  codeCard: {
    alignItems: 'center',
  },
  codeDisplayBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    width: '100%',
    alignItems: 'center',
  },
  codeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    letterSpacing: 8,
  },
  codeActions: {
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  actionButtonSecondary: {
    backgroundColor: '#F5F5F5',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionButtonTextSecondary: {
    color: '#007AFF',
  },
  codeHint: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
  generateCodeContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  enterCodeContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  codeInputWrapper: {
    position: 'relative',
    width: '100%',
    marginBottom: 24,
    minHeight: 48,
  },
  codeInputBox: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  codeDigitBox: {
    width: 40,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeDigitBoxFilled: {
    backgroundColor: '#F0F7FF',
    borderColor: '#007AFF',
  },
  codeDigitText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    fontSize: 16,
    color: 'transparent',
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  enterCodeHint: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    gap: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  searchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  searchLoadingText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  searchResults: {
    gap: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#8E8E93',
  },
  userPhone: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  connectButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  connectButtonSmallText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptySearch: {
    alignItems: 'center',
    padding: 48,
  },
  emptySearchText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySearchSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 16,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateIcon: {
    marginBottom: 24,
    opacity: 0.5,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  emptyStateSubtext: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyStateActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  connectionsList: {
    gap: 12,
    paddingBottom: 8,
  },
  connectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  connectionCardEmergency: {
    borderWidth: 2,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  connectionCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    gap: 16,
  },
  avatarSection: {
    position: 'relative',
  },
  connectionAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  connectionAvatarEmergency: {
    backgroundColor: '#FEE2E2',
  },
  connectionAvatarOnline: {
    backgroundColor: '#D1FAE5',
  },
  connectionAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6366F1',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  lockIconContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DC2626',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#8E8E93',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statusIndicatorOnline: {
    backgroundColor: '#34C759',
  },
  infoSection: {
    flex: 1,
    marginLeft: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  connectionName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
    letterSpacing: -0.3,
    lineHeight: 26,
    marginBottom: 8,
  },
  connectionNameEmergency: {
    color: '#DC2626',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  lockedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  statusBadgeOnline: {
    backgroundColor: '#ECFDF5',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  statusDotOnline: {
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusTextOnline: {
    color: '#10B981',
  },
  alertMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  alertMessageText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  infoMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  infoMessageText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  actionButtonsContainer: {
    flexDirection: 'column',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  mapButtonFullWidth: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    gap: 8,
    width: '100%',
  },
  mapButtonFullWidthText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuButtonFullWidth: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    gap: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuButtonFullWidthText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  toggleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  toggleLabelDisabled: {
    color: '#94A3B8',
  },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  emergencyBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayPressable: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalCodeContent: {
    alignItems: 'center',
  },
  codeDigitsContainer: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  codeDigitDisplay: {
    width: 36,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F0F7FF',
    borderWidth: 2,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeDigitDisplayText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  codeInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  codeInfoText: {
    fontSize: 13,
    color: '#8E8E93',
    flex: 1,
    lineHeight: 18,
  },
  modalGenerateCodeContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  generateCodeIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0F7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  generateCodeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  generateCodeText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  secondaryButtonModal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F7FF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    marginTop: 12,
  },
  secondaryButtonTextModal: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  enterCodeInstructionsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 16,
  },
  enterCodeInstructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  enterCodeInstructionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  enterCodeInstructionsList: {
    gap: 20,
  },
  enterCodeInstructionItem: {
    flexDirection: 'row',
    gap: 16,
  },
  enterCodeInstructionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enterCodeInstructionNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  enterCodeInstructionContent: {
    flex: 1,
  },
  enterCodeInstructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  enterCodeInstructionText: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  enterCodeSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 20,
    textAlign: 'center',
  },
  inviteByPhoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  inviteByPhoneIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteByPhoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  invitationsSectionDuplicate: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  invitationsSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  invitationsList: {
    gap: 12,
    marginBottom: 16,
  },
  invitationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
    elevation: 3,
      },
    }),
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  invitationCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  invitationAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitationAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#6366F1',
  },
  invitationDetails: {
    flex: 1,
  },
  invitationName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  invitationText: {
    fontSize: 14,
    color: '#64748B',
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  rejectButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '600',
  },
  invitePhoneContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 56,
  },
  phoneInputIcon: {
    marginRight: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
    paddingVertical: 16,
    fontWeight: '500',
  },
  modalOverlayDuplicate2: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalKeyboardView: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitePhoneModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '90%',
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  invitePhoneModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  invitePhoneModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.3,
  },
  invitePhoneModalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitePhoneModalBody: {
    padding: 20,
  },
  invitePhoneModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 8,
    marginTop: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  invitePhoneModalButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#94A3B8',
  },
  invitePhoneModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  invitePhoneModalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  invitePhoneModalInfoText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  connectButtonsContainer: {
    gap: 12,
    marginTop: 12,
  },
  connectButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  connectButtonSecondary: {
    backgroundColor: '#F0F7FF',
    borderWidth: 1.5,
    borderColor: '#007AFF',
  },
  connectButtonIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectButtonIconContainerSecondary: {
    backgroundColor: 'transparent',
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  connectButtonTextSecondary: {
    color: '#007AFF',
  },
  codeDisplayContainer: {
    backgroundColor: '#F0F7FF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  codeDisplayText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    letterSpacing: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  codeDisplayHint: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
});
