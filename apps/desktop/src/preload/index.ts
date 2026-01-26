import { contextBridge, ipcRenderer } from 'electron';
import type { Device, MemoryInfo, CpuInfo, FpsInfo, LogEntry, SdkMessage } from '@android-debugger/shared';

export type UnsubscribeFn = () => void;

export interface ElectronAPI {
  // Device
  getDevices: () => Promise<Device[]>;
  getDeviceInfo: (deviceId: string) => Promise<Device | null>;

  // Memory
  getMemInfo: (deviceId: string, packageName: string) => Promise<MemoryInfo | null>;
  startMemoryMonitor: (deviceId: string, packageName: string, interval?: number) => void;
  stopMemoryMonitor: () => void;
  onMemoryUpdate: (callback: (info: MemoryInfo) => void) => UnsubscribeFn;

  // Logs
  startLogcat: (deviceId: string, filters?: string[]) => void;
  stopLogcat: () => void;
  clearLogcat: (deviceId: string) => Promise<void>;
  onLogEntry: (callback: (entry: LogEntry) => void) => UnsubscribeFn;

  // CPU
  getCpu: (deviceId: string, packageName: string) => Promise<CpuInfo | null>;
  startCpuMonitor: (deviceId: string, packageName: string, interval?: number) => void;
  stopCpuMonitor: () => void;
  onCpuUpdate: (callback: (info: CpuInfo) => void) => UnsubscribeFn;

  // FPS
  getFps: (deviceId: string, packageName: string) => Promise<FpsInfo | null>;
  startFpsMonitor: (deviceId: string, packageName: string, interval?: number) => void;
  stopFpsMonitor: () => void;
  onFpsUpdate: (callback: (info: FpsInfo) => void) => UnsubscribeFn;

  // App management
  getPackages: (deviceId: string, debuggableOnly?: boolean) => Promise<string[]>;
  launchApp: (deviceId: string, packageName: string) => Promise<void>;
  killApp: (deviceId: string, packageName: string) => Promise<void>;
  clearAppData: (deviceId: string, packageName: string) => Promise<void>;

  // WebSocket
  startWsServer: (port: number) => Promise<void>;
  stopWsServer: () => Promise<void>;
  getWsConnections: () => Promise<number>;
  onSdkMessage: (callback: (data: { clientId: string; message: SdkMessage }) => void) => UnsubscribeFn;
  onSdkConnection: (callback: (data: { clientId: string; connected: boolean }) => void) => UnsubscribeFn;
}

const electronAPI: ElectronAPI = {
  // Device
  getDevices: () => ipcRenderer.invoke('adb:get-devices'),
  getDeviceInfo: (deviceId) => ipcRenderer.invoke('adb:get-device-info', deviceId),

  // Memory
  getMemInfo: (deviceId, packageName) => ipcRenderer.invoke('adb:get-meminfo', deviceId, packageName),
  startMemoryMonitor: (deviceId, packageName, interval) =>
    ipcRenderer.send('adb:start-memory-monitor', deviceId, packageName, interval),
  stopMemoryMonitor: () => ipcRenderer.send('adb:stop-memory-monitor'),
  onMemoryUpdate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, info: MemoryInfo) => callback(info);
    ipcRenderer.on('memory-update', listener);
    return () => ipcRenderer.removeListener('memory-update', listener);
  },

  // Logs
  startLogcat: (deviceId, filters) => ipcRenderer.send('adb:start-logcat', deviceId, filters),
  stopLogcat: () => ipcRenderer.send('adb:stop-logcat'),
  clearLogcat: (deviceId) => ipcRenderer.invoke('adb:clear-logcat', deviceId),
  onLogEntry: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, entry: LogEntry) => callback(entry);
    ipcRenderer.on('log-entry', listener);
    return () => ipcRenderer.removeListener('log-entry', listener);
  },

  // CPU
  getCpu: (deviceId, packageName) => ipcRenderer.invoke('adb:get-cpu', deviceId, packageName),
  startCpuMonitor: (deviceId, packageName, interval) =>
    ipcRenderer.send('adb:start-cpu-monitor', deviceId, packageName, interval),
  stopCpuMonitor: () => ipcRenderer.send('adb:stop-cpu-monitor'),
  onCpuUpdate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, info: CpuInfo) => callback(info);
    ipcRenderer.on('cpu-update', listener);
    return () => ipcRenderer.removeListener('cpu-update', listener);
  },

  // FPS
  getFps: (deviceId, packageName) => ipcRenderer.invoke('adb:get-fps', deviceId, packageName),
  startFpsMonitor: (deviceId, packageName, interval) =>
    ipcRenderer.send('adb:start-fps-monitor', deviceId, packageName, interval),
  stopFpsMonitor: () => ipcRenderer.send('adb:stop-fps-monitor'),
  onFpsUpdate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, info: FpsInfo) => callback(info);
    ipcRenderer.on('fps-update', listener);
    return () => ipcRenderer.removeListener('fps-update', listener);
  },

  // App management
  getPackages: (deviceId, debuggableOnly) =>
    ipcRenderer.invoke('adb:get-packages', deviceId, debuggableOnly),
  launchApp: (deviceId, packageName) => ipcRenderer.invoke('adb:launch-app', deviceId, packageName),
  killApp: (deviceId, packageName) => ipcRenderer.invoke('adb:kill-app', deviceId, packageName),
  clearAppData: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:clear-app-data', deviceId, packageName),

  // WebSocket
  startWsServer: (port) => ipcRenderer.invoke('ws:start-server', port),
  stopWsServer: () => ipcRenderer.invoke('ws:stop-server'),
  getWsConnections: () => ipcRenderer.invoke('ws:get-connections'),
  onSdkMessage: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, data: { clientId: string; message: SdkMessage }) =>
      callback(data);
    ipcRenderer.on('sdk-message', listener);
    return () => ipcRenderer.removeListener('sdk-message', listener);
  },
  onSdkConnection: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, data: { clientId: string; connected: boolean }) =>
      callback(data);
    ipcRenderer.on('sdk-connection', listener);
    return () => ipcRenderer.removeListener('sdk-connection', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
