import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, Satellite, Navigation } from 'lucide-react';
import TimeControls from '@/components/satellite/TimeControls';
import { SATELLITE_GROUPS } from '@/lib/satellite-data';

const LONDON = { lat: 51.5, lng: -0.1 };

// Convert satellite lat/lng/alt to an azimuth + elevation as seen from observer
function satToAzEl(satLat, satLng, satAlt, obsLat, obsLng) {
  const DEG = Math.PI / 180;
  const R = 6371; // km

  const obsLatR = obsLat * DEG;
  const obsLngR = obsLng * DEG;
  const satLatR = satLat * DEG;
  const satLngR = satLng * DEG;

  // Observer position (ECEF)
  const ox = R * Math.cos(obsLatR) * Math.cos(obsLngR);
  const oy = R * Math.cos(obsLatR) * Math.sin(obsLngR);
  const oz = R * Math.sin(obsLatR);

  // Satellite position (ECEF)
  const sr = R + satAlt;
  const sx = sr * Math.cos(satLatR) * Math.cos(satLngR);
  const sy = sr * Math.cos(satLatR) * Math.sin(satLngR);
  const sz = sr * Math.sin(satLatR);

  // Vector from observer to satellite
  const dx = sx - ox, dy = sy - oy, dz = sz - oz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Local ENU (East-North-Up) at observer
  const sinLat = Math.sin(obsLatR), cosLat = Math.cos(obsLatR);
  const sinLng = Math.sin(obsLngR), cosLng = Math.cos(obsLngR);

  const east  = -sinLng * dx + cosLng * dy;
  const north = -sinLat * cosLng * dx - sinLat * sinLng * dy + cosLat * dz;
  const up    =  cosLat * cosLng * dx + cosLat * sinLng * dy + sinLat * dz;

  const elevation = Math.atan2(up, Math.sqrt(east * east + north * north)) / DEG;
  const azimuth   = ((Math.atan2(east, north) / DEG) + 360) % 360;

  return { azimuth, elevation, distance: dist };
}

// Project az/el to screen XY given phone orientation
function projectToScreen(azimuth, elevation, heading, tilt, fovH, fovV, width, height) {
  // Difference between satellite direction and phone pointing direction
  let dAz = azimuth - heading;
  // Normalize to -180..180
  while (dAz > 180) dAz -= 360;
  while (dAz < -180) dAz += 360;

  const dEl = elevation - tilt;

  // Only show if within FOV
  if (Math.abs(dAz) > fovH / 2 + 5 || Math.abs(dEl) > fovV / 2 + 5) return null;

  const x = (dAz / (fovH / 2)) * (width / 2) + width / 2;
  const y = (-dEl / (fovV / 2)) * (height / 2) + height / 2;

  return { x, y };
}

function wrapHeading(value) {
  return ((value % 360) + 360) % 360;
}

