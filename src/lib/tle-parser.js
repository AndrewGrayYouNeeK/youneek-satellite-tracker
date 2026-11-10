import * as satellite from 'satellite.js';

// SGP4/SDP4 via satellite.js. propagate() takes the TLE epoch from the element
// set. gstime() is the GMST that matches that same time system. eciToGeodetic()
// converts TEME/ECI kilometers to geodetic latitude, longitude, and height
// above the WGS84 ellipsoid (6378.137 km), so height is already kilometers.

const MAX_ALTITUDE_KM = 500_000;

function isVector(value) {
  return Boolean(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

function speedKmPerSec(velocity) {
  return Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
}

export function parseTLEData(rawData) {
  const lines = rawData.trim().split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const satellites = [];

  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;
    const satrec = satellite.twoline2satrec(line1, line2);
    satellites.push({ name: name.trim(), satrec });
  }

  return satellites;
}

export function propagate(sat, date) {
  if (!sat?.satrec) return null;
  const propagated = satellite.propagate(sat.satrec, date);
  if (!propagated || !isVector(propagated.position) || !isVector(propagated.velocity)) {
    return null;
  }

  const gmst = satellite.gstime(date);
  let geodetic;
  try {
    geodetic = satellite.eciToGeodetic(propagated.position, gmst);
  } catch {
    return null;
  }

  const lat = satellite.degreesLat(geodetic.latitude);
  const lng = satellite.degreesLong(geodetic.longitude);
  const altitude = geodetic.height;
  const velocity = speedKmPerSec(propagated.velocity);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(altitude) || !Number.isFinite(velocity)) {
    return null;
  }

  return { lat, lng, altitude, velocity };
}

export function getSatellitePositions(satellites, date = new Date()) {
  return satellites.map((sat) => {
    const pos = propagate(sat, date);
    if (!pos) return null;
    if (Math.abs(pos.lat) > 90 || pos.altitude < -1 || pos.altitude > MAX_ALTITUDE_KM) return null;
    return {
      name: sat.name,
      lat: pos.lat,
      lng: pos.lng,
      altitude: pos.altitude,
      velocity: pos.velocity,
    };
  }).filter(Boolean);
}
