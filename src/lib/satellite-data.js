// Fetches satellite TLE data from public CelesTrak API (no API key needed)

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';

export const SATELLITE_GROUPS = {
  starlink: {
    label: 'Starlink',
    url: `${CELESTRAK_BASE}?GROUP=starlink&FORMAT=tle`,
    color: '#00e5ff',
    icon: '🛰️',
  },
  stations: {
    label: 'Space Stations',
    url: `${CELESTRAK_BASE}?GROUP=stations&FORMAT=tle`,
    color: '#ff6b35',
    icon: '🏠',
  },
  active: {
    label: 'Active Sats',
    url: `${CELESTRAK_BASE}?GROUP=active&FORMAT=tle`,
    color: '#76ff03',
    icon: '📡',
  },
  gps: {
    label: 'GPS',
    url: `${CELESTRAK_BASE}?GROUP=gps-ops&FORMAT=tle`,
    color: '#ffd600',
    icon: '🧭',
  },
  weather: {
    label: 'Weather',
    url: `${CELESTRAK_BASE}?GROUP=weather&FORMAT=tle`,
    color: '#e040fb',
    icon: '🌤️',
  },
  science: {
    label: 'Science',
    url: `${CELESTRAK_BASE}?GROUP=science&FORMAT=tle`,
    color: '#18ffff',
    icon: '🔬',
  },
};

// Cache for TLE data
const cache = {};

export async function fetchSatelliteGroup(groupKey) {
  if (cache[groupKey] && Date.now() - cache[groupKey].timestamp < 300000) {
    return cache[groupKey].data;
  }

  const group = SATELLITE_GROUPS[groupKey];
  if (!group) throw new Error(`Unknown group: ${groupKey}`);

  const response = await fetch(group.url);
  if (!response.ok) throw new Error(`Failed to fetch ${groupKey}`);

  const text = await response.text();
  cache[groupKey] = { data: text, timestamp: Date.now() };
  return text;
}