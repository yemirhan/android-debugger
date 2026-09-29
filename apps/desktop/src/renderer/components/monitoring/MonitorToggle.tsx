import React from 'react';

interface MonitorToggleProps {
  isMonitoring: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  /** Lowercase noun for tooltips, e.g. "memory". */
  what: string;
}

/**
 * Pause/start button for a background monitor. The monitors are app-wide, so
 * this pauses collection everywhere, not just in the current view.
 */
export function MonitorToggle({ isMonitoring, onStart, onStop, disabled = false, what }: MonitorToggleProps) {
  return (
    <button
      onClick={isMonitoring ? onStop : onStart}
      disabled={disabled}
      title={
        isMonitoring
          ? `Pause ${what} monitoring everywhere; collected history is kept`
          : `Collect ${what} in the background, even while other tools are open`
      }
      className={`h-8 px-3 text-sm rounded-md transition-colors btn-press disabled:opacity-50 disabled:cursor-not-allowed ${
        isMonitoring
          ? 'text-text-secondary bg-surface border border-border-muted hover:bg-surface-hover hover:text-text-primary'
          : 'font-medium bg-accent text-white hover:bg-accent-hover'
      }`}
    >
      {isMonitoring ? 'Pause' : 'Start'}
    </button>
  );
}

/** "Live" status next to a panel title while its monitor is collecting. */
export function MonitorLiveBadge({ live, what }: { live: boolean; what: string }) {
  if (!live) return null;
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-text-secondary"
      title={`Collecting ${what} in the background, even while other tools are open`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot" aria-hidden />
      Live
    </span>
  );
}
