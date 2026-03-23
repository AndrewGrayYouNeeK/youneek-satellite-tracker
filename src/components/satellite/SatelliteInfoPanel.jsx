import React from 'react';
import { X, Satellite, MapPin, ArrowUp } from 'lucide-react';
import { SATELLITE_GROUPS } from '@/lib/satellite-data';

const GROUP_IMAGES = {
  starlink: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=400&q=80',
  stations: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&q=80',
  active: 'https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=400&q=80',
  gps: 'https://images.unsplash.com/photo-1569230173733-59d5a2a3e3b9?w=400&q=80',
  weather: 'https://images.unsplash.com/photo-1504608524841-42584120d693?w=400&q=80',
  science: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400&q=80',
};

export default function SatelliteInfoPanel({ satellite, onClose }) {
  if (!satellite) return null;

  const group = SATELLITE_GROUPS[satellite.group];
  const groupColor = group?.color || '#ffffff';

  return (
    <div className="absolute bottom-20 right-4 z-20 w-72 bg-card/90 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40"
        style={{ borderLeftColor: groupColor, borderLeftWidth: 3 }}>
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

      {/* Satellite image */}
      <div className="w-full h-32 overflow-hidden">
        <img
          src={GROUP_IMAGES[satellite.group] || GROUP_IMAGES.active}
          alt={satellite.group}
          className="w-full h-full object-cover opacity-80"
        />
      </div>

      {/* Satellite name */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <Satellite className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <h2 className="text-sm font-semibold text-foreground leading-tight break-words">
            {satellite.name || 'Unknown Satellite'}
          </h2>
        </div>
      </div>

      {/* Stats */}
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

        <div className="bg-secondary/40 rounded-lg px-3 py-2 col-span-2">
          <div className="flex items-center gap-1 mb-1">
            <ArrowUp className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Altitude</span>
          </div>
          <span className="text-sm font-mono text-foreground">
            {satellite.altitude ? `${Math.round(satellite.altitude).toLocaleString()} km` : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}