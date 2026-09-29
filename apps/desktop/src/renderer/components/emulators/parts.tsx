import React, { useEffect, useState } from 'react';
import type { AvdInfo, BootProgress } from '../../../main/emulator-types';
import { formatBytes } from '../../../main/emulator-parsers';
import { formatElapsed, versionLabel } from '../../lib/emulators';

/** Re-renders every second while `active` (for elapsed boot timers). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function isTransitioning(avd: AvdInfo): boolean {
  return avd.state === 'starting' || avd.state === 'booting' || avd.state === 'stopping';
}

/** Running is the only state that gets the green signal color. */
export function StatusDot({ state, className = '' }: { state: AvdInfo['state']; className?: string }) {
  if (state === 'running') return <span className={`w-2 h-2 rounded-full bg-signal flex-shrink-0 ${className}`} />;
  if (state === 'starting' || state === 'booting') {
    return <span className={`w-2 h-2 rounded-full bg-accent animate-pulse-dot flex-shrink-0 ${className}`} />;
  }
  if (state === 'stopping') return <span className={`w-2 h-2 rounded-full bg-text-muted animate-pulse-dot flex-shrink-0 ${className}`} />;
  return <span className={`w-2 h-2 rounded-full border border-text-muted flex-shrink-0 ${className}`} />;
}

export function stateLabel(avd: AvdInfo, now: number): string {
  switch (avd.state) {
    case 'running':
      return 'Running';
    case 'stopping':
      return 'Stopping…';
    case 'starting':
    case 'booting': {
      const started = avd.boot && avd.boot.phase !== 'ready' && avd.boot.phase !== 'failed' ? avd.boot.startedAt : null;
      return started ? `Booting · ${formatElapsed(now - started)}` : 'Booting…';
    }
    default:
      return 'Stopped';
  }
}

const STEPS = ['Launching', 'Connecting', 'Booting Android', 'Ready'];

function bootStep(avd: AvdInfo, boot: BootProgress | null): number {
  if (avd.state === 'running' || boot?.phase === 'ready') return 3;
  if (!boot || boot.phase === 'failed') return avd.state === 'booting' ? 2 : 0;
  if (boot.phase === 'launching' || boot.phase === 'waiting-for-device') return 0;
  return /adb/i.test(boot.message) ? 1 : 2;
}

/** Four-step boot indicator: honest phases rather than a fake percentage. */
export function BootSteps({ avd }: { avd: AvdInfo }) {
  const boot = avd.boot;
  const step = bootStep(avd, boot);
  const message =
    boot && boot.phase !== 'ready' && boot.phase !== 'failed'
      ? boot.message
      : avd.state === 'booting'
        ? 'Booting Android…'
        : 'Starting the emulator…';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3" aria-label={`Boot progress: ${message}`}>
        <div className="flex gap-1 w-40 flex-shrink-0">
          {STEPS.map((label, index) => (
            <span
              key={label}
              title={label}
              className={`h-1 flex-1 rounded-full ${
                index < step ? 'bg-accent' : index === step ? 'bg-accent animate-pulse-dot' : 'bg-surface-hover'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-text-secondary truncate">{message}</span>
      </div>
      {boot?.warning && boot.phase !== 'ready' && boot.phase !== 'failed' && <p className="text-xs text-log-warn">{boot.warning}</p>}
    </div>
  );
}

/** "Android 16 · API 36 · Google Play · Pixel 6" */
export function avdSummary(avd: AvdInfo): string {
  const parts = [versionLabel(avd.androidVersion, avd.apiLevel)];
  if (avd.tagDisplay) parts.push(avd.tagDisplay);
  const profile = avd.deviceProfile ? profileName(avd.deviceProfile) : null;
  if (profile) parts.push(profile);
  return parts.join(' · ');
}

/** pixel_6_pro → Pixel 6 Pro (good enough for ids without a loaded profile list). */
export function profileName(id: string): string {
  return id
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => (/^(xl|tv|xr)$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

export function ramLabel(ramMb: number | null): string | null {
  if (!ramMb) return null;
  return ramMb % 1024 === 0 ? `${ramMb / 1024} GB` : `${ramMb} MB`;
}

export function sizeLabel(bytes: number | null): string | null {
  return formatBytes(bytes);
}
