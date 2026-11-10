import { handleTleRequest } from './tle.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/tle') {
      return handleTleRequest(request, {
        cache: caches.default,
        waitUntil(promise) {
          ctx.waitUntil(promise);
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
