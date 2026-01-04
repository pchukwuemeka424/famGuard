import React, { createContext, useState, useContext, useEffect, useRef, ReactNode } from 'react';
import { travelAdvisoryService } from '../services/travelAdvisoryService';
import { locationService } from '../services/locationService';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { TravelAdvisory, RouteRiskData, Location } from '../types';

interface TravelAdvisoryContextType {
  advisories: TravelAdvisory[];
  currentLocationAdvisories: TravelAdvisory[];
  routeRiskData: RouteRiskData | null;
  loading: boolean;
  refreshAdvisories: () => Promise<void>;
  getAdvisoriesForLocation: (state: string, region?: string, lga?: string) => Promise<void>;
  getRouteRisk: (originState: string, destinationState: string, originCity?: string, destinationCity?: string) => Promise<void>;
  clearRouteRisk: () => void;
}

const TravelAdvisoryContext = createContext<TravelAdvisoryContextType | undefined>(undefined);

export const useTravelAdvisory = (): TravelAdvisoryContextType => {
  const context = useContext(TravelAdvisoryContext);
  if (!context) {
    throw new Error('useTravelAdvisory must be used within TravelAdvisoryProvider');
  }
  return context;
};

interface TravelAdvisoryProviderProps {
  children: ReactNode;
}

