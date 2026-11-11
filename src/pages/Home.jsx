import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SkyARView from '@/components/ar/SkyARView';
import EarthGlobe from '@/components/globe/EarthGlobe';
import SatellitePanel from '@/components/satellite/SatellitePanel';
import ZoomControls from '@/components/satellite/ZoomControls';
import SatelliteInfoPanel from '@/components/satellite/SatelliteInfoPanel';
import ARModeButton from '@/components/satellite/ARModeButton';
import TimeControls from '@/components/satellite/TimeControls';
import {
  createSkyArController,
  readOrientationPermission,
  requestEnvironmentCamera,
} from '@/lib/ar-session';
import { SATELLITE_GROUPS, fetchSatelliteGroup } from '@/lib/satellite-data';
import { trackerChrome } from '@/lib/tracker-chrome';
import { parseTLEData, getSatellitePositions } from '@/lib/tle-parser';
import { Loader2 } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const SKY_LOOK = { heading: 0, tilt: 45, roll: 0 };

export default function Home() {
  const [activeGroups, setActiveGroups] = useState(['starlink', 'stations']);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [viewResetToken, setViewResetToken] = useState(0);
  const [selectedSat, setSelectedSat] = useState(null);
  const [highlightedSat, setHighlightedSat] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackerMode, setTrackerMode] = useState('globe');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraSettled, setCameraSettled] = useState(false);
  const [orientationLive, setOrientationLive] = useState(false);
  const [orientationDenied, setOrientationDenied] = useState(false);
  const orientationRef = useRef({ ...SKY_LOOK });
  const orientationLiveRef = useRef(false);
  const controllerRef = useRef(null);
  const [satellites, setSatellites] = useState([]);
  const [satelliteCounts, setSatelliteCounts] = useState({});
  const [loading, setLoading] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState({});
  const tleCache = useRef({});
  const failedGroups = useRef(new Set());
  const forceLoad = useRef(new Set());
  const [retryNonce, setRetryNonce] = useState(0);

  const [simTime, setSimTime] = useState(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const simRef = useRef({ time: Date.now(), speed: 1, playing: false });
  const activeGroupsRef = useRef(activeGroups);
  activeGroupsRef.current = activeGroups;

  const ensureController = useCallback(() => {
    if (controllerRef.current) return controllerRef.current;
    controllerRef.current = createSkyArController({
      addOrientationListener(handler) {
        window.addEventListener('deviceorientationabsolute', handler, true);
        window.addEventListener('deviceorientation', handler);
      },
      removeOrientationListener(handler) {
        window.removeEventListener('deviceorientationabsolute', handler, true);
        window.removeEventListener('deviceorientation', handler);
      },
      requestFullscreen() {
        const node = document.documentElement;
        if (typeof node.requestFullscreen !== 'function') return;
        Promise.resolve(node.requestFullscreen()).catch(() => {});
      },
      exitFullscreen() {
        if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
        Promise.resolve(document.exitFullscreen()).catch(() => {});
      },
    });
    return controllerRef.current;
  }, []);

  useEffect(() => () => controllerRef.current?.stop(), []);

  const leaveSkyAr = useCallback(() => {
    ensureController().stop();
    orientationLiveRef.current = false;
    orientationRef.current = { ...SKY_LOOK };
    setTrackerMode('globe');
    setCameraStream(null);
    setCameraSettled(false);
    setOrientationLive(false);
    setOrientationDenied(false);
  }, [ensureController]);

  const handleToggleAR = useCallback(() => {
    const controller = ensureController();
    if (controller.isActive()) {
      leaveSkyAr();
      return;
    }

    // iOS only grants motion and camera access when the requests start in
    // this click. Do not await before these two calls.
    const orientationPermission = readOrientationPermission();
    const cameraPromise = requestEnvironmentCamera();
    orientationLiveRef.current = false;
    orientationRef.current = { ...SKY_LOOK };
    setOrientationLive(false);
    setOrientationDenied(false);
    setCameraStream(null);
    setCameraSettled(false);
    setTrackerMode('sky-ar');
    controller.start({
      orientationPermission,
      cameraPromise,
      onOrientation({ granted, sample }) {
        if (!controller.isActive()) return;
        if (sample) {
          orientationRef.current = sample;
          if (!orientationLiveRef.current) {
            orientationLiveRef.current = true;
            setOrientationLive(true);
          }
          return;
        }
        if (!granted) setOrientationDenied(true);
      },
      onCamera(stream) {
        if (!controller.isActive()) return;
        setCameraStream(stream);
        setCameraSettled(true);
      },
    });
  }, [ensureController, leaveSkyAr]);

  useEffect(() => {
    if (trackerMode !== 'sky-ar') return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') leaveSkyAr();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trackerMode, leaveSkyAr]);

  const loadGroup = useCallback(async (groupKey) => {
    const force = forceLoad.current.has(groupKey);
    if (force) forceLoad.current.delete(groupKey);
    if (!force && tleCache.current[groupKey]) return tleCache.current[groupKey];
    if (!force && failedGroups.current.has(groupKey)) return null;

    setLoading(prev => ({ ...prev, [groupKey]: true }));
    setLoadErrors(prev => ({ ...prev, [groupKey]: null }));
    try {
      const rawTLE = await fetchSatelliteGroup(groupKey);
      const tles = parseTLEData(rawTLE);
      if (tles.length === 0) throw new Error('Could not load this group');
      tleCache.current[groupKey] = tles;
      failedGroups.current.delete(groupKey);
      setSatelliteCounts(prev => ({ ...prev, [groupKey]: tles.length }));
      return tles;
    } catch (err) {
      console.error(JSON.stringify({ event: 'group_load_failed', group: groupKey, message: err.message }));
      delete tleCache.current[groupKey];
      failedGroups.current.add(groupKey);
      setLoadErrors(prev => ({ ...prev, [groupKey]: err.message || 'Could not load this group' }));
      setSatelliteCounts(prev => ({ ...prev, [groupKey]: 0 }));
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [groupKey]: false }));
    }
  }, []);

  const updatePositions = useCallback(() => {
    const date = new Date(simRef.current.time);
    const allPositions = [];
    for (const groupKey of activeGroupsRef.current) {
      const tles = tleCache.current[groupKey];
      if (!tles) continue;
      const positions = getSatellitePositions(tles, date);
      positions.forEach(p => { p.group = groupKey; });
      allPositions.push(...positions);
    }
    setSatellites(allPositions);
    const match = (prev) => {
      if (!prev) return prev;
      return allPositions.find((sat) => sat.name === prev.name && sat.group === prev.group) || prev;
    };
    setSelectedSat(match);
    setHighlightedSat(match);
  }, []);

  useEffect(() => {
    simRef.current = { time: simTime, speed: simSpeed, playing: isPlaying };
  }, [simTime, simSpeed, isPlaying]);

  useEffect(() => {
    let lastTick = performance.now();
    let raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!simRef.current.playing) {
        lastTick = now;
        return;
      }
      const dt = Math.min(1000, Math.max(0, now - lastTick));
      lastTick = now;
      const { speed, time } = simRef.current;
      const newTime = time + dt * speed;
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const elapsed = newTime - startOfDay.getTime();
      const looped = startOfDay.getTime() + ((elapsed % DAY_MS) + DAY_MS) % DAY_MS;
      simRef.current.time = looped;
      setSimTime(looped);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all(activeGroups.map((groupKey) => loadGroup(groupKey)));
      if (cancelled) return;
      updatePositions();
      setInitialLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeGroups, loadGroup, retryNonce, updatePositions]);

  useEffect(() => {
    if (isPlaying) return;
    updatePositions();
  }, [simTime, isPlaying, updatePositions]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const interval = setInterval(updatePositions, 500);
    return () => clearInterval(interval);
  }, [isPlaying, updatePositions]);

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

  const handleToggleGroup = useCallback((groupKey) => {
    setActiveGroups(prev => {
      if (prev.includes(groupKey)) return prev.filter(g => g !== groupKey);
      if (failedGroups.current.has(groupKey)) {
        failedGroups.current.delete(groupKey);
        forceLoad.current.add(groupKey);
      }
      return [...prev, groupKey];
    });
  }, []);

  const handleRetryGroup = useCallback((groupKey) => {
    failedGroups.current.delete(groupKey);
    delete tleCache.current[groupKey];
    forceLoad.current.add(groupKey);
    setLoadErrors(prev => ({ ...prev, [groupKey]: null }));
    setActiveGroups(prev => (prev.includes(groupKey) ? prev : [...prev, groupKey]));
    setRetryNonce(n => n + 1);
  }, []);

  const handleTimeScrub = useCallback((progress) => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const newTime = startOfDay.getTime() + (progress / 100) * DAY_MS;
    setSimTime(newTime);
    simRef.current.time = newTime;
    updatePositions();
  }, [updatePositions]);

  const groupColors = useMemo(() => {
    const colors = {};
    Object.entries(SATELLITE_GROUPS).forEach(([key, group]) => {
      colors[key] = group.color;
    });
    return colors;
  }, []);

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

  const chrome = trackerChrome(trackerMode);
  const timeControlProps = {
    simTime,
    isPlaying,
    speed: simSpeed,
    totalCount,
    onTogglePlay: () => setIsPlaying(playing => !playing),
    onReset: () => { setSimTime(Date.now()); simRef.current.time = Date.now(); setIsPlaying(false); },
    onSpeedChange: setSimSpeed,
    onTimeScrub: handleTimeScrub,
  };

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {initialLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Loading orbital data…</p>
        </div>
      )}

      <div className={`absolute inset-0 ${chrome.skyAr ? 'pointer-events-none' : ''}`} aria-hidden={chrome.skyAr ? true : undefined}>
        <EarthGlobe
          satellites={visibleSatellites}
          groupColors={groupColors}
          activeGroups={activeGroups}
          zoomDelta={zoomDelta}
          onSatelliteClick={(sat) => {
            setSelectedSat(sat);
            setHighlightedSat(sat);
          }}
          focusSatellite={highlightedSat}
          viewResetToken={viewResetToken}
        />
      </div>

      {chrome.panels && (
        <>
          <ZoomControls
            onZoomIn={() => setZoomDelta(d => d + 1)}
            onZoomOut={() => setZoomDelta(d => d - 1)}
            onResetView={() => setViewResetToken(token => token + 1)}
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
            onRetryGroup={handleRetryGroup}
          />
          <SatelliteInfoPanel
            satellite={selectedSat}
            onClose={() => {
              setSelectedSat(null);
              setHighlightedSat(null);
            }}
          />
        </>
      )}

      {chrome.timeBar && <TimeControls variant="bar" {...timeControlProps} />}

      {!chrome.skyAr && <ARModeButton isAR={false} onToggle={handleToggleAR} />}

      {chrome.skyAr && (
        <SkyARView
          satellites={visibleSatellites}
          groupColors={groupColors}
          cameraStream={cameraStream}
          cameraSettled={cameraSettled}
          orientationRef={orientationRef}
          orientationLive={orientationLive}
          orientationDenied={orientationDenied}
          onClose={leaveSkyAr}
          {...timeControlProps}
        />
      )}
    </div>
  );
}
