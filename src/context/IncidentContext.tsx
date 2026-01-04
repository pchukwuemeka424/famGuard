import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { supabase, hasValidSupabaseConfig } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { locationService } from '../services/locationService';
import { incidentProximityService } from '../services/incidentProximityService';
import { logger } from '../utils/logger';
import type { Incident, Location } from '../types';

interface IncidentContextType {
  incidents: Incident[];
  userLocation: Location;
  setUserLocation: (location: Location) => void;
  addIncident: (incident: Omit<Incident, 'id' | 'createdAt' | 'upvotes' | 'confirmed'>) => Promise<void>;
  upvoteIncident: (incidentId: string) => Promise<void>;
  getNearbyIncidents: (timeFilter?: string, distanceFilter?: number) => Incident[];
  fetchNearbyIncidents: (timeFilter?: string, distanceFilter?: number) => Promise<void>;
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number;
  loading: boolean;
  refreshIncidents: () => Promise<void>;
}

const IncidentContext = createContext<IncidentContextType | undefined>(undefined);

export const useIncidents = (): IncidentContextType => {
  const context = useContext(IncidentContext);
  if (!context) {
    throw new Error('useIncidents must be used within IncidentProvider');
  }
  return context;
};

interface IncidentProviderProps {
  children: ReactNode;
}

type TimeFilterKey = '5min' | '30min' | '1hr' | '24hr';

// Helper function to convert database row to Incident type
const mapDbRowToIncident = (row: any): Incident => ({
  id: row.id,
  type: row.type,
  category: row.category,
  title: row.title,
  description: row.description,
  location: {
    latitude: row.location_latitude,
    longitude: row.location_longitude,
    address: row.location_address || undefined,
  },
  createdAt: row.created_at,
  reporter: {
    name: row.reporter_name,
    isAnonymous: row.reporter_is_anonymous,
  },
  upvotes: row.upvotes || 0,
  confirmed: row.confirmed || false,
});

