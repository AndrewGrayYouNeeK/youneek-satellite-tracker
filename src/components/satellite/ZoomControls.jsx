import React from 'react';
import { Plus, Minus, LocateFixed } from 'lucide-react';

export default function ZoomControls({ onZoomIn, onZoomOut, onResetView }) {
  return (
    <div data-view-obstruction="zoom" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
      <button
        type="button"
        onClick={onZoomIn}
        className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-lg bg-card/80 backdrop-blur-xl border border-border/50 text-foreground hover:bg-secondary/60 active:scale-95 transition-all shadow-lg"
        aria-label="Zoom in"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-lg bg-card/80 backdrop-blur-xl border border-border/50 text-foreground hover:bg-secondary/60 active:scale-95 transition-all shadow-lg"
        aria-label="Zoom out"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onResetView}
        className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-lg bg-card/80 backdrop-blur-xl border border-border/50 text-foreground hover:bg-secondary/60 active:scale-95 transition-all shadow-lg"
        aria-label="Reset view"
        title="Reset view"
      >
        <LocateFixed className="w-4 h-4" />
      </button>
    </div>
  );
}