import React from 'react';
import { Plus, Minus } from 'lucide-react';

export default function ZoomControls({ onZoomIn, onZoomOut }) {
  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
      <button
        onClick={onZoomIn}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-card/80 backdrop-blur-xl border border-border/50 text-foreground hover:bg-secondary/60 active:scale-95 transition-all shadow-lg"
        aria-label="Zoom in"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={onZoomOut}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-card/80 backdrop-blur-xl border border-border/50 text-foreground hover:bg-secondary/60 active:scale-95 transition-all shadow-lg"
        aria-label="Zoom out"
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}