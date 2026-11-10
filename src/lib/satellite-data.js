// TLE sets come from our Worker, which caches CelesTrak. No API key.

import { CELESTRAK_GROUPS } from './celestrak-groups.js';

export const SATELLITE_GROUPS = {
  starlink: {
    label: 'Starlink',
    color: '#00e5ff',
    icon: '🛰️',
  },
  stations: {
    label: 'Space Stations',
    color: '#ff6b35',
    icon: '🏠',
  },
  active: {
    label: 'Active Sats',
    color: '#76ff03',
    icon: '📡',
  },
  gps: {
    label: 'GPS',
    color: '#ffd600',
    icon: '🧭',
  },
  weather: {
    label: 'Weather',
    color: '#e040fb',
    icon: '🌤️',
  },
  science: {
    label: 'Science',
    color: '#18ffff',
    icon: '🔬',
  },
};

export async function fetchSatelliteGroup(groupKey) {
  if (!CELESTRAK_GROUPS[groupKey] || !SATELLITE_GROUPS[groupKey]) {
    throw new Error('Unknown satellite group');
  }

  const response = await fetch(`/api/tle?group=${encodeURIComponent(groupKey)}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Could not load this group');
  }
  const text = await response.text();
  if (!text.trim()) throw new Error('Could not load this group');
  return text;
}
