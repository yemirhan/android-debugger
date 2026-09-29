import { useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  AppNetworkStats,
  BatteryInfo,
  CpuInfo,
  Device,
  FpsInfo,
  GcEvent,
  MemoryInfo,
  ThreadSnapshot,
} from '@android-debugger/shared';
import {
  BATTERY_POLL_INTERVAL,
  MAX_BATTERY_DATA_POINTS,
  MAX_CPU_DATA_POINTS,
  MAX_FPS_DATA_POINTS,
  MAX_MEMORY_DATA_POINTS,
  MAX_NETWORK_STATS_DATA_POINTS,
  NETWORK_STATS_POLL_INTERVAL,
} from '@android-debugger/shared';
import type { MonitorKind } from '../../../preload/monitor-types';
import type { TabId } from '../../App';
import { getAppSettings, useAppSettings } from '../app-settings';
import {
  MonitorChannel,
  MonitorGroup,
  type MonitorDriver,
  type MonitorGroupState,
  type MonitorState,
} from './monitor-channel';

/**
 * App-level background monitors. Each kind has exactly one channel (and so one
 * adb poller in the main process) no matter how many views read it; the
 * monitors keep running and collecting history while other tabs are open.
 * Mount useBackgroundMonitoring once at the app root.
 */

export type { MonitorKind } from '../../../preload/monitor-types';

// Thread snapshots read /proc for every thread; 2s keeps the cost down while
// still showing state changes. MAX_THREAD_SNAPSHOTS covers the last 2 minutes.
export const THREAD_MONITOR_INTERVAL = 2000;
export const MAX_THREAD_SNAPSHOTS = 60;
export const MAX_GC_EVENTS = 500;

export interface NetworkStatsHistory {
  timestamp: number;
  wifiRx: number;
  wifiTx: number;
  mobileRx: number;
  mobileTx: number;
}

let lastSession = 0;
const nextSession = () => ++lastSession;

function ipcDriver(kind: MonitorKind): MonitorDriver {
  return {
    start: (target, session, intervalMs) =>
      window.electronAPI.startMonitor(kind, target.deviceId, target.packageName, intervalMs, session),
    stop: () => window.electronAPI.stopMonitor(kind),
  };
}

const identity = <T,>(value: T) => value;
const initialSettings = getAppSettings();

export const monitors = {
  memory: new MonitorChannel<MemoryInfo>({
    scope: 'app',
    maxEntries: MAX_MEMORY_DATA_POINTS,
    toEntry: identity,
    driver: ipcDriver('memory'),
    intervalMs: initialSettings.memoryInterval,
    nextSession,
  }),
  cpu: new MonitorChannel<CpuInfo>({
    scope: 'app',
    maxEntries: MAX_CPU_DATA_POINTS,
    toEntry: identity,
    driver: ipcDriver('cpu'),
    intervalMs: initialSettings.cpuInterval,
    nextSession,
  }),
  fps: new MonitorChannel<FpsInfo>({
    scope: 'app',
    maxEntries: MAX_FPS_DATA_POINTS,
    toEntry: identity,
    driver: ipcDriver('fps'),
    intervalMs: initialSettings.fpsInterval,
    nextSession,
  }),
  battery: new MonitorChannel<BatteryInfo>({
    scope: 'device',
    maxEntries: MAX_BATTERY_DATA_POINTS,
    toEntry: identity,
    driver: ipcDriver('battery'),
    intervalMs: BATTERY_POLL_INTERVAL,
    nextSession,
  }),
  'network-stats': new MonitorChannel<AppNetworkStats, NetworkStatsHistory>({
    scope: 'app',
    maxEntries: MAX_NETWORK_STATS_DATA_POINTS,
    toEntry: (stats, receivedAt) => ({
      timestamp: receivedAt,
      wifiRx: stats.wifi.rxBytes,
      wifiTx: stats.wifi.txBytes,
      mobileRx: stats.mobile.rxBytes,
      mobileTx: stats.mobile.txBytes,
    }),
    driver: ipcDriver('network-stats'),
    intervalMs: NETWORK_STATS_POLL_INTERVAL,
    nextSession,
  }),
  threads: new MonitorChannel<ThreadSnapshot>({
    scope: 'app',
    maxEntries: MAX_THREAD_SNAPSHOTS,
    toEntry: identity,
    driver: ipcDriver('threads'),
    intervalMs: THREAD_MONITOR_INTERVAL,
    nextSession,
  }),
  gc: new MonitorChannel<GcEvent>({
    scope: 'app',
    maxEntries: MAX_GC_EVENTS,
    toEntry: identity,
    driver: ipcDriver('gc'),
    intervalMs: 0, // logcat stream, not polled
    nextSession,
  }),
} satisfies Record<MonitorKind, unknown>;

