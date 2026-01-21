export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo: string | null;
  bloodGroup: string | null;
  emergencyNotes: string | null;
  isGroupAdmin: boolean;
  isLocked?: boolean;
}

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface FamilyMember {
  id: string;
  userId?: string; // User ID to identify the current user
  name: string;
  relationship: string;
  phone: string;
  photo: string | null;
  location: Location;
  lastSeen: string;
  isOnline: boolean;
  shareLocation: boolean;
  batteryLevel: number;
  // Enhanced last seen information
  lastSeenLocation?: Location; // Location where they were last seen
  lastSeenAddress?: string; // Address where they were last seen
}

export interface IncidentReporter {
  name: string;
  isAnonymous: boolean;
}

export interface Incident {
  id: string;
  type: string;
  title: string;
  description: string;
  location: Location;
  createdAt: string;
  reporter: IncidentReporter;
  upvotes: number;
  confirmed: boolean;
  category: string;
}

export interface TimeFilter {
  label: string;
  value: string;
}

export interface DistanceFilter {
  label: string;
  value: number;
}

export interface Connection {
  id: string;
  userId: string;
  connectedUserId: string;
  connectedUserName: string;
  connectedUserEmail: string | null;
  connectedUserPhone: string | null;
  connectedUserPhoto: string | null;
  status: 'connected' | 'blocked';
  location: Location | null;
  locationUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isLocked?: boolean;
  locationSharingEnabled?: boolean;
}

export interface AppSetting {
  id: string;
  hide_report_incident: boolean;
  hide_incident: boolean;
  sos_lock: boolean;
  force_update_required: boolean;
  app_update_notification_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  MainTabs: undefined;
  Locked: undefined;
  ReportIncident: undefined;
  IncidentDetail: { incident: Incident };
  Connections: undefined;
  MapView: { location: Location; title?: string; showUserLocation?: boolean; userId?: string };
  Notifications: undefined;
  EditProfile: undefined;
  EmergencyNotes: undefined;
  LocationAccuracy: undefined;
  SleepMode: undefined;
  NotificationFilters: undefined;
  LanguageRegion: undefined;
  Units: undefined;
  BatterySaving: undefined;
  LocationUpdateFrequency: undefined;
  HelpSupport: undefined;
  UserManual: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  TravelAdvisory: undefined;
  CheckIn: undefined;
  CheckInSettings: undefined;
  OfflineMaps: undefined;
  Update: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Incidents: undefined;
  Connections: undefined;
  Profile: undefined;
};

export interface TravelAdvisory {
  id: string;
  state: string;
  region?: string;
  lga?: string;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  advisoryType: 'security' | 'weather' | 'combined';
  title: string;
  description: string;
  affectedAreas?: string[];
  startDate: string;
  endDate?: string;
  isActive: boolean;
  source?: string;
  createdByUserId?: string;
  upvotes: number;
  createdAt: string;
  updatedAt: string;
}

export interface RouteRiskData {
  id: string;
  originState: string;
  originCity?: string;
  destinationState: string;
  destinationCity?: string;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  riskScore: number; // 0-100
  incidentCount24h: number;
  incidentCount7d: number;
  incidentCount30d: number;
  lastIncidentAt?: string;
  averageTravelTimeMinutes?: number;
  lastUpdated: string;
  createdAt: string;
}

export interface UserCheckIn {
  id: string;
  userId: string;
  checkInType: 'manual' | 'automatic' | 'scheduled' | 'emergency';
  location?: Location;
  status: 'safe' | 'unsafe' | 'delayed' | 'missed';
  message?: string;
  nextCheckInDueAt?: string;
  isEmergency: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CheckInSettings {
  id: string;
  userId: string;
  enabled: boolean;
  checkInIntervalMinutes: number;
  autoCheckInEnabled: boolean;
  autoCheckInDuringTravel: boolean;
  travelSpeedThresholdKmh: number;
  missedCheckInAlertMinutes: number;
  emergencyContacts: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OfflineMap {
  id: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
  zoomLevel: number;
  sizeBytes: number;
  tileCount: number;
  downloadedAt: string;
  expiresAt?: string;
}

export interface OfflineMapDownloadProgress {
  mapId: string;
  downloadedTiles: number;
  totalTiles: number;
  percentage: number;
  estimatedTimeRemaining?: number;
}

export interface ConnectionInvitation {
  id: string;
  inviterUserId: string;
  inviterName: string;
  inviterPhone?: string;
  inviterEmail?: string;
  inviterPhoto?: string;
  inviteePhone: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

