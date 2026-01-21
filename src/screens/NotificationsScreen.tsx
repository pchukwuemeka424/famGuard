import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { RootStackParamList, Location } from '../types';

type NotificationsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Notifications'>;

interface NotificationsScreenProps {
  navigation: NotificationsScreenNavigationProp;
}

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  data: any;
  read: boolean;
  created_at: string;
  updated_at: string;
}

const getNotificationIcon = (type: string): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case 'sos_alert':
      return 'warning';
    case 'connection_added':
      return 'person-add';
    case 'location_updated':
      return 'location';
    case 'location_reminder':
      return 'location-outline';
    case 'incident':
    case 'incident_proximity':
      return 'alert-circle';
    case 'check_in':
      return 'checkmark-circle';
    case 'check_in_emergency':
      return 'warning';
    case 'check_in_unsafe':
      return 'alert-circle';
    case 'missed_check_in':
      return 'time-outline';
    case 'travel_advisory':
      return 'airplane';
    case 'route_risk':
      return 'map';
    default:
      return 'notifications';
  }
};

const getNotificationColor = (type: string, data?: any): string => {
  // Check for incident_proximity with alert level
  if (type === 'incident_proximity' && data?.alertLevel) {
    switch (data.alertLevel) {
      case 'danger':
        return '#DC2626'; // Red for danger (0-3km)
      case 'warning':
        return '#F59E0B'; // Orange for warning (3-6km)
      case 'alert':
        return '#EF4444'; // Red-orange for alert (6-10km)
      default:
        return '#EF4444';
    }
  }

  switch (type) {
    case 'sos_alert':
    case 'check_in_emergency':
      return '#DC2626';
    case 'check_in_unsafe':
    case 'missed_check_in':
      return '#F59E0B';
    case 'connection_added':
      return '#10B981';
    case 'location_reminder':
      return '#3B82F6';
    case 'incident':
    case 'incident_proximity':
      return '#EF4444';
    default:
      return '#3B82F6';
  }
};

