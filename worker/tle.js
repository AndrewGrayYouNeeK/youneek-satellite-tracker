import { celestrakGroupUrl } from '../src/lib/celestrak-groups.js';

const FRESH_SECONDS = 2 * 60 * 60;
const STORE_SECONDS = 24 * 60 * 60;
const MAX_BYTES = 20 * 1024 * 1024;
const USER_AGENT = 'YouNeeKSatelliteTracker/1.0 (+https://starlit.youneek.dev)';

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function looksLikeTle(text) {
  if (!text || text.length > MAX_BYTES) return false;
  let sawLine1 = false;
  let sawLine2 = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('1 ')) sawLine1 = true;
    else if (trimmed.startsWith('2 ')) sawLine2 = true;
    if (sawLine1 && sawLine2) return true;
  }
  return false;
}

function cacheAgeSeconds(response) {
  const stamped = Date.parse(response.headers.get('X-Cached-At') || '');
  if (!Number.isNaN(stamped)) return Math.max(0, (Date.now() - stamped) / 1000);
  const age = Number(response.headers.get('Age'));
  if (Number.isFinite(age) && age >= 0) return age;
  return 0;
}

function clientResponse(source, cacheStatus, maxAge) {
  const headers = new Headers(source.headers);
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', `public, max-age=${maxAge}`);
  headers.set('X-TLE-Cache', cacheStatus);
  return new Response(source.body, { status: source.status, headers });
}

// The Cache API does not honor stale-if-error, and a 2h max-age would drop the
// entry before we could serve it. Store for a day and treat anything older
// than two hours as stale: refresh on use, and fall back to the stored body
// when CelesTrak fails.
export async function handleTleRequest(request, { cache, waitUntil }) {
  if (request.method !== 'GET') {
    return jsonError(405, 'Method not allowed');
  }

  const url = new URL(request.url);
  const groupKey = url.searchParams.get('group');
  const upstreamUrl = celestrakGroupUrl(groupKey);
  if (!upstreamUrl) {
    return jsonError(400, 'Unknown satellite group');
  }

  const cacheKey = new Request(new URL(`/api/tle?group=${groupKey}`, url.origin), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  const age = cached ? cacheAgeSeconds(cached) : Infinity;
  if (cached && age < FRESH_SECONDS) {
    const remaining = Math.max(0, Math.floor(FRESH_SECONDS - age));
    return clientResponse(cached, 'HIT', remaining);
  }

  try {
    const init = {
      headers: {
        Accept: 'text/plain',
        'User-Agent': USER_AGENT,
      },
    };
    // Skip the fetch cache so the Cache API below is the only copy. `cf` is a
    // Workers extension and is not passed to Node's fetch (dev server, tests).
    if (typeof caches !== 'undefined') init.cf = { cacheTtl: 0 };
    const upstream = await fetch(upstreamUrl, init);
    if (!upstream.ok) {
      throw new Error(`CelesTrak responded ${upstream.status}`);
    }
    const declared = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new Error('CelesTrak payload is too large');
    }
    const text = await upstream.text();
    if (!looksLikeTle(text)) {
      throw new Error('CelesTrak returned an unexpected payload');
    }

    const stored = new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': `public, max-age=${STORE_SECONDS}`,
        'X-Cached-At': new Date().toISOString(),
        'X-TLE-Group': groupKey,
      },
    });
    waitUntil(cache.put(cacheKey, stored.clone()).catch((err) => {
      console.error(JSON.stringify({
        event: 'tle_cache_put_failed',
        group: groupKey,
        message: err instanceof Error ? err.message : String(err),
      }));
    }));
    return clientResponse(stored, 'MISS', FRESH_SECONDS);
  } catch (err) {
    console.error(JSON.stringify({
      event: 'tle_upstream_error',
      group: groupKey,
      message: err instanceof Error ? err.message : String(err),
    }));
    if (cached) {
      return clientResponse(cached, 'STALE', 60);
    }
    return jsonError(502, 'Could not load this group');
  }
}
