import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useTravelAdvisory } from '../context/TravelAdvisoryContext';
import { travelAdvisoryService } from '../services/travelAdvisoryService';
import type { RootStackParamList, TravelAdvisory, RouteRiskData } from '../types';

type TravelAdvisoryScreenNavigationProp = StackNavigationProp<RootStackParamList, 'TravelAdvisory'>;

interface TravelAdvisoryScreenProps {
  navigation: TravelAdvisoryScreenNavigationProp;
}

export default function TravelAdvisoryScreen({ navigation }: TravelAdvisoryScreenProps) {
  const {
    currentLocationAdvisories,
    routeRiskData,
    loading,
    refreshAdvisories,
    getRouteRisk,
    clearRouteRisk,
  } = useTravelAdvisory();
  const [originState, setOriginState] = useState<string>('');
  const [destinationState, setDestinationState] = useState<string>('');
  const [originCity, setOriginCity] = useState<string>('');
  const [destinationCity, setDestinationCity] = useState<string>('');
  const [showRouteForm, setShowRouteForm] = useState<boolean>(false);
  const [calculatingRoute, setCalculatingRoute] = useState<boolean>(false);

  useEffect(() => {
    refreshAdvisories();
  }, []);

  const handleCalculateRoute = async (): Promise<void> => {
    if (!originState || !destinationState) {
      Alert.alert('Error', 'Please enter both origin and destination states.');
      return;
    }

    try {
      setCalculatingRoute(true);
      await getRouteRisk(originState, destinationState, originCity || undefined, destinationCity || undefined);
    } catch (error) {
      Alert.alert('Error', 'Failed to calculate route risk. Please try again.');
    } finally {
      setCalculatingRoute(false);
    }
  };

  const getRiskLevelColor = (riskLevel: TravelAdvisory['riskLevel']): string => {
    return travelAdvisoryService.getRiskLevelColor(riskLevel);
  };

  const getRiskLevelLabel = (riskLevel: TravelAdvisory['riskLevel']): string => {
    return travelAdvisoryService.getRiskLevelLabel(riskLevel);
  };

  const getAdvisoryIcon = (advisoryType: TravelAdvisory['advisoryType']): keyof typeof Ionicons.glyphMap => {
    const icons = {
      security: 'shield',
      weather: 'cloud',
      combined: 'warning',
    };
    return icons[advisoryType] || 'alert-circle';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Travel Advisories</Text>
          <Text style={styles.headerSubtitle}>Stay informed about travel risks</Text>
        </View>
        <TouchableOpacity
          onPress={refreshAdvisories}
          style={styles.refreshButton}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Route Risk Calculator */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.routeToggle}
            onPress={() => setShowRouteForm(!showRouteForm)}
            activeOpacity={0.7}
          >
            <View style={styles.routeToggleContent}>
              <Ionicons name="map" size={20} color="#007AFF" />
              <Text style={styles.routeToggleText}>Calculate Route Risk</Text>
            </View>
            <Ionicons
              name={showRouteForm ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>

          {showRouteForm && (
            <View style={styles.routeForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Origin State *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Lagos"
                  value={originState}
                  onChangeText={setOriginState}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Origin City (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Ikeja"
                  value={originCity}
                  onChangeText={setOriginCity}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Destination State *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Abuja"
                  value={destinationState}
                  onChangeText={setDestinationState}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Destination City (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Garki"
                  value={destinationCity}
                  onChangeText={setDestinationCity}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <TouchableOpacity
                style={[styles.calculateButton, calculatingRoute && styles.buttonDisabled]}
                onPress={handleCalculateRoute}
                disabled={calculatingRoute}
                activeOpacity={0.8}
              >
                {calculatingRoute ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="analytics" size={20} color="#FFFFFF" />
                    <Text style={styles.calculateButtonText}>Calculate Risk</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Route Risk Result */}
          {routeRiskData && (
            <View style={styles.routeRiskCard}>
              <View style={styles.routeRiskHeader}>
                <Ionicons name="analytics" size={24} color="#007AFF" />
                <Text style={styles.routeRiskTitle}>Route Risk Assessment</Text>
                <TouchableOpacity onPress={clearRouteRisk} style={styles.closeButton}>
                  <Ionicons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <View style={styles.routeRiskContent}>
                <View style={styles.riskScoreContainer}>
                  <Text style={styles.riskScoreLabel}>Risk Score</Text>
                  <View
                    style={[
                      styles.riskScoreCircle,
                      { borderColor: travelAdvisoryService.getRiskScoreColor(routeRiskData.riskScore) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.riskScoreValue,
                        { color: travelAdvisoryService.getRiskScoreColor(routeRiskData.riskScore) },
                      ]}
                    >
                      {Math.round(routeRiskData.riskScore)}
                    </Text>
                  </View>
                </View>
                <View style={styles.incidentStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{routeRiskData.incidentCount24h}</Text>
                    <Text style={styles.statLabel}>Last 24h</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{routeRiskData.incidentCount7d}</Text>
                    <Text style={styles.statLabel}>Last 7 days</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{routeRiskData.incidentCount30d}</Text>
                    <Text style={styles.statLabel}>Last 30 days</Text>
                  </View>
                </View>
                <View style={styles.routeInfo}>
                  <Text style={styles.routeInfoText}>
                    {routeRiskData.originState}
                    {routeRiskData.originCity ? `, ${routeRiskData.originCity}` : ''}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#6B7280" />
                  <Text style={styles.routeInfoText}>
                    {routeRiskData.destinationState}
                    {routeRiskData.destinationCity ? `, ${routeRiskData.destinationCity}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Current Location Advisories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advisories for Your Location</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : currentLocationAdvisories.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={styles.emptyStateText}>No active advisories</Text>
              <Text style={styles.emptyStateSubtext}>Your current location appears safe</Text>
            </View>
          ) : (
            currentLocationAdvisories.map((advisory) => (
              <View key={advisory.id} style={styles.advisoryCard}>
                <View style={styles.advisoryHeader}>
                  <View
                    style={[
                      styles.riskBadge,
                      { backgroundColor: getRiskLevelColor(advisory.riskLevel) },
                    ]}
                  >
                    <Ionicons
                      name={getAdvisoryIcon(advisory.advisoryType)}
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.riskBadgeText}>
                      {getRiskLevelLabel(advisory.riskLevel)}
                    </Text>
                  </View>
                  <Text style={styles.advisoryType}>{advisory.advisoryType.toUpperCase()}</Text>
                </View>
                <Text style={styles.advisoryTitle}>{advisory.title}</Text>
                <Text style={styles.advisoryDescription}>{advisory.description}</Text>
                {advisory.affectedAreas && advisory.affectedAreas.length > 0 && (
                  <View style={styles.affectedAreas}>
                    <Text style={styles.affectedAreasLabel}>Affected Areas:</Text>
                    <Text style={styles.affectedAreasText}>
                      {advisory.affectedAreas.join(', ')}
                    </Text>
                  </View>
                )}
                <View style={styles.advisoryFooter}>
                  <View style={styles.advisoryMeta}>
                    <Ionicons name="location" size={14} color="#6B7280" />
                    <Text style={styles.advisoryMetaText}>
                      {advisory.state}
                      {advisory.region ? `, ${advisory.region}` : ''}
                    </Text>
                  </View>
                  <View style={styles.advisoryMeta}>
                    <Ionicons name="calendar" size={14} color="#6B7280" />
                    <Text style={styles.advisoryMetaText}>
                      {formatDate(advisory.startDate)}
                      {advisory.endDate ? ` - ${formatDate(advisory.endDate)}` : ''}
                    </Text>
                  </View>
                </View>
                {advisory.source && (
                  <Text style={styles.advisorySource}>Source: {advisory.source}</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 20,
  },
  routeToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
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
  },
  routeToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  routeForm: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    gap: 16,
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
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  calculateButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  calculateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  routeRiskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  routeRiskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  routeRiskTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeRiskContent: {
    gap: 16,
  },
  riskScoreContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  riskScoreLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  riskScoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskScoreValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  incidentStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  advisoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
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
  },
  advisoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  riskBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  advisoryType: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  advisoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  advisoryDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  affectedAreas: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  affectedAreasLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  affectedAreasText: {
    fontSize: 13,
    color: '#92400E',
  },
  advisoryFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  advisoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  advisoryMetaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  advisorySource: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 8,
    fontStyle: 'italic',
  },
});




