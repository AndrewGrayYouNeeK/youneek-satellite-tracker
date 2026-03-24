import React, { useState, useEffect, useCallback, useRef } from 'react';
import EarthGlobe from '@/components/globe/EarthGlobe';
import FlatEarthMap from '@/components/globe/FlatEarthMap';
import SatellitePanel from '@/components/satellite/SatellitePanel';
import StatsBar from '@/components/satellite/StatsBar';
import ZoomControls from '@/components/satellite/ZoomControls';
import SatelliteInfoPanel from '@/components/satellite/SatelliteInfoPanel';
import ARModeButton from '@/components/satellite/ARModeButton';
import TimeControls from '@/components/satellite/TimeControls';
import { SATELLITE_GROUPS, fetchSatelliteGroup } from '@/lib/satellite-data';
import { parseTLEData, getSatellitePositions } from '@/lib/tle-parser';

const MAX_SATS_PER_GROUP = 10000;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function Home() {
  const [activeGroups, setActiveGroups] = useState(['starlink', 'stations']);
  const [flatEarth, setFlatEarth] = useState(false);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [selectedSat, setSelectedSat] = useState(null);
  const [isAR, setIsAR] = useState(false);
  const [gyroRotation, setGyroRotation] = useState(null);
  const gyroBaseRef = useRef(null);
  const [satellites, setSatellites] = useState([]);
  const [satelliteCounts, setSatelliteCounts] = useState({});
  const [loading, setLoading] = useState({});
  const tleCache = useRef({});

  // Time simulation
  const [simTime, setSimTime] = useState(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const simRef = useRef({ time: Date.now(), speed: 1, playing: false });

  const loadGroup = useCallback(async (groupKey) => {
    if (tleCache.current[groupKey]) return tleCache.current[groupKey];

    setLoading(prev => ({ ...prev, [groupKey]: true }));
    try {
      const rawTLE = await fetchSatelliteGroup(groupKey);
      const tles = parseTLEData(rawTLE);
      tleCache.current[groupKey] = tles;
      setSatelliteCounts(prev => ({ ...prev, [groupKey]: tles.length }));
      return tles;
    } catch (err) {
      console.error(`Failed to load ${groupKey}:`, err);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, [groupKey]: false }));
    }
  }, []);

  // Sim clock tick
  useEffect(() => {
    simRef.current = { time: simTime, speed: simSpeed, playing: isPlaying };
  }, [simTime, simSpeed, isPlaying]);

  useEffect(() => {
    let lastTick = performance.now();
    let raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const { playing, speed, time } = simRef.current;
      if (!playing) return;
      const dt = now - lastTick;
      lastTick = now;
      const newTime = time + dt * speed;
      // Loop within the current UTC day
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const looped = startOfDay.getTime() + ((newTime - startOfDay.getTime()) % DAY_MS);
      simRef.current.time = looped;
      setSimTime(looped);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Load and propagate satellites
  useEffect(() => {
    let cancelled = false;

    async function updatePositions() {
      const allPositions = [];
      const date = new Date(simRef.current.time);

      for (const groupKey of activeGroups) {
        const tles = await loadGroup(groupKey);
        if (cancelled) return;

        // Only sample if exceeds hard cap (Starlink has 6000+)
        let sampled = tles;
        if (tles.length > MAX_SATS_PER_GROUP) {
          const step = Math.ceil(tles.length / MAX_SATS_PER_GROUP);
          sampled = tles.filter((_, i) => i % step === 0);
        }

        const positions = getSatellitePositions(sampled, date);
        positions.forEach(p => { p.group = groupKey; });
        allPositions.push(...positions);
      }

      if (!cancelled) setSatellites(allPositions);
    }

    updatePositions();

    // Update positions regularly; sim clock drives the date via simRef
    const interval = setInterval(updatePositions, isPlaying ? 500 : 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeGroups, loadGroup, isPlaying]);

  const handleToggleAR = useCallback(() => {
    if (!isAR) {
      document.documentElement.requestFullscreen?.();
      gyroBaseRef.current = null;

      const handleOrientation = (e) => {
        const alpha = (e.alpha ?? 0) * Math.PI / 180; // compass (left/right)
        const beta  = (e.beta  ?? 0) * Math.PI / 180; // front/back tilt
        if (!gyroBaseRef.current) gyroBaseRef.current = { alpha, beta };
        // Map alpha (compass heading) to Y rotation, beta (tilt) to X rotation
        let dy = alpha - gyroBaseRef.current.alpha;
        // Handle wrap-around at 0/360
        if (dy > Math.PI) dy -= 2 * Math.PI;
        if (dy < -Math.PI) dy += 2 * Math.PI;
        setGyroRotation({
          x: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, (beta - gyroBaseRef.current.beta) * 0.5)),
          y: dy,
        });
      };

      if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(state => {
          if (state === 'granted') window.addEventListener('deviceorientation', handleOrientation);
        });
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
      window._arOrientationHandler = handleOrientation;
      setIsAR(true);
    } else {
      document.exitFullscreen?.();
      if (window._arOrientationHandler) {
        window.removeEventListener('deviceorientation', window._arOrientationHandler);
        window._arOrientationHandler = null;
      }
      setGyroRotation(null);
      gyroBaseRef.current = null;
      setIsAR(false);
    }
  }, [isAR]);

  const handleToggleGroup = useCallback((groupKey) => {
    setActiveGroups(prev =>
      prev.includes(groupKey)
        ? prev.filter(g => g !== groupKey)
        : [...prev, groupKey]
    );
  }, []);

  const groupColors = {};
  Object.entries(SATELLITE_GROUPS).forEach(([key, group]) => {
    groupColors[key] = group.color;
  });

  const totalCount = Object.entries(satelliteCounts)
    .filter(([key]) => activeGroups.includes(key))
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className={`fixed inset-0 bg-background overflow-hidden ${isAR ? 'bg-black' : ''}`}>
      <EarthGlobe
        satellites={satellites}
        groupColors={groupColors}
        activeGroups={activeGroups}
        zoomDelta={zoomDelta}
        onSatelliteClick={setSelectedSat}
        gyroRotation={gyroRotation}
      />
      <ARModeButton isAR={isAR} onToggle={handleToggleAR} />
      {!isAR && <ZoomControls
        onZoomIn={() => setZoomDelta(d => d + 1)}
        onZoomOut={() => setZoomDelta(d => d - 1)}
      />}
      {!isAR && <SatellitePanel
        activeGroups={activeGroups}
        onToggleGroup={handleToggleGroup}
        satelliteCounts={satelliteCounts}
        loading={loading}
        totalCount={totalCount}
      />}
      {!isAR && <SatelliteInfoPanel satellite={selectedSat} onClose={() => setSelectedSat(null)} />}
      {!isAR && <StatsBar totalCount={totalCount} />}
      {!isAR && (
        <TimeControls
          simTime={simTime}
          isPlaying={isPlaying}
          speed={simSpeed}
          onTogglePlay={() => setIsPlaying(p => !p)}
          onReset={() => { setSimTime(Date.now()); setIsPlaying(false); }}
          onSpeedChange={(s) => setSimSpeed(s)}
        />
      )}
    </div>
  );
}