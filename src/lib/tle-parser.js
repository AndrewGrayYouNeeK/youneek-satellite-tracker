// Simple TLE to lat/lng converter without external dependencies
// Uses SGP4 simplified perturbation model approximation

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const TWOPI = 2 * Math.PI;
const EARTH_RADIUS = 6371; // km
const MINUTES_PER_DAY = 1440;
const MU = 398600.4418; // km^3/s^2

function parseTLE(name, line1, line2) {
  const epochYear = parseInt(line1.substring(18, 20));
  const epochDay = parseFloat(line1.substring(20, 32));
  const inclination = parseFloat(line2.substring(8, 16)) * DEG2RAD;
  const raan = parseFloat(line2.substring(17, 25)) * DEG2RAD;
  const eccentricity = parseFloat('0.' + line2.substring(26, 33));
  const argPerigee = parseFloat(line2.substring(34, 42)) * DEG2RAD;
  const meanAnomaly = parseFloat(line2.substring(43, 51)) * DEG2RAD;
  const meanMotion = parseFloat(line2.substring(52, 63)); // revs per day

  const fullYear = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;

  return {
    name: name.trim(),
    epochYear: fullYear,
    epochDay,
    inclination,
    raan,
    eccentricity,
    argPerigee,
    meanAnomaly,
    meanMotion,
  };
}

function getJulianDate(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const min = date.getUTCMinutes();
  const s = date.getUTCSeconds();

  const jd = 367 * y
    - Math.floor(7 * (y + Math.floor((m + 9) / 12)) / 4)
    + Math.floor(275 * m / 9)
    + d + 1721013.5
    + ((h + min / 60 + s / 3600) / 24);

  return jd;
}

function getGMST(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - T * T * T / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst * DEG2RAD;
}

function solveKepler(M, e, tol = 1e-8) {
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

export function propagate(tle, date) {
  const jd = getJulianDate(date);

  // Time since epoch in minutes
  const epochDate = new Date(Date.UTC(tle.epochYear, 0, 1));
  epochDate.setUTCDate(epochDate.getUTCDate() + tle.epochDay - 1);
  const dtMinutes = (date.getTime() - epochDate.getTime()) / 60000;

  // Mean motion in rad/min
  const n = tle.meanMotion * TWOPI / MINUTES_PER_DAY;

  // Semi-major axis
  const a = Math.pow(MU / Math.pow(tle.meanMotion * TWOPI / 86400, 2), 1 / 3);

  // Current mean anomaly
  const M = tle.meanAnomaly + n * dtMinutes;

  // Solve Kepler's equation
  const E = solveKepler(M % TWOPI, tle.eccentricity);

  // True anomaly
  const sinV = Math.sqrt(1 - tle.eccentricity * tle.eccentricity) * Math.sin(E) / (1 - tle.eccentricity * Math.cos(E));
  const cosV = (Math.cos(E) - tle.eccentricity) / (1 - tle.eccentricity * Math.cos(E));
  const v = Math.atan2(sinV, cosV);

  // Distance from Earth center
  const r = a * (1 - tle.eccentricity * Math.cos(E));

  // Argument of latitude
  const u = v + tle.argPerigee;

  // Simplified J2 perturbation for RAAN
  const J2 = 1.08263e-3;
  const raanRate = -1.5 * n * J2 * (EARTH_RADIUS / a) * (EARTH_RADIUS / a) * Math.cos(tle.inclination) / ((1 - tle.eccentricity * tle.eccentricity) * (1 - tle.eccentricity * tle.eccentricity));
  const currentRaan = tle.raan + raanRate * dtMinutes;

  // Position in orbital plane
  const xOrb = r * Math.cos(u);
  const yOrb = r * Math.sin(u);

  // Transform to ECI
  const xECI = xOrb * Math.cos(currentRaan) - yOrb * Math.cos(tle.inclination) * Math.sin(currentRaan);
  const yECI = xOrb * Math.sin(currentRaan) + yOrb * Math.cos(tle.inclination) * Math.cos(currentRaan);
  const zECI = yOrb * Math.sin(tle.inclination);

  // GMST for ECI to ECEF
  const gmst = getGMST(jd);

  // ECI to ECEF
  const xECEF = xECI * Math.cos(gmst) + yECI * Math.sin(gmst);
  const yECEF = -xECI * Math.sin(gmst) + yECI * Math.cos(gmst);
  const zECEF = zECI;

  // ECEF to lat/lng
  const lng = Math.atan2(yECEF, xECEF) * RAD2DEG;
  const lat = Math.atan2(zECEF, Math.sqrt(xECEF * xECEF + yECEF * yECEF)) * RAD2DEG;
  const altitude = r - EARTH_RADIUS;

  return { lat, lng, altitude, r };
}

export function parseTLEData(rawData) {
  const lines = rawData.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const satellites = [];

  for (let i = 0; i < lines.length - 2; i += 3) {
    if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
      const tle = parseTLE(lines[i], lines[i + 1], lines[i + 2]);
      satellites.push(tle);
    }
  }

  return satellites;
}

export function getSatellitePositions(satellites, date = new Date()) {
  return satellites.map(sat => {
    try {
      const pos = propagate(sat, date);
      if (isNaN(pos.lat) || isNaN(pos.lng) || Math.abs(pos.lat) > 90 || pos.altitude < 0 || pos.altitude > 50000) {
        return null;
      }
      return {
        name: sat.name,
        lat: pos.lat,
        lng: pos.lng,
        altitude: pos.altitude,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}