export const IncidentProvider: React.FC<IncidentProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userLocation, setUserLocation] = useState<Location>({
    latitude: 37.78825,
    longitude: -122.4324,
  });

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Fetch incidents from Supabase (all incidents)
  const fetchIncidents = async (): Promise<void> => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('incidents')
        .select('id, user_id, type, category, title, description, location_latitude, location_longitude, location_address, reporter_name, reporter_is_anonymous, upvotes, confirmed, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100); // Limit to recent 100 incidents

      if (error) {
        console.error('Error fetching incidents:', error);
        return;
      }

      if (data) {
        const mappedIncidents = data.map(mapDbRowToIncident);
        setIncidents(mappedIncidents);
      }
    } catch (error) {
      console.error('Error in fetchIncidents:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch nearby incidents based on proximity and time filter
  const fetchNearbyIncidents = async (timeFilter: string = '1hr', distanceFilter: number = 5): Promise<void> => {
    try {
      setLoading(true);
      
      // Check if Supabase is configured
      if (!hasValidSupabaseConfig) {
        // Silently skip - warning already shown in supabase.ts
        setIncidents([]);
        return;
      }
      
      // Convert time filter to hours
      const timeFilters: Record<TimeFilterKey, number> = {
        '5min': 5 / 60, // 5 minutes = 0.083 hours
        '30min': 30 / 60, // 30 minutes = 0.5 hours
        '1hr': 1,
        '24hr': 24,
      };
      
      const maxHours = timeFilters[timeFilter as TimeFilterKey] || timeFilters['1hr'];
      const maxDistanceKm = distanceFilter;

      // Calculate time threshold
      const timeThreshold = new Date();
      timeThreshold.setHours(timeThreshold.getHours() - maxHours);

      // Fetch incidents within time range
      let query = supabase
        .from('incidents')
        .select('id, user_id, type, category, title, description, location_latitude, location_longitude, location_address, reporter_name, reporter_is_anonymous, upvotes, confirmed, created_at, updated_at')
        .gte('created_at', timeThreshold.toISOString())
        .order('created_at', { ascending: false })
        .limit(200); // Get more to filter by distance

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching nearby incidents:', error?.message || error?.code || String(error));
        setIncidents([]);
        return;
      }

      if (data) {
        // Filter by distance using the calculateDistance function
        const nearbyIncidents = data
          .map(mapDbRowToIncident)
          .filter(incident => {
            const distance = calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              incident.location.latitude,
              incident.location.longitude
            );
            return distance <= maxDistanceKm;
          })
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        console.log(`Fetched ${nearbyIncidents.length} nearby incidents (within ${maxDistanceKm}km, last ${timeFilter})`);
        setIncidents(nearbyIncidents);
      }
    } catch (error) {
      console.error('Error in fetchNearbyIncidents:', error);
    } finally {
      setLoading(false);
    }
  };

  // Removed automatic location loading on mount
  // Location will only be requested when user explicitly enables location sharing
  // Fetch incidents without location (will use default location if needed)
  useEffect(() => {
    // Fetch nearby incidents with default filters (without requesting location)
    fetchNearbyIncidents('1hr', 5).catch((error) => {
      console.error('Error fetching incidents:', error);
    });

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('incidents_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents',
        },
        () => {
          // Refresh incidents when changes occur (with current filters)
          // Note: We don't have access to current filters here, so we'll use defaults
          // The screen will handle refreshing with correct filters
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const addIncident = async (incident: Omit<Incident, 'id' | 'createdAt' | 'upvotes' | 'confirmed'>): Promise<void> => {
    if (!user) {
      throw new Error('User must be authenticated to report an incident');
    }

    // Validate location data
    if (!incident.location || typeof incident.location.latitude !== 'number' || typeof incident.location.longitude !== 'number') {
      throw new Error('Valid location (latitude and longitude) is required');
    }

    try {
      const insertData = {
        user_id: user.id,
        type: incident.type,
        category: incident.category,
        title: incident.title,
        description: incident.description,
        location_latitude: incident.location.latitude,
        location_longitude: incident.location.longitude,
        location_address: incident.location.address || null,
        reporter_name: incident.reporter.name,
        reporter_is_anonymous: incident.reporter.isAnonymous,
        upvotes: 0,
        confirmed: false,
      };

      // Log the data being inserted for debugging
      console.log('Inserting incident with location:', {
        latitude: insertData.location_latitude,
        longitude: insertData.location_longitude,
        address: insertData.location_address,
      });

      const { data, error } = await supabase
        .from('incidents')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error adding incident:', error);
        console.error('Failed insert data:', insertData);
        throw new Error(error.message || 'Failed to add incident');
      }

      if (data) {
        console.log('Incident inserted successfully:', {
          id: data.id,
          location_latitude: data.location_latitude,
          location_longitude: data.location_longitude,
          location_address: data.location_address,
        });
        const newIncident = mapDbRowToIncident(data);
        setIncidents([newIncident, ...incidents]);

        // Immediately trigger proximity check to notify nearby users
        console.log('🚨 Triggering immediate proximity check for new incident...');
        incidentProximityService.triggerCheck().catch((error) => {
          console.error('Error triggering proximity check after incident creation:', error);
        });
      }
    } catch (error) {
      console.error('Error in addIncident:', error);
      throw error;
    }
  };

  const upvoteIncident = async (incidentId: string): Promise<void> => {
    try {
      // Get current incident
      const incident = incidents.find(i => i.id === incidentId);
      if (!incident) {
        throw new Error('Incident not found');
      }

      const newUpvotes = incident.upvotes + 1;

      const { error } = await supabase
        .from('incidents')
        .update({ upvotes: newUpvotes })
        .eq('id', incidentId);

      if (error) {
        console.error('Error upvoting incident:', error);
        throw new Error(error.message || 'Failed to upvote incident');
      }

      // Update local state
      setIncidents(incidents.map(i =>
        i.id === incidentId ? { ...i, upvotes: newUpvotes } : i
      ));
    } catch (error) {
      console.error('Error in upvoteIncident:', error);
      throw error;
    }
  };

  const getNearbyIncidents = (timeFilter: string = '1hr', distanceFilter: number = 5): Incident[] => {
    const now = new Date();
    const timeFilters: Record<TimeFilterKey, number> = {
      '5min': 5 * 60 * 1000,
      '30min': 30 * 60 * 1000,
      '1hr': 60 * 60 * 1000,
      '24hr': 24 * 60 * 60 * 1000,
    };

    const timeLimit = timeFilters[timeFilter as TimeFilterKey] || timeFilters['1hr'];
    const timeLimitMs = timeLimit;

    return incidents.filter(incident => {
      const incidentTime = new Date(incident.createdAt);
      const timeDiff = now.getTime() - incidentTime.getTime();

      if (timeDiff > timeLimitMs) return false;

      // Calculate distance (simple haversine approximation)
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        incident.location.latitude,
        incident.location.longitude
      );

      return distance <= distanceFilter;
    });
  };

  const refreshIncidents = async (): Promise<void> => {
    await fetchIncidents();
  };

  return (
    <IncidentContext.Provider
      value={{
        incidents,
        userLocation,
        setUserLocation,
        addIncident,
        upvoteIncident,
        getNearbyIncidents,
        fetchNearbyIncidents,
        calculateDistance,
        loading,
        refreshIncidents,
      }}
    >
      {children}
    </IncidentContext.Provider>
  );
};

