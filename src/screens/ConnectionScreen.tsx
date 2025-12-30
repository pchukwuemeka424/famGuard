import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { supabase } from '../lib/supabase';
import { locationService } from '../services/locationService';
import type { MainTabParamList, RootStackParamList, Connection } from '../types';

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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<string>('');
  const [generatingCode, setGeneratingCode] = useState<boolean>(false);
  const [codeInput, setCodeInput] = useState<string>('');
  const [validatingCode, setValidatingCode] = useState<boolean>(false);
  const [showGenerateCodeModal, setShowGenerateCodeModal] = useState<boolean>(false);
  const [showEnterCodeModal, setShowEnterCodeModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'home' | 'connections'>('home');
  const codeInputRef = useRef<TextInput>(null);
  const connectionsChannelRef = useRef<any>(null);
  const usersChannelRef = useRef<any>(null);
  const codesChannelRef = useRef<any>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Initial load
    loadConnections();
    loadMyCode();
    
    // Update location immediately if sharing is enabled, then periodically
    if (locationSharingEnabled) {
      updateConnectionsLocation();
    }
    
    // Update location for connections periodically (only if sharing is enabled)
    const updateLocationInterval = setInterval(() => {
      if (locationSharingEnabled) {
        updateConnectionsLocation();
      }
    }, 5 * 60 * 1000); // Update every 5 minutes

    // Set up real-time subscriptions for connections and codes
    setupConnectionsRealtimeSubscription();
    setupCodesRealtimeSubscription();

    return () => {
      clearInterval(updateLocationInterval);
      // Cleanup real-time subscriptions
      if (connectionsChannelRef.current) {
        supabase.removeChannel(connectionsChannelRef.current);
        connectionsChannelRef.current = null;
      }
      if (usersChannelRef.current) {
        supabase.removeChannel(usersChannelRef.current);
        usersChannelRef.current = null;
      }
      if (codesChannelRef.current) {
        supabase.removeChannel(codesChannelRef.current);
        codesChannelRef.current = null;
      }
    };
  }, [user?.id, locationSharingEnabled]);

  const updateConnectionsLocation = async (): Promise<void> => {
    if (!user?.id || !locationSharingEnabled) return;

    try {
      // Check permissions first
      const hasPermission = await locationService.checkPermissions();
      if (!hasPermission) {
        console.warn('Location permission not granted, skipping location update');
        return;
      }

      const currentLocation = await locationService.getCurrentLocation();
      if (!currentLocation) {
        console.warn('Could not get current location');
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
        // Refresh connections to update UI with new location
        loadConnections();
      }
    } catch (error) {
      console.error('Error in updateConnectionsLocation:', error);
    }
  };

  const loadMyCode = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('connection_codes')
        .select('code, expires_at')
        .eq('user_id', user.id)
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading code:', error);
        return;
      }

      if (data) {
        setMyCode(data.code);
      }
    } catch (error) {
      console.error('Error in loadMyCode:', error);
    }
  };

  const generateCode = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      setGeneratingCode(true);
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await supabase
        .from('connection_codes')
        .update({ is_used: true })
        .eq('user_id', user.id)
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString());

      const { error } = await supabase
        .from('connection_codes')
        .insert({
          user_id: user.id,
          code: code,
          expires_at: expiresAt.toISOString(),
          is_used: false,
        });

      if (error) {
        console.error('Error generating code:', error);
        Alert.alert('Error', 'Failed to generate code. Please try again.');
        return;
      }

      setMyCode(code);
    } catch (error) {
      console.error('Error in generateCode:', error);
      Alert.alert('Error', 'Failed to generate code. Please try again.');
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyCodeToClipboard = async (): Promise<void> => {
    if (myCode) {
      await Clipboard.setStringAsync(myCode);
      Alert.alert('Copied!', 'Connection code copied to clipboard.');
    }
  };

  const validateAndConnect = async (): Promise<void> => {
    if (!codeInput.trim() || !user?.id) {
      Alert.alert('Invalid Code', 'Please enter a 6-digit code.');
      return;
    }

    if (codeInput.length !== 6 || !/^\d{6}$/.test(codeInput)) {
      Alert.alert('Invalid Code', 'Code must be exactly 6 digits.');
      return;
    }

    try {
      setValidatingCode(true);

      const { data: codeData, error: codeError } = await supabase
        .from('connection_codes')
        .select('*')
        .eq('code', codeInput)
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (codeError || !codeData) {
        Alert.alert('Invalid Code', 'This code is invalid or has expired.');
        setCodeInput('');
        return;
      }

      if (codeData.user_id === user.id) {
        Alert.alert('Invalid Code', 'You cannot connect to yourself.');
        setCodeInput('');
        return;
      }

      const { data: targetUser, error: userError } = await supabase
        .from('users')
        .select('id, name, email, phone, photo')
        .eq('id', codeData.user_id)
        .single();

      if (userError || !targetUser) {
        Alert.alert('Error', 'User not found.');
        setCodeInput('');
        return;
      }

      const { data: existingConnection } = await supabase
        .from('connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('connected_user_id', targetUser.id)
        .single();

      if (existingConnection) {
        Alert.alert('Already Connected', 'You are already connected to this user.');
        await supabase
          .from('connection_codes')
          .update({ is_used: true, used_by_user_id: user.id })
          .eq('id', codeData.id);
        setCodeInput('');
        return;
      }

      // Get current location if available
      let locationData: any = {};
      try {
        const currentLocation = await locationService.getCurrentLocation();
        if (currentLocation) {
          locationData = {
            location_latitude: currentLocation.latitude,
            location_longitude: currentLocation.longitude,
            location_address: currentLocation.address || null,
            location_updated_at: new Date().toISOString(),
          };
        }
      } catch (locationError) {
        console.warn('Could not get location for connection:', locationError);
        // Continue without location
      }

      const { error: connectError } = await supabase
        .from('connections')
        .insert({
          user_id: user.id,
          connected_user_id: targetUser.id,
          connected_user_name: targetUser.name,
          connected_user_email: targetUser.email,
          connected_user_phone: targetUser.phone || '',
          connected_user_photo: targetUser.photo,
          status: 'connected',
          ...locationData,
        });

      if (connectError) {
        console.error('Error creating connection:', connectError);
        Alert.alert('Error', 'Failed to connect. Please try again.');
        return;
      }

      await supabase
        .from('connection_codes')
        .update({ is_used: true, used_by_user_id: user.id })
        .eq('id', codeData.id);

      // Real-time subscription will automatically update connections
      setCodeInput('');
      setShowEnterCodeModal(false);
      Alert.alert('Connected!', `You are now connected to ${targetUser.name}.`);
    } catch (error) {
      console.error('Error in validateAndConnect:', error);
      Alert.alert('Error', 'Failed to connect. Please try again.');
    } finally {
      setValidatingCode(false);
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
        (payload) => {
          console.log('Connection change detected:', payload.eventType);
          // Reload connections when changes occur
          loadConnections();
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
          console.log('Location update detected from connected user');
          // Reload connections to get updated location
          loadConnections();
        }
      )
      .subscribe();

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
          console.log('User lock status change detected');
          // Reload connections to update lock status
          loadConnections();
        }
      )
      .subscribe();

    usersChannelRef.current = usersChannel;
  };

  const setupCodesRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription if any
    if (codesChannelRef.current) {
      supabase.removeChannel(codesChannelRef.current);
      codesChannelRef.current = null;
    }

    // Subscribe to connection_codes table changes (for code generation/usage)
    const codesChannel = supabase
      .channel(`connection_screen_codes:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_codes',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Connection code change detected:', payload.eventType);
          // Reload code when changes occur
          loadMyCode();
        }
      )
      .subscribe();

    codesChannelRef.current = codesChannel;
  };

  const loadConnections = async (): Promise<void> => {
    if (!user?.id) return;

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

        const formattedConnections: Connection[] = data.map((conn) => ({
          id: conn.id,
          userId: conn.user_id,
          connectedUserId: conn.connected_user_id,
          connectedUserName: conn.connected_user_name,
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
        }));
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

  const searchUsers = async (query: string): Promise<void> => {
    if (!query.trim() || !user?.id) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, phone, photo')
        .or(`email.ilike.%${query}%,phone.ilike.%${query}%`)
        .neq('id', user.id)
        .limit(10);

      if (error) {
        console.error('Error searching users:', error);
        return;
      }

      if (data) {
        const connectedUserIds = connections.map(c => c.connectedUserId);
        const filteredResults = data.filter(
          (u) => !connectedUserIds.includes(u.id)
        );
        setSearchResults(filteredResults);
      }
    } catch (error) {
      console.error('Error in searchUsers:', error);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const connectToUser = async (targetUserId: string, targetUserName: string, targetUserEmail: string, targetUserPhone: string, targetUserPhoto: string | null): Promise<void> => {
    if (!user?.id) return;

    try {
      setConnecting(targetUserId);

      const { data: existingConnection } = await supabase
        .from('connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('connected_user_id', targetUserId)
        .single();

      if (existingConnection) {
        Alert.alert('Already Connected', 'You are already connected to this user.');
        setConnecting(null);
        return;
      }

      // Get current location if available
      let locationData: any = {};
      try {
        const currentLocation = await locationService.getCurrentLocation();
        if (currentLocation) {
          locationData = {
            location_latitude: currentLocation.latitude,
            location_longitude: currentLocation.longitude,
            location_address: currentLocation.address || null,
            location_updated_at: new Date().toISOString(),
          };
        }
      } catch (locationError) {
        console.warn('Could not get location for connection:', locationError);
        // Continue without location
      }

      const { data, error } = await supabase
        .from('connections')
        .insert({
          user_id: user.id,
          connected_user_id: targetUserId,
          connected_user_name: targetUserName,
          connected_user_email: targetUserEmail,
          connected_user_phone: targetUserPhone,
          connected_user_photo: targetUserPhoto,
          status: 'connected',
          ...locationData,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating connection:', error);
        Alert.alert('Error', 'Failed to connect. Please try again.');
        return;
      }

      // Real-time subscription will automatically update connections
      setSearchQuery('');
      setSearchResults([]);
      Alert.alert('Connected', `You are now connected to ${targetUserName}.`);
    } catch (error) {
      console.error('Error in connectToUser:', error);
      Alert.alert('Error', 'Failed to connect. Please try again.');
    } finally {
      setConnecting(null);
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
              const { error } = await supabase
                .from('users')
                .update({ is_locked: false })
                .eq('id', connectedUserId);

              if (error) {
                console.error('Error unlocking user:', error);
                Alert.alert('Error', 'Failed to unlock user. Please try again.');
                return;
              }

              // Real-time subscription will automatically update connections
              Alert.alert('Success', `${connectedUserName} has been unlocked and can now access the app.`);
            } catch (error) {
              console.error('Error in unlockUser:', error);
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

  const removeConnection = async (connectionId: string, connectedUserName: string): Promise<void> => {
    Alert.alert(
      'Remove Connection',
      `Are you sure you want to remove ${connectedUserName} from your connections?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const connection = connections.find(c => c.id === connectionId);
              
              // Delete the connection from both sides
              const { error: deleteError1 } = await supabase
                .from('connections')
                .delete()
                .eq('id', connectionId);

              if (deleteError1) {
                console.error('Error removing connection:', deleteError1);
                Alert.alert('Error', 'Failed to remove connection. Please try again.');
                return;
              }

              // Delete the reverse connection if it exists
              if (connection) {
                const { error: deleteError2 } = await supabase
                  .from('connections')
                  .delete()
                  .eq('user_id', connection.connectedUserId)
                  .eq('connected_user_id', connection.userId);

                if (deleteError2) {
                  console.warn('Error removing reverse connection (non-critical):', deleteError2);
                }
              }

              // Reload connections to update the UI
              await loadConnections();
              
              Alert.alert('Success', `${connectedUserName} has been removed from your connections.`);
            } catch (error) {
              console.error('Error in removeConnection:', error);
              Alert.alert('Error', 'Failed to remove connection. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          {navigation.canGoBack() ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <View style={styles.backButtonContainer}>
                <Ionicons name="arrow-back" size={22} color="#000000" />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <View style={styles.headerTitleContainer}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="people" size={28} color="#007AFF" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Connections</Text>
              <Text style={styles.headerSubtitle}>
                {connections.length > 0 
                  ? `${connections.length} ${connections.length === 1 ? 'connection' : 'connections'}`
                  : 'Connect with others'}
              </Text>
            </View>
          </View>
          <View style={styles.backButton} />
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'home' && styles.tabActive]}
          onPress={() => setActiveTab('home')}
        >
          <Ionicons 
            name={activeTab === 'home' ? 'home' : 'home-outline'} 
            size={20} 
            color={activeTab === 'home' ? '#007AFF' : '#8E8E93'} 
          />
          <Text style={[styles.tabText, activeTab === 'home' && styles.tabTextActive]}>
            Home
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'connections' && styles.tabActive]}
          onPress={() => setActiveTab('connections')}
        >
          <Ionicons 
            name={activeTab === 'connections' ? 'people' : 'people-outline'} 
            size={20} 
            color={activeTab === 'connections' ? '#007AFF' : '#8E8E93'} 
          />
          <Text style={[styles.tabText, activeTab === 'connections' && styles.tabTextActive]}>
            {connections.length > 0 ? `Connections (${connections.length})` : 'Connections'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Home Tab */}
      {activeTab === 'home' && (
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
        >
          {/* Action Section */}
          <View style={styles.actionSection}>
          <Text style={styles.sectionTitle}>Connect with Others</Text>
          <Text style={styles.sectionDescription}>
            Generate a code to share or enter a code from someone else to connect
          </Text>
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={styles.actionButtonCard}
              onPress={() => setShowGenerateCodeModal(true)}
            >
              <View style={styles.actionButtonIconContainer}>
                <Ionicons name="qr-code" size={32} color="#007AFF" />
              </View>
              <Text style={styles.actionButtonTitle}>Generate Code</Text>
              <Text style={styles.actionButtonDescription}>
                Create a 6-digit code to share with others
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButtonCard, styles.actionButtonCardSecondary]}
              onPress={() => setShowEnterCodeModal(true)}
            >
              <View style={[styles.actionButtonIconContainer, styles.actionButtonIconContainerSecondary]}>
                <Ionicons name="key" size={32} color="#34C759" />
              </View>
              <Text style={styles.actionButtonTitle}>Enter Code</Text>
              <Text style={styles.actionButtonDescription}>
                Connect by entering someone's code
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Instructions Section */}
        <View style={styles.instructionsSection}>
          <View style={styles.instructionsHeader}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
            <Text style={styles.instructionsTitle}>How to Connect</Text>
          </View>
          <View style={styles.instructionsList}>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>1</Text>
              </View>
              <View style={styles.instructionContent}>
                <Text style={styles.instructionTitle}>Generate Your Code</Text>
                <Text style={styles.instructionText}>
                  Tap "Generate Code" to create a unique 6-digit code. Share this code with people you want to connect with.
                </Text>
              </View>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>2</Text>
              </View>
              <View style={styles.instructionContent}>
                <Text style={styles.instructionTitle}>Enter Their Code</Text>
                <Text style={styles.instructionText}>
                  Tap "Enter Code" and type the 6-digit code you received from someone else to connect with them.
                </Text>
              </View>
            </View>
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>3</Text>
              </View>
              <View style={styles.instructionContent}>
                <Text style={styles.instructionTitle}>Stay Connected</Text>
                <Text style={styles.instructionText}>
                  Once connected, you can see each other's locations and help in emergencies.
                </Text>
              </View>
            </View>
          </View>
        </View>
        </ScrollView>
      )}

      {/* Connections Tab */}
      {activeTab === 'connections' && (
        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading connections...</Text>
            </View>
          ) : connections.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}>
                <Ionicons name="people-outline" size={64} color="#8E8E93" />
              </View>
              <Text style={styles.emptyStateTitle}>No connections yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Use the Home tab to generate or enter a code to start connecting
              </Text>
            </View>
          ) : (
            <View style={styles.connectionsSection}>
              <Text style={styles.connectionsSectionTitle}>
                Your Connections ({connections.length})
              </Text>
              <View style={styles.connectionsList}>
              {connections.map((connection) => {
                const { isOnline, statusText } = getConnectionStatus(connection);
                return (
                  <View 
                    key={connection.id} 
                    style={[
                      styles.connectionCard,
                      connection.isLocked && styles.connectionCardEmergency
                    ]}
                  >
                    {connection.isLocked && (
                      <View style={styles.emergencyBanner}>
                        <Ionicons name="warning" size={20} color="#FFFFFF" />
                        <Text style={styles.emergencyBannerText}>EMERGENCY</Text>
                      </View>
                    )}
                    <View style={styles.connectionCardContent}>
                      <View style={[
                        styles.connectionAvatar,
                        connection.isLocked && styles.connectionAvatarEmergency
                      ]}>
                        <Text style={styles.connectionAvatarText}>
                          {connection.connectedUserName?.charAt(0) || 'U'}
                        </Text>
                        <View style={[styles.statusIndicator, isOnline && styles.statusIndicatorOnline]} />
                      </View>
                      <View style={styles.connectionDetails}>
                        <View style={styles.connectionNameRow}>
                          <Text style={[
                            styles.connectionName,
                            connection.isLocked && styles.connectionNameEmergency
                          ]}>
                            {connection.connectedUserName}
                          </Text>
                          {!connection.isLocked && (
                            <View style={styles.statusBadge}>
                              <View style={[styles.statusDot, isOnline && styles.statusDotOnline]} />
                              <Text style={[styles.statusText, isOnline && styles.statusTextOnline]}>
                                {statusText}
                              </Text>
                            </View>
                          )}
                        </View>
                        {connection.isLocked && (
                          <View style={styles.emergencyMessage}>
                            <Ionicons name="alert-circle" size={16} color="#EF4444" />
                            <Text style={styles.emergencyMessageText}>
                              This user's account is locked and needs assistance
                            </Text>
                          </View>
                        )}
                        {connection.location && (
                          <View style={styles.locationInfo}>
                            <Ionicons 
                              name="location" 
                              size={14} 
                              color={connection.isLocked ? "#EF4444" : "#34C759"} 
                            />
                            <Text style={[
                              styles.locationText,
                              connection.isLocked && styles.locationTextEmergency
                            ]}>
                              {connection.location.address || 
                                `${connection.location.latitude.toFixed(4)}, ${connection.location.longitude.toFixed(4)}`}
                            </Text>
                          </View>
                        )}
                        {!connection.location && (
                          <Text style={styles.noLocationText}>Location not available</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.connectionActions}>
                      {connection.isLocked && (
                        <TouchableOpacity
                          style={styles.unlockButton}
                          onPress={() => unlockUser(connection.connectedUserId, connection.connectedUserName)}
                        >
                          <Ionicons name="lock-open-outline" size={16} color="#34C759" />
                          <Text style={styles.unlockButtonText}>Unlock</Text>
                        </TouchableOpacity>
                      )}
                      {connection.location && (
                        <TouchableOpacity
                          style={styles.viewLocationButton}
                          onPress={() => {
                            if (connection.location) {
                              navigation.navigate('MapView', {
                                location: connection.location,
                                title: connection.connectedUserName,
                                showUserLocation: true,
                                userId: connection.connectedUserId,
                              });
                            }
                          }}
                        >
                          <Ionicons name="navigate" size={16} color="#007AFF" />
                          <Text style={styles.viewLocationButtonText}>Location</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() =>
                          removeConnection(connection.id, connection.connectedUserName)
                        }
                      >
                        <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Generate Code Modal */}
      <Modal
        visible={showGenerateCodeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGenerateCodeModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowGenerateCodeModal(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>My Connection Code</Text>
              <TouchableOpacity
                onPress={() => setShowGenerateCodeModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>
            
            {myCode ? (
              <View style={styles.modalCodeContent}>
                <Text style={styles.modalSubtitle}>
                  Share this code with someone to connect with them
                </Text>
                <View style={styles.codeDisplayBox}>
                  <View style={styles.codeDigitsContainer}>
                    {myCode.split('').map((digit, index) => (
                      <View key={index} style={styles.codeDigitDisplay}>
                        <Text style={styles.codeDigitDisplayText}>{digit}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.codeActions}>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={copyCodeToClipboard}
                  >
                    <Ionicons name="copy" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Copy Code</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryButtonModal}
                    onPress={generateCode}
                    disabled={generatingCode}
                  >
                    {generatingCode ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={18} color="#007AFF" />
                        <Text style={styles.secondaryButtonTextModal}>Generate New Code</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.codeInfoBox}>
                  <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  <Text style={styles.codeInfoText}>
                    This code expires in 1 hour. Share it securely with people you trust.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.modalGenerateCodeContent}>
                <View style={styles.generateCodeIconContainer}>
                  <Ionicons name="qr-code" size={64} color="#007AFF" />
                </View>
                <Text style={styles.generateCodeTitle}>
                  Create Connection Code
                </Text>
                <Text style={styles.generateCodeText}>
                  Generate a unique 6-digit code that others can use to connect with you. The code will be valid for 1 hour.
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={generateCode}
                  disabled={generatingCode}
                >
                  {generatingCode ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Generating...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Generate Connection Code</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Enter Code Modal */}
      <Modal
        visible={showEnterCodeModal}
        animationType="slide"
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
          {Platform.OS === 'ios' ? (
            <KeyboardAvoidingView
              behavior="padding"
              keyboardVerticalOffset={0}
            >
              <Pressable 
                style={styles.modalContent} 
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Enter Connection Code</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowEnterCodeModal(false);
                      setCodeInput('');
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color="#000000" />
                  </TouchableOpacity>
                </View>
                
                <ScrollView 
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.enterCodeContainer}>
                    <TouchableOpacity 
                      style={styles.codeInputWrapper}
                      activeOpacity={1}
                      onPress={() => {
                        codeInputRef.current?.focus();
                      }}
                    >
                      <View style={styles.codeInputBox}>
                        {codeInput.split('').map((digit, index) => (
                          <View key={index} style={[styles.codeDigitBox, digit && styles.codeDigitBoxFilled]}>
                            <Text style={styles.codeDigitText}>{digit}</Text>
                          </View>
                        ))}
                        {Array.from({ length: 6 - codeInput.length }).map((_, index) => (
                          <View key={`empty-${index}`} style={styles.codeDigitBox} />
                        ))}
                      </View>
                      <TextInput
                        ref={codeInputRef}
                        style={styles.hiddenInput}
                        value={codeInput}
                        onChangeText={(text) => {
                          const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
                          setCodeInput(digitsOnly);
                        }}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus={true}
                        caretHidden={true}
                        showSoftInputOnFocus={true}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.connectButton,
                        (codeInput.length !== 6 || validatingCode) && styles.buttonDisabled,
                      ]}
                      onPress={validateAndConnect}
                      disabled={codeInput.length !== 6 || validatingCode}
                    >
                      {validatingCode ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                          <Text style={styles.primaryButtonText}>Connect</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.enterCodeHint}>
                      Enter the 6-digit code from another user
                    </Text>
                  </View>
                </ScrollView>
              </Pressable>
            </KeyboardAvoidingView>
          ) : (
            <Pressable 
              style={styles.modalContent} 
              onPress={(e) => e.stopPropagation()}
            >
              <ScrollView 
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Enter Connection Code</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowEnterCodeModal(false);
                      setCodeInput('');
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color="#000000" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.enterCodeContainer}>
                  <TouchableOpacity 
                    style={styles.codeInputWrapper}
                    activeOpacity={1}
                    onPress={() => {
                      codeInputRef.current?.focus();
                    }}
                  >
                    <View style={styles.codeInputBox}>
                      {codeInput.split('').map((digit, index) => (
                        <View key={index} style={[styles.codeDigitBox, digit && styles.codeDigitBoxFilled]}>
                          <Text style={styles.codeDigitText}>{digit}</Text>
                        </View>
                      ))}
                      {Array.from({ length: 6 - codeInput.length }).map((_, index) => (
                        <View key={`empty-${index}`} style={styles.codeDigitBox} />
                      ))}
                    </View>
                    <TextInput
                      ref={codeInputRef}
                      style={styles.hiddenInput}
                      value={codeInput}
                      onChangeText={(text) => {
                        const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
                        setCodeInput(digitsOnly);
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus={false}
                      caretHidden={true}
                      showSoftInputOnFocus={true}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      styles.connectButton,
                      (codeInput.length !== 6 || validatingCode) && styles.buttonDisabled,
                    ]}
                    onPress={validateAndConnect}
                    disabled={codeInput.length !== 6 || validatingCode}
                  >
                    {validatingCode ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                        <Text style={styles.primaryButtonText}>Connect</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.enterCodeHint}>
                    Enter the 6-digit code from another user
                  </Text>
                </View>
              </ScrollView>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
  },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  content: {
    flex: 1,
  },
  actionSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 20,
    lineHeight: 22,
  },
  actionButtonsContainer: {
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  connectionsSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
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
    marginBottom: 12,
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
    padding: 48,
  },
  loadingText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
  },
  emptyStateIcon: {
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
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
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 12,
  },
  connectionCardEmergency: {
    borderWidth: 2,
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  connectionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  connectionAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  connectionAvatarEmergency: {
    backgroundColor: '#EF4444',
  },
  connectionAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
  connectionDetails: {
    flex: 1,
  },
  connectionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  connectionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  connectionNameEmergency: {
    color: '#EF4444',
    fontWeight: '700',
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
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeOnline: {
    backgroundColor: '#E8F5E9',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8E8E93',
  },
  statusDotOnline: {
    backgroundColor: '#34C759',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  statusTextOnline: {
    color: '#34C759',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#34C759',
    flex: 1,
  },
  locationTextEmergency: {
    color: '#EF4444',
    fontWeight: '600',
  },
  noLocationText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
    fontStyle: 'italic',
  },
  connectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 4,
  },
  unlockButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  viewLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 4,
  },
  viewLocationButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 4,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF3B30',
  },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  emergencyBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  emergencyMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  emergencyMessageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
});
