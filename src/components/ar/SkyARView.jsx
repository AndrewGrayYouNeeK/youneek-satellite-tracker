import React, { useRef, useEffect, useState, useCallback } from 'react';
import { X, Satellite, Navigation } from 'lucide-react';
import { SATELLITE_GROUPS } from '@/lib/satellite-data';

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
function projectToScreen(azimuth, elevation, heading, tilt, roll, fovH, fovV, width, height) {
  const DEG = Math.PI / 180;

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

export default function SkyARView({ satellites, groupColors, onClose }) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const orientRef = useRef({ heading: 0, tilt: 45, roll: 0 });
  const [selectedSat, setSelectedSat] = useState(null);
  const [obsPos, setObsPos] = useState(null);
  const [permError, setPermError] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const animRef = useRef(null);
  const satellitesRef = useRef(satellites);

  useEffect(() => { satellitesRef.current = satellites; }, [satellites]);

  // Get user location
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setObsPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setObsPos({ lat: 51.5, lng: -0.1 }) // fallback: London
    );
  }, []);

  // Camera feed
  useEffect(() => {
    let stream = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
      })
      .catch(() => setCameraError(true));

    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  // Device orientation (compass + gyro)
  useEffect(() => {
    const handler = (e) => {
      // alpha = compass heading (0=North), beta = front/back tilt, gamma = left/right
      const alpha = e.alpha ?? 0;   // compass: 0-360
      const beta  = e.beta  ?? 45;  // tilt: 0=flat, 90=upright
      const gamma = e.gamma ?? 0;   // roll

      orientRef.current = {
        heading: alpha,
        tilt: 90 - beta,  // convert: phone upright (beta=90) -> looking at horizon (tilt=0)
        roll: gamma,
      };
    };

    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(state => {
          if (state === 'granted') window.addEventListener('deviceorientationabsolute', handler, true) || window.addEventListener('deviceorientation', handler);
          else setPermError('Gyroscope permission denied. Please allow motion sensors.');
        })
        .catch(() => setPermError('Could not request sensor permission.'));
    } else {
      window.addEventListener('deviceorientationabsolute', handler, true);
      window.addEventListener('deviceorientation', handler);
    }

    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler);
    };
  }, []);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!obsPos) {
      animRef.current = requestAnimationFrame(render);
      return;
    }

    const { heading, tilt } = orientRef.current;
    const fovH = 70, fovV = 50;

    // Draw crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 20, H / 2); ctx.lineTo(W / 2 + 20, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 20); ctx.lineTo(W / 2, H / 2 + 20); ctx.stroke();

    // Draw compass heading
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    ctx.fillText(`${dirs[Math.round(heading / 45) % 8]} ${Math.round(heading)}° | Tilt ${Math.round(tilt)}°`, W / 2, 28);

    const sats = satellitesRef.current;

    for (const sat of sats) {
      if (sat.altitude == null) continue;
      const { azimuth, elevation } = satToAzEl(sat.lat, sat.lng, sat.altitude, obsPos.lat, obsPos.lng);

      // Only show satellites above horizon
      if (elevation < -5) continue;

      const pos = projectToScreen(azimuth, elevation, heading, tilt, 0, fovH, fovV, W, H);
      if (!pos) continue;

      const color = groupColors[sat.group] || '#ffffff';

      // Glow
      const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 10);
      grad.addColorStop(0, color + 'cc');
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Label for stations (ISS etc) - always show
      if (sat.group === 'stations') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(sat.name, pos.x + 7, pos.y - 4);
      }
    }

    animRef.current = requestAnimationFrame(render);
  }, [obsPos, groupColors]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  // Canvas resize
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

  // Tap to select satellite
  const handleTap = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const tapX = e.clientX - rect.left;
    const tapY = e.clientY - rect.top;
    const W = canvasRef.current.width, H = canvasRef.current.height;
    const { heading, tilt } = orientRef.current;
    const fovH = 70, fovV = 50;

    let nearest = null, nearestDist = 30;
    for (const sat of satellitesRef.current) {
      if (sat.altitude == null || !obsPos) continue;
      const { azimuth, elevation } = satToAzEl(sat.lat, sat.lng, sat.altitude, obsPos.lat, obsPos.lng);
      if (elevation < -5) continue;
      const pos = projectToScreen(azimuth, elevation, heading, tilt, 0, fovH, fovV, W, H);
      if (!pos) continue;
      const d = Math.hypot(tapX - pos.x, tapY - pos.y);
      if (d < nearestDist) { nearestDist = d; nearest = sat; }
    }
    setSelectedSat(nearest || null);
  }, [obsPos]);

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline muted autoPlay
        style={{ opacity: cameraError ? 0 : 1 }}
      />

      {/* Dark overlay when no camera */}
      {cameraError && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 to-slate-900" />
      )}

      {/* AR Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onClick={handleTap}
        style={{ touchAction: 'manipulation' }}
      />

      {/* Permission / error message */}
      {permError && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 rounded-xl p-5 text-center max-w-xs">
          <Navigation className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-white text-sm">{permError}</p>
          <p className="text-white/50 text-xs mt-2">Compass & gyroscope required for AR sky view.</p>
        </div>
      )}

      {/* Loading location */}
      {!obsPos && !permError && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/60 text-sm">
          Getting your location…
        </div>
      )}

      {/* Selected satellite info */}
      {selectedSat && (
        <div className="absolute bottom-20 left-4 right-4 bg-black/70 backdrop-blur-xl border border-white/20 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Satellite className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-white font-semibold text-sm">{selectedSat.name}</p>
                <p className="text-white/50 text-xs mt-0.5">
                  {SATELLITE_GROUPS[selectedSat.group]?.label || selectedSat.group} •{' '}
                  {Math.round(selectedSat.altitude).toLocaleString()} km altitude
                </p>
                <p className="text-white/40 text-xs">
                  {selectedSat.lat?.toFixed(2)}° lat, {selectedSat.lng?.toFixed(2)}° lng
                </p>
              </div>
            </div>
            <button onClick={() => setSelectedSat(null)} className="text-white/40 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* HUD bottom bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-4">
        <div className="bg-black/50 backdrop-blur-xl border border-white/15 rounded-full px-4 py-2 text-xs text-white/60 font-mono">
          Point phone at sky • Tap a dot to identify
        </div>
      </div>

      {/* Exit button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/60 backdrop-blur border border-white/20 text-white text-xs font-medium active:scale-95 transition-all"
      >
        <X className="w-4 h-4" />
        Exit Sky AR
      </button>

      {/* Camera unavailable notice */}
      {cameraError && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 text-white/40 text-xs font-mono whitespace-nowrap">
          Camera unavailable — using dark sky
        </div>
      )}
    </div>
  );
}