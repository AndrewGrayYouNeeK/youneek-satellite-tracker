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

## Tech Stack

- React + Vite
- Three.js for 3D globe rendering
- CelesTrak public TLE API for orbital data
- Tailwind CSS + shadcn/ui components

## Built By

Andrew Gray — [YouNeeK](https://github.com/AndrewGrayYouNeeK)
