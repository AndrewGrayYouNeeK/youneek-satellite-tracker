# YouNeeK Satellite Tracker

Real-time 3D satellite tracking on an interactive Earth globe — see what's flying overhead right now.

## About

YouNeeK Satellite Tracker renders live satellite positions on a 3D globe using real TLE (Two-Line Element) orbital data from [CelesTrak](https://celestrak.org/). Track Starlink constellations, the ISS, and thousands of other objects in real time or simulate time forward and backward at adjustable speeds.

## Features

- **Live 3D Earth Globe** — Interactive globe with satellite overlays and country borders
- **Multiple Satellite Groups** — Starlink, ISS, space stations, GPS, weather, science, and more
- **Real TLE Data** — Positions calculated from up-to-date orbital elements
- **Time Simulation** — Play, pause, scrub, and loop through a 24-hour UTC day at variable speeds
- **Satellite Search** — Find and focus on any tracked object by name
- **Satellite Info Panel** — Click any satellite for name, position, altitude, and velocity
- **AR Mode** — Point your device at the sky using device orientation
- **Zoom Controls** — Pinch or button zoom on desktop and mobile

## Running Locally

```bash
git clone https://github.com/AndrewGrayYouNeeK/youneek-satellite-tracker.git
cd youneek-satellite-tracker
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Deployment

Production runs on **Cloudflare Workers** as a static-asset Worker with a small API script, served at [https://starlit.youneek.dev/](https://starlit.youneek.dev/).

The repository ships a `wrangler.jsonc` that deploys the Vite build output (`dist/`) as Workers static assets with single-page-application routing (`not_found_handling = "single-page-application"`), so React Router works at the domain root. `worker/index.js` serves `GET /api/tle?group=` for the six groups (Starlink, stations, active, GPS, weather, science). It fetches public CelesTrak TLE data — no API key — caches each group for about two hours in the [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), and serves the last cached copy if CelesTrak fails. `/api/*` runs the Worker first; every other path is a static asset. Deploy with:

```bash
npm run deploy
```

This builds the app and runs `wrangler deploy` using the `starlit-tracker` Worker config. DNS and the `starlit.youneek.dev` custom domain are configured separately in the Cloudflare dashboard — nothing in this repo creates or changes DNS records.

A GitHub Pages workflow (`.github/workflows/pages.yml`) is still available as a mirror of the static build. It does not run the Worker, so satellite groups load from the Cloudflare deployment, not from the Pages URL.

## Tech Stack

- React + Vite
- Three.js for 3D globe rendering
- CelesTrak public TLE API for orbital data
- Tailwind CSS + shadcn/ui components

## Built By

Andrew Gray — [YouNeeK](https://github.com/AndrewGrayYouNeeK)
