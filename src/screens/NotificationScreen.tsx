import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';

type NotificationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Notifications'>;

interface NotificationScreenProps {
  navigation: NotificationScreenNavigationProp;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: 'sos_alert' | 'connection_added' | 'location_updated' | 'incident' | 'general';
  data?: {
    fromUserId?: string;
    fromUserName?: string;
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    connectionId?: string;
    incidentId?: string;
    [key: string]: any;
  };
  read: boolean;
  createdAt: string;
  timestamp: string;
}

export default function NotificationScreen({ navigation }: NotificationScreenProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      loadNotifications();
      setupRealtimeSubscription();
    }

    // Listen for notifications received while app is in foreground (for push notifications)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Push notification received in foreground:', notification);
      // Reload notifications from database to get the latest
      loadNotifications();
    });

    // Listen for when user taps on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
      const data = response.notification.request.content.data;
      
      // Handle navigation based on notification type
      if (data?.type === 'sos_alert' && data?.location) {
        navigation.navigate('MapView', {
          location: {
            latitude: data.location.latitude,
            longitude: data.location.longitude,
            address: data.location.address,
          },
          title: `SOS from ${data.fromUserName || 'Connection'}`,
          showUserLocation: true,
          userId: data.fromUserId,
        });
      } else if (data?.type === 'connection_added') {
        navigation.navigate('Connections');
      } else if (data?.type === 'location_updated') {
        navigation.navigate('Home');
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [navigation, user?.id]);

  const loadNotifications = async (): Promise<void> => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
      // Fetch notifications from database
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100); // Limit to last 100 notifications

      if (error) {
        console.error('Error loading notifications from database:', error);
        setNotifications([]);
        return;
      }

      // Transform database records to AppNotification format
      const transformedNotifications: AppNotification[] = (data || []).map((notif) => ({
        id: notif.id,
        title: notif.title,
        body: notif.body,
        type: notif.type as AppNotification['type'],
        data: notif.data || {},
        read: notif.read || false,
        createdAt: notif.created_at,
        timestamp: notif.created_at,
      }));

      setNotifications(transformedNotifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription if any
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    // Subscribe to notifications table changes
    const channelName = `notifications:${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Realtime notification update:', payload.eventType);
          
          if (payload.eventType === 'INSERT') {
            // New notification added - reload to get latest
            loadNotifications();
          } else if (payload.eventType === 'UPDATE') {
            // Notification updated (e.g., marked as read) - reload
            loadNotifications();
          } else if (payload.eventType === 'DELETE') {
            // Notification deleted - reload
            loadNotifications();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to notifications real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to notifications real-time updates');
        }
      });

    realtimeChannelRef.current = channel;
  };

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const markAsRead = async (notificationId: string): Promise<void> => {
    if (!user?.id) return;

    try {
      // Update in database
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error marking notification as read:', error);
        return;
      }

      // Update local state
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );
    } catch (error) {
      console.error('Error in markAsRead:', error);
    }
  };

  const handleNotificationPress = (notification: AppNotification): void => {
    // Mark as read
    markAsRead(notification.id);

    // Navigate based on notification type
    if (notification.type === 'sos_alert' && notification.data?.location) {
      navigation.navigate('MapView', {
        location: {
          latitude: notification.data.location.latitude,
          longitude: notification.data.location.longitude,
          address: notification.data.location.address,
        },
        title: `SOS from ${notification.data.fromUserName || 'Connection'}`,
        showUserLocation: true,
        userId: notification.data.fromUserId,
      });
    } else if (notification.type === 'connection_added') {
      navigation.navigate('Connections');
    } else if (notification.type === 'location_updated') {
      navigation.navigate('Home');
    }
  };

  const clearAllNotifications = (): void => {
    if (notifications.length === 0) return;

    Alert.alert(
      'Clear All Notifications?',
      `This will delete all ${notifications.length} notification${notifications.length > 1 ? 's' : ''}. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;

            try {
              // Delete all notifications from database
              const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('user_id', user.id);

              if (error) {
                console.error('Error clearing notifications:', error);
                Alert.alert('Error', 'Failed to clear notifications');
                return;
              }

              // Update local state
              setNotifications([]);
            } catch (error) {
              console.error('Error in clearAllNotifications:', error);
              Alert.alert('Error', 'Failed to clear notifications');
            }
          },
        },
      ]
    );
  };

  const getNotificationIcon = (type: AppNotification['type']): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'sos_alert':
        return 'warning';
      case 'connection_added':
        return 'person-add';
      case 'location_updated':
        return 'location';
      case 'incident':
        return 'alert-circle';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: AppNotification['type']): string => {
    switch (type) {
      case 'sos_alert':
        return '#FF3B30';
      case 'connection_added':
        return '#34C759';
      case 'location_updated':
        return '#007AFF';
      case 'incident':
        return '#FF9500';
      default:
        return '#8E8E93';
    }
  };

  const formatTime = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now.getTime() - time.getTime()) / 1000 / 60); // minutes

    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
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
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearAllNotifications}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="notifications-off-outline" size={64} color="#8E8E93" />
          <Text style={styles.emptyStateText}>No notifications</Text>
          <Text style={styles.emptyStateSubtext}>
            You'll see notifications here when you receive alerts
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.notificationItem, !item.read && styles.unreadNotification]}
              onPress={() => handleNotificationPress(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: getNotificationColor(item.type) + '20' }]}>
                <Ionicons
                  name={getNotificationIcon(item.type)}
                  size={24}
                  color={getNotificationColor(item.type)}
                />
              </View>
              <View style={styles.notificationContent}>
                <View style={styles.notificationHeader}>
                  <Text style={[styles.notificationTitle, !item.read && styles.unreadTitle]}>
                    {item.title}
                  </Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.notificationBody} numberOfLines={3}>
                  {item.body}
                </Text>
                {/* Show location details for SOS alerts */}
                {item.type === 'sos_alert' && item.data?.location && (
                  <View style={styles.locationInfo}>
                    {item.data.location.address && (
                      <View style={styles.locationRow}>
                        <Ionicons name="location" size={14} color="#8E8E93" />
                        <Text style={styles.locationText} numberOfLines={1}>
                          {item.data.location.address}
                        </Text>
                      </View>
                    )}
                    <View style={styles.locationRow}>
                      <Ionicons name="map" size={14} color="#8E8E93" />
                      <Text style={styles.locationText}>
                        {item.data.location.latitude?.toFixed(6)}, {item.data.location.longitude?.toFixed(6)}
                      </Text>
                    </View>
                    {item.data.formattedTime && (
                      <View style={styles.locationRow}>
                        <Ionicons name="time" size={14} color="#8E8E93" />
                        <Text style={styles.locationText}>{item.data.formattedTime}</Text>
                      </View>
                    )}
                  </View>
                )}
                <Text style={styles.notificationTime}>{formatTime(item.timestamp)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  unreadNotification: {
    backgroundColor: '#F0F9FF',
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  notificationBody: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  locationInfo: {
    marginTop: 8,
    marginBottom: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  locationText: {
    fontSize: 12,
    color: '#8E8E93',
    flex: 1,
  },
});

