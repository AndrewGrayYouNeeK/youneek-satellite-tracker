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

### GitHub Pages (recommended)

Pushes to `main` deploy automatically via GitHub Actions. Enable Pages in the repo settings under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Live site: [https://andrewgrayyouneek.github.io/youneek-satellite-tracker/](https://andrewgrayyouneek.github.io/youneek-satellite-tracker/)

### Vercel

If Vercel checks fail with **"Account is blocked"**, the linked Vercel account or project is paused — unpause it in the [Vercel dashboard](https://vercel.com/dashboard) or remove the duplicate Vercel GitHub integration from **Settings → Integrations** in this repo. The app builds successfully with `npm run build`; the failure is account-level, not a code issue.

## Tech Stack

- React + Vite
- Three.js for 3D globe rendering
- CelesTrak public TLE API for orbital data
- Tailwind CSS + shadcn/ui components

## Built By

Andrew Gray — [YouNeeK](https://github.com/AndrewGrayYouNeeK)
