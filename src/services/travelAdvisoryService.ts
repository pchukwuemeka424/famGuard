import { supabase, hasValidSupabaseConfig } from '../lib/supabase';
import { locationService } from './locationService';
import { logger } from '../utils/logger';
import type { TravelAdvisory, RouteRiskData, Location } from '../types';

class TravelAdvisoryService {
  /**
   * Get travel advisories for a specific location
   */
  async getAdvisoriesForLocation(
    state: string,
    region?: string,
    lga?: string
  ): Promise<TravelAdvisory[]> {
    try {
      // Check if Supabase is configured
      if (!hasValidSupabaseConfig) {
        // Silently return empty - warning already shown in supabase.ts
        return [];
      }

      let query = supabase
        .from('travel_advisories')
        .select('*')
        .eq('state', state)
        .eq('is_active', true)
        .lte('start_date', new Date().toISOString())
        .or(`end_date.is.null,end_date.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false });

      if (region) {
        query = query.or(`region.eq.${region},region.is.null`);
      }

      if (lga) {
        query = query.or(`lga.eq.${lga},lga.is.null`);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching travel advisories:', error?.message || error?.code || String(error));
        return [];
      }

      return (data || []).map(this.mapDbRowToAdvisory);
    } catch (error: any) {
      logger.error('Error in getAdvisoriesForLocation:', error?.message || String(error));
      return [];
    }
  }

  /**
   * Get travel advisories for current user location
   */
  async getAdvisoriesForCurrentLocation(): Promise<TravelAdvisory[]> {
    try {
      const location = await locationService.getCurrentLocation();
      if (!location || !location.address) {
        return [];
      }

      // Extract state from address (simplified - would need better parsing)
      const addressParts = location.address.split(',');
      const state = addressParts[addressParts.length - 2]?.trim() || '';

      if (!state) {
        return [];
      }

      return this.getAdvisoriesForLocation(state);
    } catch (error) {
      console.error('Error getting advisories for current location:', error);
      return [];
    }
  }

  /**
   * Get route risk data between two locations
   */
  async getRouteRiskData(
    originState: string,
    destinationState: string,
    originCity?: string,
    destinationCity?: string
  ): Promise<RouteRiskData | null> {
    try {
      let query = supabase
        .from('route_risk_data')
        .select('*')
        .eq('origin_state', originState)
        .eq('destination_state', destinationState);

      if (originCity) {
        query = query.eq('origin_city', originCity);
      }

      if (destinationCity) {
        query = query.eq('destination_city', destinationCity);
      }

      const { data, error } = await query.order('last_updated', { ascending: false }).limit(1);

      if (error) {
        console.error('Error fetching route risk data:', error);
        return null;
      }

      if (data && data.length > 0) {
        return this.mapDbRowToRouteRisk(data[0]);
      }

      // If no existing data, calculate and create new route risk
      return this.calculateAndSaveRouteRisk(
        originState,
        destinationState,
        originCity,
        destinationCity
      );
    } catch (error) {
      console.error('Error in getRouteRiskData:', error);
      return null;
    }
  }

  /**
   * Calculate and save route risk data
   */
  private async calculateAndSaveRouteRisk(
    originState: string,
    destinationState: string,
    originCity?: string,
    destinationCity?: string
  ): Promise<RouteRiskData | null> {
    try {
      // Call database function to calculate risk
      const { data, error } = await supabase.rpc('calculate_route_risk', {
        p_origin_state: originState,
        p_destination_state: destinationState,
        p_origin_city: originCity || null,
        p_destination_city: destinationCity || null,
      });

      if (error) {
        console.error('Error calculating route risk:', error);
        return null;
      }

      const riskScore = data || 0;

      // Get incident counts
      const { count: count24h } = await supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const { count: count7d } = await supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const { count: count30d } = await supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      // Save route risk data
      const { data: savedData, error: saveError } = await supabase
        .from('route_risk_data')
        .insert({
          origin_state: originState,
          origin_city: originCity || null,
          destination_state: destinationState,
          destination_city: destinationCity || null,
          risk_score: riskScore,
          incident_count_24h: count24h || 0,
          incident_count_7d: count7d || 0,
          incident_count_30d: count30d || 0,
          last_updated: new Date().toISOString(),
        })
        .select()
        .single();

      if (saveError) {
        console.error('Error saving route risk data:', saveError);
        return null;
      }

      return savedData ? this.mapDbRowToRouteRisk(savedData) : null;
    } catch (error) {
      console.error('Error in calculateAndSaveRouteRisk:', error);
      return null;
    }
  }

  /**
   * Get risk level color
   */
  getRiskLevelColor(riskLevel: TravelAdvisory['riskLevel']): string {
    const colors = {
      low: '#10B981', // Green
      moderate: '#F59E0B', // Yellow/Orange
      high: '#EF4444', // Red
      critical: '#DC2626', // Dark Red
    };
    return colors[riskLevel] || '#6B7280';
  }

  /**
   * Get risk level label
   */
  getRiskLevelLabel(riskLevel: TravelAdvisory['riskLevel']): string {
    const labels = {
      low: 'Low Risk',
      moderate: 'Moderate Risk',
      high: 'High Risk',
      critical: 'Critical Risk',
    };
    return labels[riskLevel] || 'Unknown';
  }

  /**
   * Get risk score color (0-100)
   */
  getRiskScoreColor(score: number): string {
    if (score >= 70) return '#DC2626'; // Critical
    if (score >= 40) return '#EF4444'; // High
    if (score >= 20) return '#F59E0B'; // Moderate
    return '#10B981'; // Low
  }

  /**
   * Map database row to TravelAdvisory
   */
  private mapDbRowToAdvisory(row: any): TravelAdvisory {
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
  }

  /**
   * Map database row to RouteRiskData
   */
  private mapDbRowToRouteRisk(row: any): RouteRiskData {
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
  }
}

export const travelAdvisoryService = new TravelAdvisoryService();


