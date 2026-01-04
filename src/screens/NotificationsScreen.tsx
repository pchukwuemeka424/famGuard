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

  useEffect(() => {
    loadNotifications();

    // Set up real-time subscription
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
    }

    return () => {
      if (notificationChannelRef.current) {
        supabase.removeChannel(notificationChannelRef.current);
      }
    };
  }, [user?.id, loadNotifications]);

  const markAsRead = async (notificationId: string) => {
    try {
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
    const isEmergencyAlert = item.type === 'sos_alert' || item.type === 'check_in_emergency';
    const isConnectionRequest = item.type === 'connection_added';
    const isIncidentProximity = item.type === 'incident_proximity';
    
    // Get alert level for proximity incidents
    const alertLevel = item.data?.alertLevel || null;
    const isDanger = alertLevel === 'danger';
    const isWarning = alertLevel === 'warning';

    const handleNotificationPress = () => {
      // Mark as read if unread
      if (!item.read) {
        markAsRead(item.id);
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
            <Text 
              style={[
                styles.notificationBody,
                isDanger && styles.notificationBodyDanger,
                isWarning && styles.notificationBodyWarning,
              ]} 
              numberOfLines={isEmergencyAlert || isIncidentProximity ? undefined : 2}
            >
              {item.body}
            </Text>
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
  notificationBody: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
    lineHeight: 20,
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

