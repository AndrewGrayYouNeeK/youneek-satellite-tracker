import assert from 'node:assert/strict';
import test from 'node:test';
import * as satellite from 'satellite.js';
import { CELESTRAK_GROUPS } from './celestrak-groups.js';
import { getSatellitePositions, parseTLEData, propagate } from './tle-parser.js';

const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   19156.50918981  .00003075  00000-0  59442-4 0  9992
2 25544  51.6433  93.6376 0001413  40.0844  52.1372 15.51123447217101`;

const WHEN = new Date('2019-06-05T12:13:14.000Z');

test('SGP4 geodetic position uses epoch, GMST, and kilometer height', () => {
  const [iss] = parseTLEData(ISS_TLE);
  const pos = propagate(iss, WHEN);

  const satrec = satellite.twoline2satrec(ISS_TLE.split('\n')[1].trim(), ISS_TLE.split('\n')[2].trim());
  const propagated = satellite.propagate(satrec, WHEN);
  const gmst = satellite.gstime(WHEN);
  const geodetic = satellite.eciToGeodetic(propagated.position, gmst);

  assert.ok(Math.abs(pos.lat - satellite.degreesLat(geodetic.latitude)) < 1e-6);
  assert.ok(Math.abs(pos.lng - satellite.degreesLong(geodetic.longitude)) < 1e-6);
  assert.ok(Math.abs(pos.altitude - geodetic.height) < 1e-6);
  assert.ok(Math.abs(pos.velocity - Math.hypot(propagated.velocity.x, propagated.velocity.y, propagated.velocity.z)) < 1e-6);

  // Locked snapshot so a wrong Earth-radius scale (meters, or radius subtracted twice) fails.
  assert.ok(Math.abs(pos.lat - 51.743886953917304) < 1e-6);
  assert.ok(Math.abs(pos.lng - 110.29336671633678) < 1e-6);
  assert.ok(Math.abs(pos.altitude - 418.8989911470999) < 1e-4);
  assert.ok(pos.altitude > 200 && pos.altitude < 600);
  assert.ok(pos.velocity > 7 && pos.velocity < 8);
});

test('the simulation date moves the satellite', () => {
  const [iss] = parseTLEData(ISS_TLE);
  const now = propagate(iss, WHEN);
  const later = propagate(iss, new Date(WHEN.getTime() + 10 * 60 * 1000));
  assert.ok(Math.abs(later.lng - now.lng) > 1);
  assert.equal(getSatellitePositions([iss], WHEN).length, 1);
});

test('catalog groups stay aligned with the CelesTrak whitelist', () => {
  assert.deepEqual(Object.keys(CELESTRAK_GROUPS).sort(), [
    'active', 'gps', 'science', 'starlink', 'stations', 'weather',
  ]);
});