export const TravelAdvisoryProvider: React.FC<TravelAdvisoryProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [advisories, setAdvisories] = useState<TravelAdvisory[]>([]);
  const [currentLocationAdvisories, setCurrentLocationAdvisories] = useState<TravelAdvisory[]>([]);
  const [routeRiskData, setRouteRiskData] = useState<RouteRiskData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastNotifiedAdvisories, setLastNotifiedAdvisories] = useState<Set<string>>(new Set());
  const advisoryChannelRef = useRef<any>(null);
  const routeRiskChannelRef = useRef<any>(null);
  const isIntentionallyClosingRef = useRef<boolean>(false);
  const currentStateRef = useRef<string>('');

  // Load advisories for current location on mount
  useEffect(() => {
    loadCurrentLocationAdvisories();
    setupRealtimeSubscriptions();
    
    return () => {
      cleanupRealtimeSubscriptions();
    };
  }, []);

  // Set up real-time subscriptions for travel advisories
  const setupRealtimeSubscriptions = async (): Promise<void> => {
    if (!user?.id) return;

    // Get current location to determine state
    try {
      const location = await locationService.getCurrentLocation();
      if (location?.address) {
        // Extract state from address (simplified - would need better parsing)
        const addressParts = location.address.split(',');
        const state = addressParts[addressParts.length - 2]?.trim() || '';
        currentStateRef.current = state;
      }
    } catch (error) {
      console.error('Error getting location for real-time subscription:', error);
    }

    // Subscribe to travel advisories for current state
    if (currentStateRef.current) {
      setupAdvisoryRealtimeSubscription(currentStateRef.current);
    }

    // Subscribe to route risk data updates
    setupRouteRiskRealtimeSubscription();
  };

  // Set up real-time subscription for travel advisories
  const setupAdvisoryRealtimeSubscription = (state: string): void => {
    if (!user?.id || !state) return;

    // Remove existing subscription
    if (advisoryChannelRef.current) {
      isIntentionallyClosingRef.current = true;
      try {
        supabase.removeChannel(advisoryChannelRef.current);
      } catch (error) {
        console.warn('Error removing existing advisory channel:', error);
      }
      advisoryChannelRef.current = null;
      isIntentionallyClosingRef.current = false;
    }

    const channelName = `travel_advisories:${user.id}:${state}`;
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'travel_advisories',
          filter: `state=eq.${state}`,
        },
        (payload) => {
          if (isIntentionallyClosingRef.current) return;

          const newAdvisory = mapDbRowToAdvisory(payload.new);

          // Only process active advisories
          if (newAdvisory.isActive && newAdvisory.startDate <= new Date().toISOString()) {
            // Add to current location advisories if it matches
            setCurrentLocationAdvisories((prev) => {
              // Check if already exists
              if (prev.some((adv) => adv.id === newAdvisory.id)) {
                return prev;
              }
              return [newAdvisory, ...prev];
            });

            // Notify if high risk
            if ((newAdvisory.riskLevel === 'high' || newAdvisory.riskLevel === 'critical') &&
                !lastNotifiedAdvisories.has(newAdvisory.id)) {
              notifyConnectionsOfNewAdvisories([newAdvisory]);
              setLastNotifiedAdvisories((prev) => {
                const newSet = new Set(prev);
                newSet.add(newAdvisory.id);
                return newSet;
              });
            }

            if (__DEV__) {
              console.log('Real-time travel advisory received:', newAdvisory.title);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'travel_advisories',
          filter: `state=eq.${state}`,
        },
        (payload) => {
          if (isIntentionallyClosingRef.current) return;

          const updatedAdvisory = mapDbRowToAdvisory(payload.new);

          // Update in current location advisories
          setCurrentLocationAdvisories((prev) => {
            const index = prev.findIndex((adv) => adv.id === updatedAdvisory.id);
            if (index >= 0) {
              const newAdvisories = [...prev];
              newAdvisories[index] = updatedAdvisory;
              return newAdvisories;
            }
            // If it's now active and matches, add it
            if (updatedAdvisory.isActive && updatedAdvisory.startDate <= new Date().toISOString()) {
              return [updatedAdvisory, ...prev];
            }
            return prev;
          });

          if (__DEV__) {
            console.log('Real-time travel advisory updated:', updatedAdvisory.title);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (__DEV__) {
            console.log('✅ Successfully subscribed to travel advisories real-time updates');
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to travel advisories real-time updates');
        }
      });

    advisoryChannelRef.current = channel;
  };

  // Set up real-time subscription for route risk data
  const setupRouteRiskRealtimeSubscription = (): void => {
    if (!user?.id) return;

    // Remove existing subscription
    if (routeRiskChannelRef.current) {
      isIntentionallyClosingRef.current = true;
      try {
        supabase.removeChannel(routeRiskChannelRef.current);
      } catch (error) {
        console.warn('Error removing existing route risk channel:', error);
      }
      routeRiskChannelRef.current = null;
      isIntentionallyClosingRef.current = false;
    }

    const channelName = `route_risk:${user.id}`;
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'route_risk_data',
        },
        (payload) => {
          if (isIntentionallyClosingRef.current) return;

          const newData = payload.new as any;
          if (!newData || !newData.id) return;

          // If we have route risk data and it matches, update it
          if (routeRiskData && newData.id === routeRiskData.id) {
            const updatedRouteRisk = mapDbRowToRouteRisk(newData);
            setRouteRiskData(updatedRouteRisk);

            // Notify if risk increased significantly
            if (updatedRouteRisk.riskScore >= 40 && routeRiskData.riskScore < 40) {
              notifyConnectionsOfHighRiskRoute(updatedRouteRisk);
            }

            if (__DEV__) {
              console.log('Real-time route risk updated:', updatedRouteRisk.riskScore);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (__DEV__) {
            console.log('✅ Successfully subscribed to route risk real-time updates');
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to route risk real-time updates');
        }
      });

    routeRiskChannelRef.current = channel;
  };

  // Cleanup real-time subscriptions
  const cleanupRealtimeSubscriptions = (): void => {
    isIntentionallyClosingRef.current = true;
    
    if (advisoryChannelRef.current) {
      try {
        supabase.removeChannel(advisoryChannelRef.current);
      } catch (error) {
        console.warn('Error removing advisory channel during cleanup:', error);
      }
      advisoryChannelRef.current = null;
    }

    if (routeRiskChannelRef.current) {
      try {
        supabase.removeChannel(routeRiskChannelRef.current);
      } catch (error) {
        console.warn('Error removing route risk channel during cleanup:', error);
      }
      routeRiskChannelRef.current = null;
    }

    isIntentionallyClosingRef.current = false;
  };

  // Map database row to TravelAdvisory
  const mapDbRowToAdvisory = (row: any): TravelAdvisory => {
    return {
      id: row.id,
      state: row.state,
      region: row.region || undefined,
      lga: row.lga || undefined,
      riskLevel: row.risk_level,
      advisoryType: row.advisory_type,
      title: row.title,
      description: row.description,
      affectedAreas: row.affected_areas || undefined,
      startDate: row.start_date,
      endDate: row.end_date || undefined,
      isActive: row.is_active,
      source: row.source || undefined,
      createdByUserId: row.created_by_user_id || undefined,
      upvotes: row.upvotes || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  // Map database row to RouteRiskData
  const mapDbRowToRouteRisk = (row: any): RouteRiskData => {
    return {
      id: row.id,
      originState: row.origin_state,
      originCity: row.origin_city || undefined,
      destinationState: row.destination_state,
      destinationCity: row.destination_city || undefined,
      routeCoordinates: row.route_coordinates || undefined,
      riskScore: row.risk_score || 0,
      incidentCount24h: row.incident_count_24h || 0,
      incidentCount7d: row.incident_count_7d || 0,
      incidentCount30d: row.incident_count_30d || 0,
      lastIncidentAt: row.last_incident_at || undefined,
      averageTravelTimeMinutes: row.average_travel_time_minutes || undefined,
      lastUpdated: row.last_updated,
      createdAt: row.created_at,
    };
  };

  // Monitor for new high-risk advisories and notify connections
  useEffect(() => {
    if (currentLocationAdvisories.length > 0 && user?.id) {
      notifyConnectionsOfNewAdvisories();
    }
  }, [currentLocationAdvisories, user?.id]);

  /**
   * Get all connected user IDs
   */
  const getConnectedUserIds = async (): Promise<string[]> => {
    if (!user?.id) return [];

    try {
      const { data: connections1 } = await supabase
        .from('connections')
        .select('connected_user_id')
        .eq('user_id', user.id)
        .eq('status', 'connected');

      const { data: connections2 } = await supabase
        .from('connections')
        .select('user_id')
        .eq('connected_user_id', user.id)
        .eq('status', 'connected');

      const userIds = new Set<string>();
      (connections1 || []).forEach((conn) => {
        if (conn.connected_user_id) userIds.add(conn.connected_user_id);
      });
      (connections2 || []).forEach((conn) => {
        if (conn.user_id) userIds.add(conn.user_id);
      });

      return Array.from(userIds);
    } catch (error) {
      console.error('Error getting connected user IDs:', error);
      return [];
    }
  };

  /**
   * Notify connections of new high-risk advisories
   */
  const notifyConnectionsOfNewAdvisories = async (advisoriesToNotify?: TravelAdvisory[]): Promise<void> => {
    if (!user?.id) return;

    try {
      // Use provided advisories or filter from current location advisories
      const highRiskAdvisories = advisoriesToNotify || currentLocationAdvisories.filter(
        (advisory) =>
          (advisory.riskLevel === 'high' || advisory.riskLevel === 'critical') &&
          !lastNotifiedAdvisories.has(advisory.id)
      );

      if (highRiskAdvisories.length === 0) return;

      const connectedUserIds = await getConnectedUserIds();
      if (connectedUserIds.length === 0) return;

      const userName = user.name || 'Someone';

      // Notify connections about each high-risk advisory
      for (const advisory of highRiskAdvisories) {
        const riskEmoji = advisory.riskLevel === 'critical' ? '🚨' : '⚠️';
        const riskLabel = travelAdvisoryService.getRiskLevelLabel(advisory.riskLevel);

        // Notifications removed - travel advisory data is still tracked

        // Mark as notified
        setLastNotifiedAdvisories((prev) => {
          const newSet = new Set(prev);
          newSet.add(advisory.id);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error notifying connections of advisories:', error);
    }
  };

  const loadCurrentLocationAdvisories = async (): Promise<void> => {
    try {
      setLoading(true);
      const advisories = await travelAdvisoryService.getAdvisoriesForCurrentLocation();
      setCurrentLocationAdvisories(advisories);
    } catch (error) {
      console.error('Error loading current location advisories:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshAdvisories = async (): Promise<void> => {
    await loadCurrentLocationAdvisories();
  };

  const getAdvisoriesForLocation = async (
    state: string,
    region?: string,
    lga?: string
  ): Promise<void> => {
    try {
      setLoading(true);
      const advisories = await travelAdvisoryService.getAdvisoriesForLocation(state, region, lga);
      setAdvisories(advisories);
    } catch (error) {
      console.error('Error getting advisories for location:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRouteRisk = async (
    originState: string,
    destinationState: string,
    originCity?: string,
    destinationCity?: string
  ): Promise<void> => {
    try {
      setLoading(true);
      const riskData = await travelAdvisoryService.getRouteRiskData(
        originState,
        destinationState,
        originCity,
        destinationCity
      );
      setRouteRiskData(riskData);

      // Notify connections if route has high risk
      if (riskData && riskData.riskScore >= 40 && user?.id) {
        await notifyConnectionsOfHighRiskRoute(riskData);
      }
    } catch (error) {
      console.error('Error getting route risk:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Notify connections of high-risk route
   */
  const notifyConnectionsOfHighRiskRoute = async (riskData: RouteRiskData): Promise<void> => {
    if (!user?.id) return;

    try {
      const connectedUserIds = await getConnectedUserIds();
      if (connectedUserIds.length === 0) return;

      const userName = user.name || 'Someone';
      const riskLevel = riskData.riskScore >= 70 ? 'critical' : riskData.riskScore >= 40 ? 'high' : 'moderate';
      const riskEmoji = riskLevel === 'critical' ? '🚨' : '⚠️';

      const routeInfo = `${riskData.originState}${riskData.originCity ? `, ${riskData.originCity}` : ''} → ${riskData.destinationState}${riskData.destinationCity ? `, ${riskData.destinationCity}` : ''}`;

      // Notifications removed - route risk data is still tracked

      await Promise.allSettled(notificationPromises);
    } catch (error) {
      console.error('Error notifying connections of route risk:', error);
    }
  };

  const clearRouteRisk = (): void => {
    setRouteRiskData(null);
  };

  return (
    <TravelAdvisoryContext.Provider
      value={{
        advisories,
        currentLocationAdvisories,
        routeRiskData,
        loading,
        refreshAdvisories,
        getAdvisoriesForLocation,
        getRouteRisk,
        clearRouteRisk,
      }}
    >
      {children}
    </TravelAdvisoryContext.Provider>
  );
};

