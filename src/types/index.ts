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
}

export interface AppSetting {
  id: string;
  hide_report_incident: boolean;
  hide_incident: boolean;
  sos_lock: boolean;
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
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Incidents: undefined;
  Connections: undefined;
  Profile: undefined;
};

