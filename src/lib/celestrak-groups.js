// Public CelesTrak group names. No API key. The Worker maps the app's group
// ids onto these and is the only place that talks to CelesTrak.

export const CELESTRAK_GROUPS = {
  starlink: 'starlink',
  stations: 'stations',
  active: 'active',
  gps: 'gps-ops',
  weather: 'weather',
  science: 'science',
};

export const CELESTRAK_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php';

export function celestrakGroupUrl(groupKey) {
  const group = CELESTRAK_GROUPS[groupKey];
  if (!group) return null;
  const url = new URL(CELESTRAK_TLE_URL);
  url.searchParams.set('GROUP', group);
  url.searchParams.set('FORMAT', 'tle');
  return url.toString();
}
