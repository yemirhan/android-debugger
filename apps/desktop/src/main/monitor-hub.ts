import { ipcMain } from 'electron';
import type { AdbService } from './adb';
import type { MonitorKind } from '../preload/monitor-types';
import { isMonitorKind, parseMonitorStart, type MonitorStartRequest } from './monitor-protocol';

/**
 * IPC for the renderer's background monitors.
 *
 * AdbService keeps one poller per monitor kind (starting a kind replaces its
 * previous poller), so however many views read a metric there is at most one
 * adb probe in flight per kind. Each sample is tagged with the session the
 * renderer started it with, letting the renderer drop stale samples after a
 * target switch.
 */
export function registerMonitorIpc(adb: AdbService): void {
  ipcMain.on('monitor:start', (event, kind, deviceId, packageName, interval, session) => {
    const request = parseMonitorStart(kind, deviceId, packageName, interval, session);
    if (!request) {
      console.warn('[monitor] Ignoring malformed start request for', kind);
      return;
    }
    const sender = event.sender;
    const emit = (payload: unknown) => {
      if (!sender.isDestroyed()) sender.send('monitor:sample', request.kind, request.session, payload);
    };
    try {
      startMonitor(adb, request, emit);
    } catch (error) {
      console.error(`[monitor] Failed to start ${request.kind} monitor:`, error);
    }
  });

  ipcMain.on('monitor:stop', (_, kind: unknown) => {
    if (isMonitorKind(kind)) stopMonitor(adb, kind);
  });
}

function startMonitor(adb: AdbService, request: MonitorStartRequest, emit: (payload: unknown) => void): void {
  const { kind, deviceId, packageName, interval } = request;
  switch (kind) {
    case 'memory':
      return adb.startMemoryMonitor(deviceId, packageName, interval, emit);
    case 'cpu':
      return adb.startCpuMonitor(deviceId, packageName, interval, emit);
    case 'fps':
      return adb.startFpsMonitor(deviceId, packageName, interval, emit);
    case 'battery':
      return adb.startBatteryMonitor(deviceId, interval, emit);
    case 'network-stats':
      return adb.startNetworkStatsMonitor(deviceId, packageName, interval, emit);
    case 'threads':
      return adb.startThreadMonitor(deviceId, packageName, interval, emit);
    case 'gc':
      return adb.startGcMonitor(deviceId, packageName, emit);
  }
}

function stopMonitor(adb: AdbService, kind: MonitorKind): void {
  switch (kind) {
    case 'memory':
      return adb.stopMemoryMonitor();
    case 'cpu':
      return adb.stopCpuMonitor();
    case 'fps':
      return adb.stopFpsMonitor();
    case 'battery':
      return adb.stopBatteryMonitor();
    case 'network-stats':
      return adb.stopNetworkStatsMonitor();
    case 'threads':
      return adb.stopThreadMonitor();
    case 'gc':
      return adb.stopGcMonitor();
  }
}
