import type { FamilyMember, Incident, TimeFilter, DistanceFilter } from '../types';

export const mockFamilyMembers: FamilyMember[] = [
  {
    id: '1',
    name: 'John Doe',
    relationship: 'Me',
    phone: '+1234567890',
    photo: null,
    location: {
      latitude: 37.78825,
      longitude: -122.4324,
    },
    lastSeen: new Date().toISOString(),
    isOnline: true,
    shareLocation: true,
    batteryLevel: 85,
  },
  {
    id: '2',
    name: 'Jane Doe',
    relationship: 'Wife',
    phone: '+1234567891',
    photo: null,
    location: {
      latitude: 37.78925,
      longitude: -122.4334,
    },
    lastSeen: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    isOnline: true,
    shareLocation: true,
    batteryLevel: 72,
  },
  {
    id: '3',
    name: 'Mike Doe',
    relationship: 'Son',
    phone: '+1234567892',
    photo: null,
    location: {
      latitude: 37.79025,
      longitude: -122.4344,
    },
    lastSeen: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    isOnline: true,
    shareLocation: true,
    batteryLevel: 45,
  },
  {
    id: '4',
    name: 'Sarah Doe',
    relationship: 'Daughter',
    phone: '+1234567893',
    photo: null,
    location: {
      latitude: 37.78725,
      longitude: -122.4314,
    },
    lastSeen: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    isOnline: false,
    shareLocation: true,
    batteryLevel: 90,
  },
];

export const mockIncidents: Incident[] = [
  {
    id: '1',
    type: 'Robbery',
    title: 'Robbery reported near Main Street',
    description: 'Armed robbery reported at the convenience store. Suspects fled in a dark sedan.',
    location: {
      latitude: 37.78925,
      longitude: -122.4334,
      address: 'Main Street, San Francisco',
    },
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    reporter: {
      name: 'Anonymous',
      isAnonymous: true,
    },
    upvotes: 12,
    confirmed: true,
    category: 'Robbery',
  },
  {
    id: '2',
    type: 'Accident',
    title: 'Traffic accident on Highway 101',
    description: 'Multi-vehicle accident causing traffic delays. Emergency services on scene.',
    location: {
      latitude: 37.79025,
      longitude: -122.4344,
      address: 'Highway 101, San Francisco',
    },
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    reporter: {
      name: 'John Smith',
      isAnonymous: false,
    },
    upvotes: 8,
    confirmed: true,
    category: 'Accident',
  },
  {
    id: '3',
    type: 'Fire',
    title: 'Building fire reported',
    description: 'Smoke and flames visible from 3rd floor. Fire department responding.',
    location: {
      latitude: 37.78725,
      longitude: -122.4314,
      address: 'Oak Avenue, San Francisco',
    },
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    reporter: {
      name: 'Anonymous',
      isAnonymous: true,
    },
    upvotes: 15,
    confirmed: true,
    category: 'Fire',
  },
  {
    id: '4',
    type: 'Protest',
    title: 'Protest gathering downtown',
    description: 'Large crowd gathering for peaceful protest. Expect traffic delays.',
    location: {
      latitude: 37.78525,
      longitude: -122.4304,
      address: 'Downtown Plaza, San Francisco',
    },
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    reporter: {
      name: 'Mary Johnson',
      isAnonymous: false,
    },
    upvotes: 5,
    confirmed: false,
    category: 'Protest',
  },
  {
    id: '5',
    type: 'Kidnapping',
    title: 'Suspicious activity reported',
    description: 'Witness reported suspicious vehicle following pedestrians. Police notified.',
    location: {
      latitude: 37.79225,
      longitude: -122.4354,
      address: 'Park Street, San Francisco',
    },
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    reporter: {
      name: 'Anonymous',
      isAnonymous: true,
    },
    upvotes: 20,
    confirmed: true,
    category: 'Kidnapping',
  },
];

export const incidentCategories: string[] = [
  'Robbery',
  'Kidnapping',
  'Accident',
  'Fire',
  'Protest',
  'Assault',
  'Theft',
  'Other',
];

export const timeFilters: TimeFilter[] = [
  { label: '5 min', value: '5min' },
  { label: '30 min', value: '30min' },
  { label: '1 hr', value: '1hr' },
  { label: '24 hr', value: '24hr' },
];

export const distanceFilters: DistanceFilter[] = [
  { label: '1 km', value: 1 },
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: 'City', value: 50 },
];

