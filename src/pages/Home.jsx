import React, { useState, useEffect, useCallback, useRef } from 'react';
import EarthGlobe from '@/components/globe/EarthGlobe';
import SatellitePanel from '@/components/satellite/SatellitePanel';
import StatsBar from '@/components/satellite/StatsBar';
import ZoomControls from '@/components/satellite/ZoomControls';
import { SATELLITE_GROUPS, fetchSatelliteGroup } from '@/lib/satellite-data';
import { parseTLEData, getSatellitePositions } from '@/lib/tle-parser';

export default function Home() {
  const [activeGroups, setActiveGroups] = useState(['starlink', 'stations']);
  const [zoomDelta, setZoomDelta] = useState(0);
  const [satellites, setSatellites] = useState([]);
  const [satelliteCounts, setSatelliteCounts] = useState({});
  const [loading, setLoading] = useState({});
  const tleCache = useRef({});

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

  // Load and propagate satellites
  useEffect(() => {
    let cancelled = false;

    async function updatePositions() {
      const allPositions = [];

      for (const groupKey of activeGroups) {
        const tles = await loadGroup(groupKey);
        if (cancelled) return;

        // For large groups like starlink/active, sample to keep performance smooth
        let sampled = tles;
        if (tles.length > 2000) {
          const step = Math.ceil(tles.length / 2000);
          sampled = tles.filter((_, i) => i % step === 0);
        }

        const positions = getSatellitePositions(sampled);
        positions.forEach(p => {
          p.group = groupKey;
        });
        allPositions.push(...positions);
      }

      if (!cancelled) {
        setSatellites(allPositions);
      }
    }

    updatePositions();

    // Update positions every 10 seconds
    const interval = setInterval(updatePositions, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeGroups, loadGroup]);

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
    <div className="fixed inset-0 bg-background overflow-hidden">
      <EarthGlobe
        satellites={satellites}
        groupColors={groupColors}
        activeGroups={activeGroups}
        zoomDelta={zoomDelta}
      />
      <ZoomControls
        onZoomIn={() => setZoomDelta(d => d + 1)}
        onZoomOut={() => setZoomDelta(d => d - 1)}
      />
      <SatellitePanel
        activeGroups={activeGroups}
        onToggleGroup={handleToggleGroup}
        satelliteCounts={satelliteCounts}
        loading={loading}
        totalCount={totalCount}
      />
      <StatsBar totalCount={totalCount} />
    </div>
  );
}