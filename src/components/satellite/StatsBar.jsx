import React, { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';

export default function StatsBar({ totalCount, selectedSat }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-4 left-4 z-10">
      <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-xl px-3 py-2 flex items-center gap-3 shadow-2xl">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-mono text-muted-foreground">
            {time.toISOString().slice(11, 19)} UTC
          </span>
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-mono text-muted-foreground">
            {totalCount.toLocaleString()} objects
          </span>
        </div>
      </div>
    </div>
  );
}