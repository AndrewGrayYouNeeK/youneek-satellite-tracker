import React from 'react';
import { X, Satellite, MapPin, ArrowUp, Gauge } from 'lucide-react';
import { SATELLITE_GROUPS } from '@/lib/satellite-data';

const GROUP_IMAGES = {
  starlink: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Starlink_Mission_%2847926144123%29.jpg/640px-Starlink_Mission_%2847926144123%29.jpg',
  stations: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/International_Space_Station_after_undocking_of_STS-132.jpg/640px-International_Space_Station_after_undocking_of_STS-132.jpg',
  active: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Terra_satellite.jpg/640px-Terra_satellite.jpg',
  gps: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/GPS_Satellite_NASA_art-iif.jpg/640px-GPS_Satellite_NASA_art-iif.jpg',
  weather: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/GOES-16_satellite.jpg/640px-GOES-16_satellite.jpg',
  science: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/HST-SM4.jpeg/640px-HST-SM4.jpeg',
};

export default function SatelliteInfoPanel({ satellite, onClose }) {
  if (!satellite) return null;

  const group = SATELLITE_GROUPS[satellite.group];
  const groupColor = group?.color || '#ffffff';

  return (
    <div className="absolute bottom-24 right-4 z-20 w-72 bg-card/90 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border/40"
        style={{ borderLeftColor: groupColor, borderLeftWidth: 3 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: groupColor, boxShadow: `0 0 6px ${groupColor}` }} />
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {group?.label || satellite.group}
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="w-full h-32 overflow-hidden bg-secondary/30">
        <img
          src={GROUP_IMAGES[satellite.group] || GROUP_IMAGES.active}
          alt={satellite.group}
          className="w-full h-full object-cover opacity-80"
          loading="lazy"
        />
      </div>

      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <Satellite className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <h2 className="text-sm font-semibold text-foreground leading-tight break-words">
            {satellite.name || 'Unknown Satellite'}
          </h2>
        </div>
      </div>

      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        <div className="bg-secondary/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <MapPin className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Latitude</span>
          </div>
          <span className="text-sm font-mono text-foreground">
            {satellite.lat?.toFixed(2)}°
          </span>
        </div>

        <div className="bg-secondary/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <MapPin className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Longitude</span>
          </div>
          <span className="text-sm font-mono text-foreground">
            {satellite.lng?.toFixed(2)}°
          </span>
        </div>

        <div className="bg-secondary/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <ArrowUp className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Altitude</span>
          </div>
          <span className="text-sm font-mono text-foreground">
            {satellite.altitude ? `${Math.round(satellite.altitude).toLocaleString()} km` : 'N/A'}
          </span>
        </div>

        <div className="bg-secondary/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-1">
            <Gauge className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Velocity</span>
          </div>
          <span className="text-sm font-mono text-foreground">
            {satellite.velocity ? `${satellite.velocity.toFixed(2)} km/s` : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
