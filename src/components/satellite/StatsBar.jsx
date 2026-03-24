import React, { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';

export default function StatsBar({ totalCount, selectedSat }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-4 left-4 right-4 z-10" style={{ bottom: '120px' }}>
      <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              UTC {time.toISOString().slice(11, 19)}
            </span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              {totalCount.toLocaleString()} active objects in orbit
            </span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/60">
            Data: CelesTrak NORAD • Drag to rotate • Scroll to zoom
          </span>
        </div>
      </div>
    </div>
  );
}