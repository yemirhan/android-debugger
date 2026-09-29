import React, { useEffect, useRef, useState } from 'react';
import {
  MONITOR_KINDS,
  MONITOR_LABELS,
  monitorControls,
  monitorGroup,
  useMonitor,
  useMonitorGroup,
  type MonitorKind,
} from '../../lib/monitoring/monitors';

const PauseIcon = () => (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
    <rect x="14" y="5" width="3.5" height="14" rx="1" />
  </svg>
);

function formatInterval(kind: MonitorKind, intervalMs: number): string {
  if (kind === 'gc') return 'as it happens';
  if (intervalMs < 1000) return `every ${intervalMs} ms`;
  const seconds = intervalMs / 1000;
  return `every ${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

function MonitorRow({ kind }: { kind: MonitorKind }) {
  const { running, targetKey, intervalMs, entries } = useMonitor(kind);
  const available = targetKey !== '';
  const { startMonitoring, stopMonitoring } = monitorControls(kind);

  let status: string;
  if (!available) status = 'Pick an app to monitor';
  else if (running) status = `${formatInterval(kind, intervalMs)}, ${entries.length} ${kind === 'gc' ? 'events' : 'samples'}`;
  else status = 'Paused';

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${running ? 'bg-signal' : 'bg-border'}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-text-primary">{MONITOR_LABELS[kind]}</p>
        <p className="text-xs text-text-muted truncate">{status}</p>
      </div>
      <button
        role="switch"
        aria-checked={running}
        aria-label={`${MONITOR_LABELS[kind]} monitoring`}
        disabled={!available}
        onClick={running ? stopMonitoring : startMonitoring}
        className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
          running ? 'bg-accent' : 'bg-surface-hover border border-border'
        }`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow transition-[left] ${
            running ? 'left-[16px]' : 'left-[2px]'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Header control for the app-wide background monitors: shows whether they are
 * collecting and lets the user pause/resume them all or one by one.
 */
export function MonitoringStatus() {
  const { running, available, paused } = useMonitorGroup();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (available.length === 0) return null;

  const live = running.length > 0;
  const label = live ? 'Monitoring' : paused ? 'Monitoring paused' : 'Monitoring off';
  const summary = live
    ? `Collecting ${running.map((kind) => MONITOR_LABELS[kind].toLowerCase()).join(', ')} in the background`
    : 'Background monitoring is off';

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={summary}
        className={`h-7 px-2 flex items-center gap-1.5 rounded-md text-xs transition-colors hover:bg-surface-hover ${
          live ? 'text-text-secondary' : 'text-text-muted'
        } ${open ? 'bg-surface-hover' : ''}`}
      >
        {live ? <span className="w-1.5 h-1.5 rounded-full bg-signal" aria-hidden /> : <PauseIcon />}
        <span className="max-[1100px]:sr-only">{label}</span>
        {live && <span className="font-mono text-text-muted">{running.length}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Background monitoring"
          className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-surface-elevated border border-border rounded-lg shadow-xl shadow-black/40 animate-pop-in"
        >
          <div className="px-3 pt-3 pb-2">
            <p className="text-[13px] font-medium text-text-primary">Background monitoring</p>
            <p className="text-xs text-text-muted mt-0.5">
              Keeps collecting history while you use other tools. Pause it to save battery and adb traffic.
            </p>
          </div>
          <div className="border-t border-border-muted py-1">
            {MONITOR_KINDS.map((kind) => (
              <MonitorRow key={kind} kind={kind} />
            ))}
          </div>
          <div className="border-t border-border-muted p-2 flex gap-2">
            {live && (
              <button
                onClick={() => monitorGroup.pauseAll()}
                className="flex-1 h-8 rounded-md text-sm font-medium bg-surface-hover text-text-primary hover:bg-border-muted transition-colors"
              >
                Pause all
              </button>
            )}
            {running.length < available.length && (
              <button
                onClick={() => monitorGroup.resumeAll()}
                className="flex-1 h-8 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                {live ? 'Start all' : 'Resume all'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