export default function SkyARView({
  satellites,
  groupColors,
  cameraStream = null,
  cameraSettled = false,
  orientationRef,
  orientationLive = false,
  orientationDenied = false,
  onClose,
  simTime,
  isPlaying,
  speed,
  totalCount,
  onTogglePlay,
  onReset,
  onSpeedChange,
  onTimeScrub,
}) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const fallbackRef = useRef({ heading: 0, tilt: 45, roll: 0 });
  const orientRef = orientationRef ?? fallbackRef;
  const orientationLiveRef = useRef(orientationLive);
  orientationLiveRef.current = orientationLive;
  const dragRef = useRef(null);
  const [selectedSat, setSelectedSat] = useState(null);
  const [obsPos, setObsPos] = useState(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const animRef = useRef(null);
  const satellitesRef = useRef(satellites);

  useEffect(() => { satellitesRef.current = satellites; }, [satellites]);

  useEffect(() => {
    let cancelled = false;
    const apply = (pos) => {
      if (!cancelled) setObsPos(pos);
    };
    if (typeof navigator.geolocation?.getCurrentPosition !== 'function') {
      apply(LONDON);
      return undefined;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => apply({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => apply(LONDON),
    );
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    if (!cameraStream) {
      video.srcObject = null;
      return undefined;
    }
    try {
      video.srcObject = cameraStream;
      const play = video.play?.();
      if (play && typeof play.catch === 'function') play.catch(() => setVideoFailed(true));
    } catch {
      setVideoFailed(true);
    }
    return () => {
      try {
        video.srcObject = null;
      } catch {
        // The element may already be gone.
      }
    };
  }, [cameraStream]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animRef.current = requestAnimationFrame(render);
      return;
    }
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!obsPos) {
      animRef.current = requestAnimationFrame(render);
      return;
    }

    const { heading, tilt } = orientRef.current;
    const fovH = 70, fovV = 50;

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 20, H / 2); ctx.lineTo(W / 2 + 20, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 20); ctx.lineTo(W / 2, H / 2 + 20); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    ctx.fillText(`${dirs[Math.round(heading / 45) % 8]} ${Math.round(heading)}° | Tilt ${Math.round(tilt)}°`, W / 2, 72);

    const sats = satellitesRef.current || [];

    for (const sat of sats) {
      if (sat.altitude == null) continue;
      const { azimuth, elevation } = satToAzEl(sat.lat, sat.lng, sat.altitude, obsPos.lat, obsPos.lng);

      if (elevation < -5) continue;

      const pos = projectToScreen(azimuth, elevation, heading, tilt, fovH, fovV, W, H);
      if (!pos) continue;

      const color = groupColors[sat.group] || '#ffffff';

      const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 10);
      grad.addColorStop(0, color + 'cc');
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fill();

      if (sat.group === 'stations') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(sat.name, pos.x + 7, pos.y - 4);
      }
    }

    animRef.current = requestAnimationFrame(render);
  }, [groupColors, obsPos, orientRef]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const handleTap = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas || !obsPos) return;
    const rect = canvas.getBoundingClientRect();
    const tapX = event.clientX - rect.left;
    const tapY = event.clientY - rect.top;
    const W = canvas.width, H = canvas.height;
    const { heading, tilt } = orientRef.current;
    const fovH = 70, fovV = 50;

    let nearest = null, nearestDist = 30;
    for (const sat of satellitesRef.current || []) {
      if (sat.altitude == null) continue;
      const { azimuth, elevation } = satToAzEl(sat.lat, sat.lng, sat.altitude, obsPos.lat, obsPos.lng);
      if (elevation < -5) continue;
      const pos = projectToScreen(azimuth, elevation, heading, tilt, fovH, fovV, W, H);
      if (!pos) continue;
      const d = Math.hypot(tapX - pos.x, tapY - pos.y);
      if (d < nearestDist) { nearestDist = d; nearest = sat; }
    }
    setSelectedSat(nearest || null);
  }, [obsPos, orientRef]);

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const orient = orientRef.current;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      heading: orient.heading,
      tilt: orient.tilt,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional. The drag still tracks move events.
    }
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || orientationLiveRef.current) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (dx * dx + dy * dy > 9) drag.moved = true;
    if (!drag.moved) return;
    orientRef.current = {
      heading: wrapHeading(drag.heading - dx * 0.12),
      tilt: Math.max(-85, Math.min(85, drag.tilt - dy * 0.12)),
      roll: orientRef.current.roll || 0,
    };
  };

  const onPointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    handleTap(event);
  };

  const showFallback = !cameraStream || videoFailed;
  const showUnavailable = cameraSettled && showFallback;

  return (
    <section data-sky-ar="true" aria-label="Sky AR" className="fixed inset-0 z-50 overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        style={{ opacity: showFallback ? 0 : 1 }}
      />

      {showFallback && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 to-slate-900" />
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
      />

      <button
        type="button"
        onClick={onClose}
        className="pointer-events-auto absolute top-4 right-4 z-10 flex items-center gap-2 rounded-xl border border-white/20 bg-black/60 px-3 py-2 text-xs font-medium text-white backdrop-blur active:scale-95"
      >
        <X className="w-4 h-4" />
        Exit Sky AR
      </button>

      {orientationDenied && !orientationLive && (
        <div className="pointer-events-none absolute top-16 left-1/2 z-10 flex max-w-xs -translate-x-1/2 items-center gap-2 rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-center">
          <Navigation className="h-4 w-4 shrink-0 text-yellow-400" />
          <p className="text-xs text-white/80">Motion sensors are off. Drag to look around the sky.</p>
        </div>
      )}

      {!obsPos && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-white/60">
          Getting your location…
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-col items-center gap-2">
        {selectedSat && (
          <div className="pointer-events-auto w-full max-w-md rounded-xl border border-white/20 bg-black/70 p-4 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Satellite className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-white">{selectedSat.name}</p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {SATELLITE_GROUPS[selectedSat.group]?.label || selectedSat.group} •{' '}
                    {Math.round(selectedSat.altitude).toLocaleString()} km altitude
                  </p>
                  <p className="text-xs text-white/40">
                    {selectedSat.lat?.toFixed(2)}° lat, {selectedSat.lng?.toFixed(2)}° lng
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedSat(null)} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="pointer-events-none text-center">
          {showUnavailable && (
            <p className="mb-1 font-mono text-[10px] text-white/50">Camera unavailable — using dark sky</p>
          )}
          <p className="font-mono text-xs text-white/60">
            {orientationLive ? 'Point your device at the sky • Tap a dot to identify' : 'Drag to look around • Tap a dot to identify'}
          </p>
        </div>

        <div className="pointer-events-auto w-full max-w-md">
          <TimeControls
            variant="compact"
            simTime={simTime}
            isPlaying={isPlaying}
            speed={speed}
            totalCount={totalCount}
            onTogglePlay={onTogglePlay}
            onReset={onReset}
            onSpeedChange={onSpeedChange}
            onTimeScrub={onTimeScrub}
          />
        </div>
      </div>
    </section>
  );
}
