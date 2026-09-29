import type { MonitorKind } from '../preload/monitor-types';

/**
 * Validation for the `monitor:start` IPC. Kept free of electron/adb imports so
 * it can be unit tested with node:test.
 */

interface IntervalPolicy {
  /** Used when the renderer sends nothing usable. */
  fallback: number;
  min: number;
  max: number;
}

// Heavier probes get higher floors: a thread snapshot reads /proc for every
// thread, netstats dumps the whole device's history, battery barely changes.
// GC is a logcat stream, so its interval is ignored.
export const MONITOR_INTERVALS: Record<MonitorKind, IntervalPolicy> = {
  memory: { fallback: 1000, min: 250, max: 60_000 },
  cpu: { fallback: 1000, min: 250, max: 60_000 },
  fps: { fallback: 1000, min: 500, max: 60_000 },
  battery: { fallback: 5000, min: 1000, max: 60_000 },
  'network-stats': { fallback: 5000, min: 1000, max: 60_000 },
  threads: { fallback: 2000, min: 1000, max: 60_000 },
  gc: { fallback: 0, min: 0, max: 0 },
};

export function isMonitorKind(value: unknown): value is MonitorKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MONITOR_INTERVALS, value);
}

export function clampMonitorInterval(kind: MonitorKind, interval: unknown): number {
  const { fallback, min, max } = MONITOR_INTERVALS[kind];
  if (typeof interval !== 'number' || !Number.isFinite(interval) || interval <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(interval)));
}

export function isValidSession(session: unknown): session is number {
  return typeof session === 'number' && Number.isSafeInteger(session) && session > 0;
}

/**
 * Seconds since the epoch at the start of a `logcat -v epoch` line, e.g.
 * "  1790671179.794 22314 22335 I tag: message" -> 1790671179.794.
 */
export function parseLogcatEpoch(line: string): number | null {
  const match = /^\s*(\d{9,11}\.\d{3,9})\s/.exec(line);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export interface MonitorStartRequest {
  kind: MonitorKind;
  deviceId: string;
  packageName: string;
  interval: number;
  session: number;
}

/** Parse raw IPC arguments; returns null for anything malformed. */
export function parseMonitorStart(
  kind: unknown,
  deviceId: unknown,
  packageName: unknown,
  interval: unknown,
  session: unknown
): MonitorStartRequest | null {
  if (!isMonitorKind(kind) || !isValidSession(session)) return null;
  if (typeof deviceId !== 'string' || !deviceId) return null;
  const pkg = typeof packageName === 'string' ? packageName : '';
  if (kind !== 'battery' && !pkg) return null;
  return {
    kind,
    deviceId,
    packageName: kind === 'battery' ? '' : pkg,
    interval: clampMonitorInterval(kind, interval),
    session,
  };
}