export default function NotificationsScreen({ navigation }: NotificationsScreenProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationChannelRef = React.useRef<any>(null);
  const locationHistoryChannelRef = React.useRef<any>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      setNotifications(data || []);
      const unread = (data || []).filter((n: Notification) => !n.read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  // Save user's location to history when screen opens
  useEffect(() => {
    const saveUserLocation = async () => {
      if (!user?.id) return;

      try {
        // Import locationService dynamically to avoid circular dependencies
        const { locationService } = await import('../services/locationService');
        
        // Check location permissions
        const hasPermission = await locationService.checkPermissions();
        if (!hasPermission) {
          // Silently fail - don't show error to user when opening notifications
          if (__DEV__) {
            console.log('Location permission not granted - skipping location save on notification screen open');
          }
          return;
        }

        // Get high accuracy location
        const currentLocation = await locationService.getHighAccuracyLocation(true);
        if (!currentLocation) {
          if (__DEV__) {
            console.log('Could not get location - skipping location save on notification screen open');
          }
          return;
        }

        // Get accuracy from GPS
        let locationAccuracy: number | null = null;
        try {
          const { Location: ExpoLocation } = await import('expo-location');
          
          const locationWithAccuracy = await ExpoLocation.getCurrentPositionAsync({
            accuracy: Platform.OS === 'ios' ? ExpoLocation.Accuracy.BestForNavigation : ExpoLocation.Accuracy.Highest,
            maximumAge: 0, // Force fresh location
            timeout: 10000,
          });
          locationAccuracy = locationWithAccuracy?.coords?.accuracy !== undefined && locationWithAccuracy?.coords?.accuracy !== null
            ? locationWithAccuracy.coords.accuracy
            : null;
        } catch (accuracyError) {
          // Accuracy is optional, continue without it
          if (__DEV__) {
            console.warn('Could not get location accuracy:', accuracyError);
          }
        }

        // Save location to history with high accuracy
        await locationService.saveLocationToHistory(user.id, currentLocation, false, locationAccuracy);
        
        // Also update connections table for real-time location sharing
        // This ensures connected users see the location update via real-time subscriptions
        const { data: userSettings } = await supabase
          .from('user_settings')
          .select('location_sharing_enabled')
          .eq('user_id', user.id)
          .single();

        const shareLocation = userSettings?.location_sharing_enabled ?? false;
        
        if (shareLocation) {
          // Update location in connections table for real-time updates
          // This will trigger real-time subscriptions for connected users
          await supabase
            .from('connections')
            .update({
              location_latitude: currentLocation.latitude,
              location_longitude: currentLocation.longitude,
              location_address: currentLocation.address || null,
              location_updated_at: new Date().toISOString(),
            })
            .eq('connected_user_id', user.id)
            .eq('status', 'connected');

          if (__DEV__) {
            console.log('✅ Location updated in connections table for real-time sharing');
          }
        }
        
        if (__DEV__) {
          console.log('✅ Location saved to history when opening notification screen');
        }
      } catch (error) {
        // Silently fail - don't interrupt user experience
        if (__DEV__) {
          console.error('Error saving location when opening notification screen:', error);
        }
      }
    };

    // Save location when screen opens (only once when component mounts)
    saveUserLocation();
  }, [user?.id]);

  useEffect(() => {
    loadNotifications();

    // Set up real-time subscription for notifications
    if (user?.id) {
      const channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            loadNotifications();
          }
        )
        .subscribe();

      notificationChannelRef.current = channel;

      // Set up real-time subscription for location_history updates
      // This listens for location updates and ensures real-time sync
      const locationChannel = supabase
        .channel(`notification_screen_location:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'location_history',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (__DEV__) {
              console.log('Location history updated via real-time subscription in notification screen:', payload.new?.id);
            }
            // Location is automatically saved, no action needed here
            // This subscription ensures we're aware of location updates in real-time
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
            if (__DEV__) {
              console.log('Connection location updated via real-time subscription in notification screen');
            }
            // Connection location updated - this means our location was shared in real-time
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && __DEV__) {
            console.log('✅ Subscribed to location real-time updates in notification screen');
          }
        });

      locationHistoryChannelRef.current = locationChannel;
    }

    return () => {
      if (notificationChannelRef.current) {
        supabase.removeChannel(notificationChannelRef.current);
      }
      if (locationHistoryChannelRef.current) {
        supabase.removeChannel(locationHistoryChannelRef.current);
      }
    };
  }, [user?.id, loadNotifications]);

  const markAsRead = async (notificationId: string) => {
    try {
      // Get notification data before marking as read
      const notification = notifications.find((n) => n.id === notificationId);
      const notificationData = notification?.data as any;
      const requiresLocationUpdate = notificationData?.requiresLocationUpdate === true;
      const notificationType = notificationData?.type;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return;
      }

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // If this is a quick message notification that requires location update, trigger it
      if (requiresLocationUpdate && notificationType === 'quick_message') {
        try {
          const { locationService } = await import('../services/locationService');
          
          // Request permission if needed
          const hasPermission = await locationService.checkPermissions();
          if (!hasPermission) {
            const permissionResult = await locationService.requestPermissions();
            if (!permissionResult.granted) {
              console.warn('Location permission denied when updating from quick message notification');
              Alert.alert(
                'Location Permission Required',
                'To update your location, please grant location permission in Settings.',
                [{ text: 'OK' }]
              );
              return;
            }
          }

          // Get current location and update
          const currentLocation = await locationService.getHighAccuracyLocation(true);
          if (currentLocation) {
            // Save location to history
            if (user?.id) {
              await locationService.saveLocationToHistory(user.id, currentLocation);
              
              // Also update connections table if location sharing is enabled
              const { data: userSettings } = await supabase
                .from('user_settings')
                .select('location_sharing_enabled')
                .eq('user_id', user.id)
                .single();

              if (userSettings?.location_sharing_enabled) {
                // Update location in connections table
                await supabase
                  .from('connections')
                  .update({
                    location_latitude: currentLocation.latitude,
                    location_longitude: currentLocation.longitude,
                    location_address: currentLocation.address || null,
                    location_updated_at: new Date().toISOString(),
                  })
                  .eq('connected_user_id', user.id)
                  .eq('status', 'connected');
              }

              console.log('✅ Location updated after reading quick message notification');
            }
          }
        } catch (locationError) {
          console.error('Error updating location from quick message notification:', locationError);
          // Don't show error to user - location update is optional
        }
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) {
        console.error('Error marking all as read:', error);
        Alert.alert('Error', 'Failed to mark all notifications as read.');
        return;
      }

      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
      Alert.alert('Error', 'Failed to mark all notifications as read.');
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) {
        console.error('Error deleting notification:', error);
        return;
      }

      // Update local state
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      const deletedNotification = notifications.find((n) => n.id === notificationId);
      if (deletedNotification && !deletedNotification.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderNotification = ({ item }: { item: Notification }) => {
    const iconName = getNotificationIcon(item.type);
    const iconColor = getNotificationColor(item.type, item.data);
    // Emergency alerts include: sos_alert, check_in_emergency, missed_check_in, check_in_unsafe, incident, incident_proximity
    const isEmergencyAlert = item.type === 'sos_alert' || 
                             item.type === 'check_in_emergency' || 
                             item.type === 'missed_check_in' || 
                             item.type === 'check_in_unsafe' ||
                             item.type === 'incident';
    const isConnectionRequest = item.type === 'connection_added';
    const isIncidentProximity = item.type === 'incident_proximity';
    const isLocationReminder = item.type === 'location_reminder';
    
    // Check if this is a greeting notification (morning or afternoon)
    const isGreeting = item.data?.type === 'morning_greeting' || item.data?.type === 'afternoon_greeting' || 
                       item.type === 'general' && (item.data?.type === 'morning_greeting' || item.data?.type === 'afternoon_greeting');
    
    // Get alert level for proximity incidents
    const alertLevel = item.data?.alertLevel || null;
    const isDanger = alertLevel === 'danger';
    const isWarning = alertLevel === 'warning';

    const handleNotificationPress = async () => {
      // Mark as read if unread
      if (!item.read) {
        markAsRead(item.id);
      }

      // Handle location reminder - update user's location when notification is opened
      if (isLocationReminder) {
        try {
          // Import locationService dynamically to avoid circular dependencies
          const { locationService } = await import('../services/locationService');
          
          // Request permission if needed
          const hasPermission = await locationService.checkPermissions();
          if (!hasPermission) {
            const permissionResult = await locationService.requestPermissions();
            if (!permissionResult.granted) {
              Alert.alert(
                'Permission Required',
                'Location permission is required to update your location.',
                [{ text: 'OK' }]
              );
              return;
            }
          }

          // Get current location
          const currentLocation = await locationService.getHighAccuracyLocation(true);
          if (currentLocation && user?.id) {
            // Save location to history (this will insert a new row)
            await locationService.saveLocationToHistory(user.id, currentLocation, true);
            
            // Also update family_members if location sharing is enabled
            const { data: userSettings } = await supabase
              .from('user_settings')
              .select('location_sharing_enabled')
              .eq('user_id', user.id)
              .single();

            const shareLocation = userSettings?.location_sharing_enabled ?? false;
            
            if (shareLocation) {
              // Get family group ID if available
              const { data: familyMember } = await supabase
                .from('family_members')
                .select('family_group_id')
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();

              if (familyMember?.family_group_id) {
                // Update location in family_members table
                await supabase
                  .from('family_members')
                  .update({
                    location_latitude: currentLocation.latitude,
                    location_longitude: currentLocation.longitude,
                    location_address: currentLocation.address || null,
                    last_seen: new Date().toISOString(),
                  })
                  .eq('user_id', user.id)
                  .eq('family_group_id', familyMember.family_group_id);
              }
            }

            Alert.alert(
              'Location Updated',
              'Your location has been updated successfully.',
              [{ text: 'OK' }]
            );
          } else {
            Alert.alert(
              'Location Error',
              'Unable to get your current location. Please check your location settings.',
              [{ text: 'OK' }]
            );
          }
        } catch (error) {
          console.error('Error updating location from notification:', error);
          Alert.alert(
            'Error',
            'Failed to update location. Please try again.',
            [{ text: 'OK' }]
          );
        }
        return;
      }

      // Navigate to MapScreen for emergency alerts with location data
      if (isEmergencyAlert && item.data?.location) {
        const location = item.data.location;
        const userId = item.data.userId;
        const userName = item.data.userName || item.title.replace('🚨 Emergency Alert', '').trim() || 'Emergency Location';
        
        // Ensure location has required fields
        if (location.latitude && location.longitude) {
          navigation.navigate('MapView', {
            location: {
              latitude: location.latitude,
              longitude: location.longitude,
              address: location.address,
            },
            title: userName,
            showUserLocation: true,
            userId: userId,
          });
        }
      }

      // Navigate to ConnectionScreen for connection requests
      if (isConnectionRequest) {
        navigation.navigate('Connections');
      }

      // Navigate to IncidentFeedScreen for incident proximity alerts
      if (isIncidentProximity) {
        navigation.navigate('Incidents');
      }
    };

    return (
      <TouchableOpacity
        style={[styles.notificationItem, !item.read && styles.notificationItemUnread]}
        onPress={handleNotificationPress}
        activeOpacity={0.7}
      >
        <View style={styles.notificationContent}>
          <View style={[
            styles.iconContainer, 
            { backgroundColor: `${iconColor}15` },
            isDanger && styles.iconContainerDanger,
            isWarning && styles.iconContainerWarning,
          ]}>
            <Ionicons name={iconName} size={24} color={iconColor} />
          </View>
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text style={[
                styles.notificationTitle, 
                !item.read && styles.notificationTitleUnread,
                isDanger && styles.notificationTitleDanger,
                isWarning && styles.notificationTitleWarning,
              ]}>
              {item.title}
            </Text>
              {isIncidentProximity && alertLevel && (
                <View style={[
                  styles.alertBadge,
                  isDanger && styles.alertBadgeDanger,
                  isWarning && styles.alertBadgeWarning,
                  alertLevel === 'alert' && styles.alertBadgeAlert,
                ]}>
                  <Text style={styles.alertBadgeText}>
                    {alertLevel.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.notificationBodyContainer}>
              <Text 
                style={[
                  styles.notificationBody,
                  isDanger && styles.notificationBodyDanger,
                  isWarning && styles.notificationBodyWarning,
                  isEmergencyAlert && styles.notificationBodyEmergency,
                  isGreeting && styles.notificationBodyGreeting,
                ]} 
                numberOfLines={isEmergencyAlert || isIncidentProximity || isGreeting ? undefined : 2}
              >
                {item.body}
              </Text>
              {/* Show both address and coordinates for emergency alerts */}
              {isEmergencyAlert && item.data?.location && (
                <View style={styles.locationInfoContainer}>
                  {item.data.location.address && (
                    <Text style={styles.locationAddress}>
                      📍 {item.data.location.address}
                    </Text>
                  )}
                  {item.data.location.latitude && item.data.location.longitude && (
                    <Text style={styles.locationCoordinates}>
                      {item.data.location.latitude.toFixed(6)}, {item.data.location.longitude.toFixed(6)}
                    </Text>
                  )}
                </View>
              )}
            </View>
            <Text style={styles.notificationTime}>{formatDate(item.created_at)}</Text>
          </View>
          {!item.read && <View style={[styles.unreadDot, isDanger && styles.unreadDotDanger]} />}
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteNotification(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={markAllAsRead}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {unreadCount === 0 && <View style={styles.headerRight} />}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptyText}>You're all caught up!</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          ListHeaderComponent={
            unreadCount > 0 ? (
              <View style={styles.unreadHeader}>
                <Text style={styles.unreadHeaderText}>
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 20,
  },
  unreadHeader: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  unreadHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  notificationItem: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notificationItemUnread: {
    backgroundColor: '#F8FAFC',
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  alertBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  alertBadgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  alertBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  alertBadgeAlert: {
    backgroundColor: '#FEE2E2',
  },
  alertBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  iconContainerDanger: {
    backgroundColor: '#FEE2E2',
  },
  iconContainerWarning: {
    backgroundColor: '#FEF3C7',
  },
  notificationTitleDanger: {
    color: '#DC2626',
  },
  notificationTitleWarning: {
    color: '#F59E0B',
  },
  notificationBodyDanger: {
    color: '#991B1B',
    fontWeight: '500',
  },
  notificationBodyWarning: {
    color: '#92400E',
    fontWeight: '500',
  },
  notificationBodyEmergency: {
    color: '#991B1B',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
  },
  notificationBodyGreeting: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    fontWeight: '500',
  },
  unreadDotDanger: {
    backgroundColor: '#DC2626',
  },
  notificationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  notificationTitleUnread: {
    fontWeight: '700',
  },
  notificationBodyContainer: {
    marginBottom: 4,
  },
  notificationBody: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
    lineHeight: 20,
  },
  locationInfoContainer: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  locationAddress: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    marginBottom: 4,
    lineHeight: 18,
  },
  locationCoordinates: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  notificationTime: {
    fontSize: 12,
    color: '#94A3B8',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginLeft: 8,
  },
  unreadDotDanger: {
    backgroundColor: '#DC2626',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 24,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
  },
});

