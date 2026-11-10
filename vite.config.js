import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { handleTleRequest } from './worker/tle.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev stand-in for the Worker route. Production uses worker/index.js.
function tleDevApi() {
  const store = new Map()
  const cache = {
    async match(request) {
      const hit = store.get(request.url)
      return hit ? hit.clone() : undefined
    },
    async put(request, response) {
      store.set(request.url, response.clone())
    },
  }
  return {
    name: 'tle-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
        if (url.pathname !== '/api/tle') return next()
        try {
          const pending = []
          const response = await handleTleRequest(new Request(url, { method: req.method || 'GET' }), {
            cache,
            waitUntil(promise) { pending.push(promise) },
          })
          await Promise.all(pending)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          console.error(JSON.stringify({ event: 'tle_dev_api_failed', message: err instanceof Error ? err.message : String(err) }))
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Could not load this group' }))
        }
      })
    },
  }
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/youneek-satellite-tracker/' : '/',
  plugins: [tleDevApi(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
