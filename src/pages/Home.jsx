import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import EarthGlobe from '@/components/globe/EarthGlobe';
import SatellitePanel from '@/components/satellite/SatellitePanel';
import ZoomControls from '@/components/satellite/ZoomControls';
import SatelliteInfoPanel from '@/components/satellite/SatelliteInfoPanel';
import ARModeButton from '@/components/satellite/ARModeButton';
import TimeControls from '@/components/satellite/TimeControls';
import { SATELLITE_GROUPS, fetchSatelliteGroup } from '@/lib/satellite-data';
import { parseTLEData, getSatellitePositions } from '@/lib/tle-parser';
import { Loader2 } from 'lucide-react';

const MAX_SATS_PER_GROUP = 10000;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function Home() {
  const [activeGroups, setActiveGroups] = useState(['starlink', 'stations']);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [selectedSat, setSelectedSat] = useState(null);
  const [highlightedSat, setHighlightedSat] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAR, setIsAR] = useState(false);
  const [gyroRotation, setGyroRotation] = useState(null);
  const gyroBaseRef = useRef(null);
  const [satellites, setSatellites] = useState([]);
  const [satelliteCounts, setSatelliteCounts] = useState({});
  const [loading, setLoading] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState({});
  const tleCache = useRef({});

  const [simTime, setSimTime] = useState(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const simRef = useRef({ time: Date.now(), speed: 1, playing: false });

  const loadGroup = useCallback(async (groupKey) => {
    if (tleCache.current[groupKey]) return tleCache.current[groupKey];

    setLoading(prev => ({ ...prev, [groupKey]: true }));
    setLoadErrors(prev => ({ ...prev, [groupKey]: null }));
    try {
      const rawTLE = await fetchSatelliteGroup(groupKey);
      const tles = parseTLEData(rawTLE);
      tleCache.current[groupKey] = tles;
      setSatelliteCounts(prev => ({ ...prev, [groupKey]: tles.length }));
      return tles;
    } catch (err) {
      console.error(`Failed to load ${groupKey}:`, err);
      setLoadErrors(prev => ({ ...prev, [groupKey]: err.message || 'Failed to load' }));
      return [];
    } finally {
      setLoading(prev => ({ ...prev, [groupKey]: false }));
    }
  }, []);

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
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const looped = startOfDay.getTime() + ((newTime - startOfDay.getTime()) % DAY_MS);
      simRef.current.time = looped;
      setSimTime(looped);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function updatePositions() {
      const allPositions = [];
      const date = new Date(simRef.current.time);

      for (const groupKey of activeGroups) {
        const tles = await loadGroup(groupKey);
        if (cancelled) return;

        let sampled = tles;
        if (tles.length > MAX_SATS_PER_GROUP) {
          const step = Math.ceil(tles.length / MAX_SATS_PER_GROUP);
          sampled = tles.filter((_, i) => i % step === 0);
        }

        const positions = getSatellitePositions(sampled, date);
        positions.forEach(p => { p.group = groupKey; });
        allPositions.push(...positions);
      }

      if (!cancelled) {
        setSatellites(allPositions);
        setInitialLoading(false);
      }
    }

    updatePositions();
    const interval = setInterval(updatePositions, isPlaying ? 500 : 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeGroups, loadGroup, isPlaying]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return satellites
      .filter(s => s.name?.toLowerCase().includes(q))
      .slice(0, 12);
  }, [satellites, searchQuery]);

  const handleSelectSearchResult = useCallback((sat) => {
    setSelectedSat(sat);
    setHighlightedSat(sat);
    setSearchQuery('');
  }, []);

  const handleToggleAR = useCallback(() => {
    if (!isAR) {
      document.documentElement.requestFullscreen?.();
      gyroBaseRef.current = null;

      const handleOrientation = (e) => {
        const alpha = (e.alpha ?? 0) * Math.PI / 180;
        const beta  = (e.beta  ?? 0) * Math.PI / 180;
        if (!gyroBaseRef.current) gyroBaseRef.current = { alpha, beta };
        let dy = alpha - gyroBaseRef.current.alpha;
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

  const handleTimeScrub = useCallback((progress) => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const newTime = startOfDay.getTime() + (progress / 100) * DAY_MS;
    setSimTime(newTime);
    simRef.current.time = newTime;
  }, []);

  const groupColors = {};
  Object.entries(SATELLITE_GROUPS).forEach(([key, group]) => {
    groupColors[key] = group.color;
  });

  const totalCount = Object.entries(satelliteCounts)
    .filter(([key]) => activeGroups.includes(key))
    .reduce((sum, [, count]) => sum + count, 0);

  const visibleSatellites = useMemo(() => {
    if (!highlightedSat) return satellites;
    return satellites.map(s =>
      s.name === highlightedSat.name && s.group === highlightedSat.group
        ? { ...s, highlighted: true }
        : s
    );
  }, [satellites, highlightedSat]);

  return (
    <div className={`fixed inset-0 bg-background overflow-hidden ${isAR ? 'bg-black' : ''}`}>
      {initialLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Loading orbital data…</p>
        </div>
      )}

      <EarthGlobe
        satellites={visibleSatellites}
        groupColors={groupColors}
        activeGroups={activeGroups}
        zoomDelta={zoomDelta}
        onSatelliteClick={(sat) => {
          setSelectedSat(sat);
          setHighlightedSat(sat);
        }}
        gyroRotation={gyroRotation}
        focusSatellite={highlightedSat}
      />

      <ARModeButton isAR={isAR} onToggle={handleToggleAR} />

      {!isAR && (
        <>
          <ZoomControls
            onZoomIn={() => setZoomDelta(d => d + 1)}
            onZoomOut={() => setZoomDelta(d => d - 1)}
          />
          <SatellitePanel
            activeGroups={activeGroups}
            onToggleGroup={handleToggleGroup}
            satelliteCounts={satelliteCounts}
            loading={loading}
            loadErrors={loadErrors}
            totalCount={totalCount}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchResults={searchResults}
            onSelectSearchResult={handleSelectSearchResult}
          />
          <SatelliteInfoPanel
            satellite={selectedSat}
            onClose={() => {
              setSelectedSat(null);
              setHighlightedSat(null);
            }}
          />
          <TimeControls
            simTime={simTime}
            isPlaying={isPlaying}
            speed={simSpeed}
            totalCount={totalCount}
            onTogglePlay={() => setIsPlaying(p => !p)}
            onReset={() => { setSimTime(Date.now()); simRef.current.time = Date.now(); setIsPlaying(false); }}
            onSpeedChange={(s) => setSimSpeed(s)}
            onTimeScrub={handleTimeScrub}
          />
        </>
      )}
    </div>
  );
}
