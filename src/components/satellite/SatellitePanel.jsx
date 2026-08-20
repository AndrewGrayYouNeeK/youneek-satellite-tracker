import React, { useState } from 'react';
import { Switch } from "@/components/ui/switch";
import { Satellite, Radio, Loader2, ChevronDown, ChevronUp, Search, AlertCircle } from 'lucide-react';
import { SATELLITE_GROUPS } from '@/lib/satellite-data';

export default function SatellitePanel({
  activeGroups,
  onToggleGroup,
  satelliteCounts,
  loading,
  loadErrors = {},
  totalCount,
  searchQuery,
  onSearchChange,
  searchResults,
  onSelectSearchResult,
}) {
  const [groupsVisible, setGroupsVisible] = useState(true);

  return (
    <div className="absolute top-4 left-4 z-10 w-64 md:w-72" style={{ maxHeight: 'calc(100vh - 2rem)', display: 'flex', flexDirection: 'column' }}>
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl p-4 mb-3 shadow-2xl">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Satellite className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground tracking-tight">YouNeeK Tracker</h1>
            <p className="text-xs text-muted-foreground">Real-time orbital positions</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Radio className="w-3 h-3 text-primary animate-pulse" />
          <span className="text-xs font-mono text-primary">
            {totalCount.toLocaleString()} satellites tracked
          </span>
        </div>
      </div>

      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl mb-3 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search satellites…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-secondary/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
            {searchResults.map((sat, i) => (
              <button
                key={`${sat.name}-${sat.group}-${i}`}
                onClick={() => onSelectSearchResult(sat)}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-secondary/60 transition-colors"
              >
                <span className="text-xs font-medium text-foreground block truncate">{sat.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {SATELLITE_GROUPS[sat.group]?.label || sat.group}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden" style={{ overflowY: 'auto' }}>
        <button
          onClick={() => setGroupsVisible(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors"
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Satellite Groups
          </p>
          {groupsVisible ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        {groupsVisible && (
          <div className="px-3 pb-3 space-y-1">
            {Object.entries(SATELLITE_GROUPS).map(([key, group]) => {
              const isActive = activeGroups.includes(key);
              const count = satelliteCounts[key] || 0;
              const isLoading = loading[key];
              const error = loadErrors[key];

              return (
                <div
                  key={key}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: isActive ? group.color : 'transparent',
                        border: `2px solid ${group.color}`,
                        boxShadow: isActive ? `0 0 8px ${group.color}40` : 'none',
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{group.label}</span>
                        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                        {error && <AlertCircle className="w-3 h-3 text-destructive" title={error} />}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {error ? 'Load failed' : count > 0 ? `${count.toLocaleString()} objects` : 'Not loaded'}
                      </span>
                    </div>
                  </div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => onToggleGroup(key)}
                    className="scale-75 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
