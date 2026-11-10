import assert from 'node:assert/strict';
import test from 'node:test';
import { handleTleRequest } from './tle.js';

const TLE = `ISS (ZARYA)
1 25544U 98067A   19156.50918981  .00003075  00000-0  59442-4 0  9992
2 25544  51.6433  93.6376 0001413  40.0844  52.1372 15.51123447217101
`;

class MemoryCache {
  constructor() {
    this.map = new Map();
  }

  async match(request) {
    const stored = this.map.get(request.url);
    return stored ? stored.clone() : undefined;
  }

  async put(request, response) {
    this.map.set(request.url, response.clone());
  }

  async rewriteCachedAt(url, iso) {
    const stored = this.map.get(url);
    const headers = new Headers(stored.headers);
    headers.set('X-Cached-At', iso);
    const body = await stored.text();
    this.map.set(url, new Response(body, { status: 200, headers }));
  }
}

function harness() {
  const cache = new MemoryCache();
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const behavior = harness.behavior;
    if (behavior === 'fail') return new Response('nope', { status: 503 });
    if (behavior === 'html') return new Response('<html>blocked</html>', { status: 200 });
    return new Response(TLE, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  };
  return {
    cache,
    calls,
    async request(group, method = 'GET') {
      const pending = [];
      const response = await handleTleRequest(new Request(`https://starlit.youneek.dev/api/tle?group=${group}`, { method }), {
        cache,
        waitUntil(promise) { pending.push(promise); },
      });
      await Promise.all(pending);
      return response;
    },
    restore() { globalThis.fetch = original; },
  };
}

harness.behavior = 'ok';

test('whitelist, cache, and stale fallback', async (t) => {
  const api = harness();
  t.after(() => api.restore());

  const missing = await api.request('not-a-group');
  assert.equal(missing.status, 400);
  assert.equal(api.calls.length, 0);

  const denied = await api.request('starlink', 'POST');
  assert.equal(denied.status, 405);

  harness.behavior = 'ok';
  const miss = await api.request('gps');
  assert.equal(miss.status, 200);
  assert.equal(miss.headers.get('X-TLE-Cache'), 'MISS');
  assert.match(api.calls[0], /GROUP=gps-ops/);
  assert.match(api.calls[0], /FORMAT=tle/);
  assert.match(await miss.text(), /25544/);

  const hit = await api.request('gps');
  assert.equal(hit.headers.get('X-TLE-Cache'), 'HIT');
  assert.equal(api.calls.length, 1);

  await api.cache.rewriteCachedAt('https://starlit.youneek.dev/api/tle?group=gps', '2020-01-01T00:00:00.000Z');
  harness.behavior = 'fail';
  const stale = await api.request('gps');
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('X-TLE-Cache'), 'STALE');
  assert.match(await stale.text(), /25544/);

  harness.behavior = 'html';
  const bad = await api.request('weather');
  assert.equal(bad.status, 502);
  const payload = await bad.json();
  assert.equal(payload.error, 'Could not load this group');
});

test('every supported group is fetched once', async (t) => {
  const api = harness();
  t.after(() => api.restore());
  harness.behavior = 'ok';
  for (const group of ['starlink', 'stations', 'active', 'gps', 'weather', 'science']) {
    const response = await api.request(group);
    assert.equal(response.status, 200, group);
    await response.arrayBuffer();
  }
  assert.equal(api.calls.length, 6);
  assert.match(api.calls.join('\n'), /GROUP=starlink/);
  assert.match(api.calls.join('\n'), /GROUP=stations/);
  assert.match(api.calls.join('\n'), /GROUP=active/);
  assert.match(api.calls.join('\n'), /GROUP=gps-ops/);
  assert.match(api.calls.join('\n'), /GROUP=weather/);
  assert.match(api.calls.join('\n'), /GROUP=science/);
});
