import { contextBridge, ipcRenderer } from 'electron';
import type {
  Device,
  MemoryInfo,
  CpuInfo,
  FpsInfo,
  LogEntry,
  SdkMessage,
  AppMetadata,
  DeveloperOptions,
  FileEntry,
  SharedPreference,
  DatabaseInfo,
  DatabaseQueryResult,
  IntentConfig,
  IntentHistoryEntry,
  ScreenshotResult,
  RecordingState,
} from '@android-debugger/shared';

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

  // App Metadata
  getAppMetadata: (deviceId: string, packageName: string) => Promise<AppMetadata | null>;

  // Screen Capture
  takeScreenshot: (deviceId: string) => Promise<ScreenshotResult | null>;
  startScreenRecording: (deviceId: string) => Promise<{ success: boolean; path?: string }>;
  stopScreenRecording: (deviceId: string) => Promise<{ success: boolean; path?: string }>;
  onRecordingUpdate: (callback: (state: RecordingState) => void) => UnsubscribeFn;

  // Developer Options
  getDeveloperOptions: (deviceId: string) => Promise<DeveloperOptions | null>;
  setLayoutBounds: (deviceId: string, enabled: boolean) => Promise<boolean>;
  setGpuOverdraw: (deviceId: string, mode: DeveloperOptions['gpuOverdraw']) => Promise<boolean>;
  setAnimationScale: (deviceId: string, scale: number, type: 'window' | 'transition' | 'animator') => Promise<boolean>;
  setShowTouches: (deviceId: string, enabled: boolean) => Promise<boolean>;
  setPointerLocation: (deviceId: string, enabled: boolean) => Promise<boolean>;

  // File Inspector
  listFiles: (deviceId: string, packageName: string, path: string) => Promise<FileEntry[]>;
  readFile: (deviceId: string, packageName: string, path: string) => Promise<string | null>;
  readSharedPrefs: (deviceId: string, packageName: string) => Promise<SharedPreference[]>;
  listDatabases: (deviceId: string, packageName: string) => Promise<DatabaseInfo[]>;
  queryDatabase: (deviceId: string, packageName: string, dbName: string, query: string) => Promise<DatabaseQueryResult | null>;

  // Intent Tester
  fireIntent: (deviceId: string, intent: IntentConfig) => Promise<{ success: boolean; error?: string }>;
  fireDeepLink: (deviceId: string, uri: string) => Promise<{ success: boolean; error?: string }>;
  saveIntent: (intent: IntentConfig) => Promise<void>;
  getSavedIntents: () => Promise<IntentConfig[]>;
  deleteSavedIntent: (id: string) => Promise<void>;
  getIntentHistory: () => Promise<IntentHistoryEntry[]>;
  clearIntentHistory: () => Promise<void>;
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

  // App Metadata
  getAppMetadata: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:get-app-metadata', deviceId, packageName),

  // Screen Capture
  takeScreenshot: (deviceId) => ipcRenderer.invoke('screen:take-screenshot', deviceId),
  startScreenRecording: (deviceId) => ipcRenderer.invoke('screen:start-recording', deviceId),
  stopScreenRecording: (deviceId) => ipcRenderer.invoke('screen:stop-recording', deviceId),
  onRecordingUpdate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, state: RecordingState) => callback(state);
    ipcRenderer.on('recording-update', listener);
    return () => ipcRenderer.removeListener('recording-update', listener);
  },

  // Developer Options
  getDeveloperOptions: (deviceId) => ipcRenderer.invoke('dev-options:get', deviceId),
  setLayoutBounds: (deviceId, enabled) =>
    ipcRenderer.invoke('dev-options:set-layout-bounds', deviceId, enabled),
  setGpuOverdraw: (deviceId, mode) =>
    ipcRenderer.invoke('dev-options:set-gpu-overdraw', deviceId, mode),
  setAnimationScale: (deviceId, scale, type) =>
    ipcRenderer.invoke('dev-options:set-animation-scale', deviceId, scale, type),
  setShowTouches: (deviceId, enabled) =>
    ipcRenderer.invoke('dev-options:set-show-touches', deviceId, enabled),
  setPointerLocation: (deviceId, enabled) =>
    ipcRenderer.invoke('dev-options:set-pointer-location', deviceId, enabled),

  // File Inspector
  listFiles: (deviceId, packageName, path) =>
    ipcRenderer.invoke('files:list', deviceId, packageName, path),
  readFile: (deviceId, packageName, path) =>
    ipcRenderer.invoke('files:read', deviceId, packageName, path),
  readSharedPrefs: (deviceId, packageName) =>
    ipcRenderer.invoke('files:read-shared-prefs', deviceId, packageName),
  listDatabases: (deviceId, packageName) =>
    ipcRenderer.invoke('files:list-databases', deviceId, packageName),
  queryDatabase: (deviceId, packageName, dbName, query) =>
    ipcRenderer.invoke('files:query-database', deviceId, packageName, dbName, query),

  // Intent Tester
  fireIntent: (deviceId, intent) => ipcRenderer.invoke('intent:fire', deviceId, intent),
  fireDeepLink: (deviceId, uri) => ipcRenderer.invoke('intent:fire-deep-link', deviceId, uri),
  saveIntent: (intent) => ipcRenderer.invoke('intent:save', intent),
  getSavedIntents: () => ipcRenderer.invoke('intent:get-saved'),
  deleteSavedIntent: (id) => ipcRenderer.invoke('intent:delete-saved', id),
  getIntentHistory: () => ipcRenderer.invoke('intent:get-history'),
  clearIntentHistory: () => ipcRenderer.invoke('intent:clear-history'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
