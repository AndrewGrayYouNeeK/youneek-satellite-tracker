import React, { useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Clock, Globe } from 'lucide-react';

const SPEEDS = [1, 10, 60, 300];
const SPEED_LABELS = ['1x', '10x', '1min/s', '5min/s'];

export default function TimeControls({
  simTime,
  isPlaying,
  speed,
  totalCount,
  onTogglePlay,
  onReset,
  onSpeedChange,
  onTimeScrub,
}) {
  const barRef = useRef(null);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const progress = ((simTime - startOfDay.getTime()) / (endOfDay.getTime() - startOfDay.getTime())) * 100;
  const clampedProgress = Math.max(0, Math.min(100, progress));

  const timeStr = new Date(simTime).toISOString().slice(11, 19);
  const dateStr = new Date(simTime).toISOString().slice(0, 10);

  const handleScrub = (clientX) => {
    if (!barRef.current || !onTimeScrub) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    onTimeScrub(pct);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[380px] max-w-[90vw]">
      <div className="bg-card/85 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">{dateStr}</span>
          </div>
          <span className="text-sm font-mono text-primary font-semibold">{timeStr} UTC</span>
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {totalCount.toLocaleString()}
            </span>
          </div>
        </div>

        <div
          ref={barRef}
          className="w-full h-2 bg-secondary rounded-full mb-3 overflow-hidden cursor-pointer group"
          onClick={(e) => handleScrub(e.clientX)}
          onMouseDown={(e) => {
            const onMove = (ev) => handleScrub(ev.clientX);
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            handleScrub(e.clientX);
          }}
          role="slider"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
        >
          <div
            className="h-full bg-primary rounded-full relative"
            style={{ width: `${clampedProgress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onReset}
            className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Reset to now"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onTogglePlay}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="text-xs font-medium">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <div className="flex items-center gap-1">
            <FastForward className="w-3 h-3 text-muted-foreground" />
            {SPEEDS.map((s, i) => (
              <button
                key={s}
                onClick={() => onSpeedChange(s)}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                  speed === s
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
              >
                {SPEED_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
