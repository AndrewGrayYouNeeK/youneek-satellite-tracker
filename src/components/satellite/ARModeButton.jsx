import React from 'react';
import { Glasses, X } from 'lucide-react';

export default function ARModeButton({ isAR, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl border backdrop-blur-xl shadow-lg transition-all active:scale-95 ${
        isAR
          ? 'bg-primary/20 border-primary/50 text-primary'
          : 'bg-card/80 border-border/50 text-foreground hover:bg-secondary/60'
      }`}
    >
      {isAR ? <X className="w-4 h-4" /> : <Glasses className="w-4 h-4" />}
      <span className="text-xs font-medium">{isAR ? 'Exit AR' : 'AR Mode'}</span>
    </button>
  );
}