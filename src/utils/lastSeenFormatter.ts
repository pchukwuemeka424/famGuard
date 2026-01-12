/**
 * Utility functions for formatting and displaying detailed "last seen" information
 */

export interface LastSeenInfo {
  timestamp: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  isOnline: boolean;
  batteryLevel?: number;
}

export interface FormattedLastSeen {
  // Primary display text
  primaryText: string;
  // Secondary detail text (e.g., location, battery)
  secondaryText?: string;
  // Status indicator
  status: 'online' | 'recently_active' | 'away' | 'offline';
  // Relative time (e.g., "2 minutes ago")
  relativeTime: string;
  // Exact time (e.g., "Today at 3:45 PM")
  exactTime: string;
  // Full date time (e.g., "January 15, 2025 at 3:45 PM")
  fullDateTime: string;
  // Time in milliseconds since last seen
  timeSinceMs: number;
  // Whether to show as urgent (e.g., offline for too long)
  isUrgent: boolean;
}

/**
 * Format last seen information with detailed context
 */
export function formatLastSeen(info: LastSeenInfo): FormattedLastSeen {
  const now = Date.now();
  const lastSeenTime = new Date(info.timestamp).getTime();
  const timeSinceMs = now - lastSeenTime;
  
  // Calculate time differences
  const seconds = Math.floor(timeSinceMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  // Determine status
  let status: 'online' | 'recently_active' | 'away' | 'offline';
  if (info.isOnline && minutes < 5) {
    status = 'online';
  } else if (minutes < 30) {
    status = 'recently_active';
  } else if (hours < 24) {
    status = 'away';
  } else {
    status = 'offline';
  }

  // Format relative time
  let relativeTime: string;
  if (seconds < 60) {
    relativeTime = 'just now';
  } else if (minutes < 60) {
    relativeTime = minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  } else if (hours < 24) {
    relativeTime = hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  } else if (days < 7) {
    relativeTime = days === 1 ? '1 day ago' : `${days} days ago`;
  } else if (weeks < 4) {
    relativeTime = weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else if (months < 12) {
    relativeTime = months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    relativeTime = years === 1 ? '1 year ago' : `${years} years ago`;
  }

  // Format exact time
  const lastSeenDate = new Date(info.timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if it's today, yesterday, or another day
  const isToday = lastSeenDate.toDateString() === today.toDateString();
  const isYesterday = lastSeenDate.toDateString() === yesterday.toDateString();

  let exactTime: string;
  if (isToday) {
    exactTime = `Today at ${formatTime(lastSeenDate)}`;
  } else if (isYesterday) {
    exactTime = `Yesterday at ${formatTime(lastSeenDate)}`;
  } else if (days < 7) {
    exactTime = `${lastSeenDate.toLocaleDateString('en-US', { weekday: 'long' })} at ${formatTime(lastSeenDate)}`;
  } else {
    exactTime = `${lastSeenDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${formatTime(lastSeenDate)}`;
  }

  // Format full date time
  const fullDateTime = lastSeenDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Primary display text
  let primaryText: string;
  if (status === 'online') {
    primaryText = 'Online now';
  } else if (status === 'recently_active') {
    primaryText = `Active ${relativeTime}`;
  } else {
    primaryText = `Last seen ${relativeTime}`;
  }

  // Secondary text (location, battery, etc.)
  let secondaryText: string | undefined;
  const secondaryParts: string[] = [];

  if (info.location?.address) {
    secondaryParts.push(`📍 ${info.location.address}`);
  }

  if (info.batteryLevel !== undefined) {
    const batteryEmoji = info.batteryLevel > 50 ? '🔋' : info.batteryLevel > 20 ? '🪫' : '⚠️';
    secondaryParts.push(`${batteryEmoji} ${info.batteryLevel}%`);
  }

  if (secondaryParts.length > 0) {
    secondaryText = secondaryParts.join(' • ');
  }

  // Determine if urgent (offline for more than 24 hours)
  const isUrgent = status === 'offline' && days >= 1;

  return {
    primaryText,
    secondaryText,
    status,
    relativeTime,
    exactTime,
    fullDateTime,
    timeSinceMs,
    isUrgent,
  };
}

/**
 * Format time in 12-hour format
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get status color for status indicator
 */
export function getStatusColor(status: FormattedLastSeen['status']): string {
  switch (status) {
    case 'online':
      return '#10B981'; // Green
    case 'recently_active':
      return '#3B82F6'; // Blue
    case 'away':
      return '#F59E0B'; // Amber
    case 'offline':
      return '#6B7280'; // Gray
    default:
      return '#6B7280';
  }
}

/**
 * Get status icon name
 */
export function getStatusIcon(status: FormattedLastSeen['status']): string {
  switch (status) {
    case 'online':
      return 'radio-button-on';
    case 'recently_active':
      return 'time';
    case 'away':
      return 'moon';
    case 'offline':
      return 'radio-button-off';
    default:
      return 'radio-button-off';
  }
}

/**
 * Format duration (e.g., "2h 30m" or "3d 5h")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}