type Monitors = typeof monitors;
export type MonitorStateOf<K extends MonitorKind> = ReturnType<Monitors[K]['getState']>;

export const monitorGroup = new MonitorGroup<MonitorKind>(monitors, () => getAppSettings().autoStartMonitoring);

export const MONITOR_KINDS = Object.keys(monitors) as MonitorKind[];

export const MONITOR_LABELS: Record<MonitorKind, string> = {
  memory: 'Memory',
  cpu: 'CPU',
  fps: 'Frame rate',
  battery: 'Battery',
  'network-stats': 'Network usage',
  threads: 'Threads',
  gc: 'Garbage collection',
};

/** Which monitors feed each tab, for the sidebar's live indicators. */
export const TAB_MONITORS: Partial<Record<TabId, readonly MonitorKind[]>> = {
  memory: ['memory'],
  'cpu-fps': ['cpu', 'fps'],
  battery: ['battery'],
  'network-stats': ['network-stats'],
  'thread-monitor': ['threads'],
  'gc-monitor': ['gc'],
};

export function useMonitor<K extends MonitorKind>(kind: K): MonitorStateOf<K> {
  const channel = monitors[kind] as MonitorChannel<unknown, unknown>;
  return useSyncExternalStore(channel.subscribe, channel.getState) as MonitorStateOf<K>;
}

export function useMonitorGroup(): MonitorGroupState<MonitorKind> {
  return useSyncExternalStore(monitorGroup.subscribe, monitorGroup.getState);
}

/** True while any monitor behind these tabs is collecting data. */
export function useTabsLive(tabIds: readonly TabId[]): boolean {
  const { running } = useMonitorGroup();
  return tabIds.some((tabId) => TAB_MONITORS[tabId]?.some((kind) => running.includes(kind)));
}

/**
 * Drive every background monitor from the selected target and settings.
 * Mount once, at the app root.
 */
export function useBackgroundMonitoring(device: Device | null, packageName: string): void {
  const { memoryInterval, cpuInterval, fpsInterval, autoStartMonitoring } = useAppSettings();
  const deviceId = device?.id ?? null;

  useEffect(
    () =>
      window.electronAPI.onMonitorSample((kind, session, payload) => {
        const channel = monitors[kind] as MonitorChannel<unknown, unknown> | undefined;
        channel?.receive(session, payload);
      }),
    []
  );

  useEffect(() => {
    monitorGroup.setTarget(deviceId ? { deviceId, packageName } : null);
  }, [deviceId, packageName]);

  // Stop every poller if the app shell goes away.
  useEffect(() => () => monitorGroup.setTarget(null), []);

  useEffect(() => monitors.memory.setInterval(memoryInterval), [memoryInterval]);
  useEffect(() => monitors.cpu.setInterval(cpuInterval), [cpuInterval]);
  useEffect(() => monitors.fps.setInterval(fpsInterval), [fpsInterval]);

  // Turning auto-start on starts whatever isn't running yet (unless paused).
  const previousAutoStart = useRef(autoStartMonitoring);
  useEffect(() => {
    const turnedOn = autoStartMonitoring && !previousAutoStart.current;
    previousAutoStart.current = autoStartMonitoring;
    if (turnedOn && !monitorGroup.getState().paused) monitorGroup.resumeAll();
  }, [autoStartMonitoring]);
}

export interface MonitorControls {
  startMonitoring: () => void;
  stopMonitoring: () => void;
  clearData: () => void;
}

const controlsCache = new Map<MonitorKind, MonitorControls>();

/** Stable start/stop/clear callbacks; start and stop apply app-wide. */
export function monitorControls(kind: MonitorKind): MonitorControls {
  let controls = controlsCache.get(kind);
  if (!controls) {
    controls = {
      startMonitoring: () => monitorGroup.start(kind),
      stopMonitoring: () => monitorGroup.stop(kind),
      clearData: () => monitors[kind].clear(),
    };
    controlsCache.set(kind, controls);
  }
  return controls;
}
