import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  Device,
  MemoryInfo,
  CpuInfo,
  FpsInfo,
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
  UpdateInfo,
  UpdateProgress,
  UpdateCheckResult,
  UpdateSettings,
  BatteryInfo,
  CrashEntry,
  ServiceInfo,
  AppNetworkStats,
  ActivityStackInfo,
  JobSchedulerInfo,
  AlarmMonitorInfo,
  InstallOptions,
  InstallResult,
  InstallProgress,
  DeviceSpec,
  SelectedAppFile,
  ThreadSnapshot,
  GcEvent,
  HeapDumpInfo,
  HeapAnalysis,
  HeapInstance,
  MethodTraceInfo,
  MethodTraceAnalysis,
  ScrcpyConfig,
  ScrcpyState,
  BundleAnalysisResult,
} from '@android-debugger/shared';
import type { MonitorApi, MonitorKind } from './monitor-types';
import type {
  LogBatch,
  LogHistoryRequest,
  LogHistoryResult,
  LogStreamRequest,
  LogStreamStatus,
} from '../main/logcat-format';
import type { MetroAppCommand, MetroProbe } from '../main/rn-devtools-protocol';
import type { MirrorServerStatus, MirrorStartOptions, MirrorStartResult } from '../renderer/lib/mirror/types';
import type { McpPublicState, McpSettingsPatch } from '../main/mcp-types';
import type { AppSection } from '../main/app-tabs';
import type {
  AvailableImagesResult,
  AvdInfo,
  AvdListResult,
  BootProgress,
  CreateAvdRequest,
  DeviceProfile,
  EmulatorSetup,
  ImageInstallJob,
  StartAvdOptions,
  SystemImage,
} from '../main/emulator-types';

export type UnsubscribeFn = () => void;
export type SocketTransportType = 'socket' | 'logcat' | 'none';

export interface ElectronAPI extends MonitorApi {
  // Device
  getDevices: () => Promise<Device[]>;
  getDeviceInfo: (deviceId: string) => Promise<Device | null>;
  setSelectedDevice: (deviceId: string | null) => void;
  /** Reports the UI's device + app to main (MCP tools default to it). */
  setSelection: (deviceId: string | null, packageName: string) => void;
  /** An MCP client chose a device (and maybe an app); `packageName` undefined = keep/restore as usual. */
  onSelectTarget: (callback: (target: { deviceId: string; packageName?: string }) => void) => UnsubscribeFn;
  /** A selection an MCP client made before this page could receive it (null when none). */
  takePendingSelection: () => Promise<{ deviceId: string; packageName?: string } | null>;
  onAppNavigate: (callback: (tabId: string, section?: AppSection) => void) => UnsubscribeFn;

  // Memory
  getMemInfo: (deviceId: string, packageName: string) => Promise<MemoryInfo | null>;
  startMemoryMonitor: (deviceId: string, packageName: string, interval?: number) => void;
  stopMemoryMonitor: () => void;
  onMemoryUpdate: (callback: (info: MemoryInfo) => void) => UnsubscribeFn;

  // Logs
  /** Starts the visible log stream from "now"; batches/status echo `request.sessionId`. */
  startLogStream: (request: LogStreamRequest) => void;
  stopLogcat: () => void;
  loadLogHistory: (request: LogHistoryRequest) => Promise<LogHistoryResult>;
  exportLogs: (content: string, defaultName: string) => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
  onLogBatch: (callback: (batch: LogBatch) => void) => UnsubscribeFn;
  onLogStreamStatus: (callback: (status: LogStreamStatus) => void) => UnsubscribeFn;
  startSdkLogcat: (deviceId: string, packageName?: string) => void;
  stopSdkLogcat: () => void;
  clearLogcat: (deviceId: string) => Promise<void>;

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

  // SDK Messages (received via logcat when logcat is running)
  onSdkMessage: (callback: (data: { message: SdkMessage }) => void) => UnsubscribeFn;
  socketConnect: (deviceId: string, packageName: string) => void;
  socketDisconnect: () => void;
  onSocketStatusChanged: (callback: (status: { type: SocketTransportType }) => void) => UnsubscribeFn;

  // App Metadata
  getAppMetadata: (deviceId: string, packageName: string) => Promise<AppMetadata | null>;

  // Screen Capture
  takeScreenshot: (deviceId: string) => Promise<ScreenshotResult | null>;
  startScreenRecording: (deviceId: string) => Promise<{ success: boolean; path?: string }>;
  stopScreenRecording: (deviceId: string) => Promise<{ success: boolean; path?: string }>;
  getRecordingState: () => Promise<RecordingState>;
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

  // App Info
  getAdbInfo: () => Promise<{ path: string; version: string; source: 'bundled' | 'system' | 'android-sdk' } | null>;
  getJavaInfo: () => Promise<{ path: string; version: string } | null>;

  // Auto-updater
  checkForUpdates: () => Promise<UpdateCheckResult>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  getUpdateSettings: () => Promise<UpdateSettings>;
  setUpdateSettings: (settings: UpdateSettings) => Promise<void>;
  onUpdateChecking: (callback: () => void) => UnsubscribeFn;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => UnsubscribeFn;
  onUpdateNotAvailable: (callback: () => void) => UnsubscribeFn;
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => UnsubscribeFn;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => UnsubscribeFn;
  onUpdateError: (callback: (error: string) => void) => UnsubscribeFn;

  // Battery
  getBatteryInfo: (deviceId: string) => Promise<BatteryInfo | null>;
  startBatteryMonitor: (deviceId: string, interval?: number) => void;
  stopBatteryMonitor: () => void;
  onBatteryUpdate: (callback: (info: BatteryInfo) => void) => UnsubscribeFn;

  // Crash Logcat
  startCrashLogcat: (deviceId: string) => void;
  stopCrashLogcat: () => void;
  clearCrashLogcat: (deviceId: string) => Promise<void>;
  onCrashEntry: (callback: (entry: CrashEntry) => void) => UnsubscribeFn;

  // Services
  getRunningServices: (deviceId: string, packageName?: string) => Promise<ServiceInfo[]>;

  // Network Stats
  getNetworkStats: (deviceId: string, packageName?: string) => Promise<AppNetworkStats | null>;
  startNetworkStatsMonitor: (deviceId: string, packageName: string, interval?: number) => void;
  stopNetworkStatsMonitor: () => void;
  onNetworkStatsUpdate: (callback: (stats: AppNetworkStats) => void) => UnsubscribeFn;

  // Activity Stack
  getActivityStack: (deviceId: string, packageName: string) => Promise<ActivityStackInfo | null>;

  // Job Scheduler
  getScheduledJobs: (deviceId: string, packageName?: string) => Promise<JobSchedulerInfo | null>;

  // Alarm Monitor
  getScheduledAlarms: (deviceId: string, packageName?: string) => Promise<AlarmMonitorInfo | null>;

  // App Installer
  selectAppFile: () => Promise<SelectedAppFile | null>;
  installApp: (deviceId: string, filePath: string, options: InstallOptions) => Promise<InstallResult>;
  getDeviceSpec: (deviceId: string) => Promise<DeviceSpec>;
  checkJava: () => Promise<boolean>;
  checkBundletool: () => Promise<boolean>;
  getBundletoolInfo: () => Promise<{ path: string; version: string } | null>;
  needsBundletoolDownload: () => Promise<boolean>;
  downloadBundletool: () => Promise<{ success: boolean; error?: string }>;
  onBundletoolDownloadProgress: (callback: (progress: { percent: number; message: string }) => void) => UnsubscribeFn;
  onInstallProgress: (callback: (progress: InstallProgress) => void) => UnsubscribeFn;

  // Bundle Analyzer
  analyzeBundle: (filePath: string) => Promise<BundleAnalysisResult>;
  extractBundleEntry: (bundlePath: string, entryPath: string) => Promise<{ success: boolean; savedPath?: string; canceled?: boolean; error?: string }>;
  getPathForFile: (file: File) => string;

  // Shell
  openExternal: (url: string) => Promise<void>;

  // Thread Monitor
  getThreads: (deviceId: string, packageName: string) => Promise<ThreadSnapshot | null>;
  startThreadMonitor: (deviceId: string, packageName: string, interval: number) => void;
  stopThreadMonitor: () => void;
  onThreadUpdate: (callback: (snapshot: ThreadSnapshot) => void) => UnsubscribeFn;

  // GC Monitor
  startGcMonitor: (deviceId: string, packageName: string) => void;
  stopGcMonitor: () => void;
  onGcEvent: (callback: (event: GcEvent) => void) => UnsubscribeFn;

  // Heap Dump
  captureHeapDump: (deviceId: string, packageName: string) => Promise<HeapDumpInfo>;
  analyzeHeapDump: (filePath: string) => Promise<HeapAnalysis | null>;
  getHeapInstances: (filePath: string, classId: number) => Promise<HeapInstance[]>;
  deleteHeapDumps: (filePaths: string[]) => Promise<void>;
  exportHeapReport: (report: string, defaultName: string) => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
  onHeapDumpProgress: (callback: (progress: { id: string; status: string; progress?: number; error?: string }) => void) => UnsubscribeFn;

  // Method Trace
  startMethodTrace: (deviceId: string, packageName: string) => Promise<{ success: boolean; error?: string }>;
  stopMethodTrace: (deviceId: string, packageName: string) => Promise<MethodTraceInfo>;
  cancelMethodTrace: () => Promise<void>;
  analyzeMethodTrace: (filePath: string) => Promise<MethodTraceAnalysis | null>;

  // Screen Mirror (scrcpy)
  checkScrcpy: () => Promise<boolean>;
  getScrcpyInfo: () => Promise<{ path: string; version: string } | null>;
  needsScrcpyDownload: () => Promise<boolean>;
  downloadScrcpy: () => Promise<{ success: boolean; error?: string }>;
  startMirror: (deviceId: string, config: ScrcpyConfig) => Promise<{ success: boolean; error?: string }>;
  stopMirror: () => Promise<{ success: boolean }>;
  getScrcpyState: () => Promise<ScrcpyState>;
  isMirroring: (deviceId?: string) => Promise<boolean>;
  onScrcpyDownloadProgress: (callback: (progress: { percent: number; message: string }) => void) => UnsubscribeFn;
  onMirrorStarted: (callback: (state: ScrcpyState) => void) => UnsubscribeFn;
  onMirrorStopped: (callback: () => void) => UnsubscribeFn;
  onMirrorError: (callback: (error: string) => void) => UnsubscribeFn;

  // Command panel
  captureScreenshot: (deviceId: string, deviceLabel?: string) => Promise<{ path: string; bytes: number }>;
  startRecordingToCaptures: (deviceId: string, deviceLabel?: string) => Promise<{ success: boolean; path?: string }>;
  uninstallApp: (deviceId: string, packageName: string) => Promise<void>;
  sendKeyEvents: (deviceId: string, keyCodes: number[]) => Promise<void>;
  openCapturesFolder: () => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<void>;
  writeClipboardImage: (filePath: string) => Promise<void>;

  // React Native DevTools (Metro)
  rnDevtools: {
    probe: (port: number) => Promise<MetroProbe>;
    sendCommand: (port: number, method: MetroAppCommand) => Promise<{ ok: boolean; error?: string }>;
    openExternal: (port: number, targetId: string) => Promise<{ ok: boolean; error?: string }>;
    isReversed: (deviceId: string, port: number) => Promise<boolean>;
    reverse: (deviceId: string, port: number) => Promise<{ ok: boolean; error?: string }>;
    openDevMenuViaAdb: (deviceId: string) => Promise<{ ok: boolean; error?: string }>;
    /** App shortcuts pressed while focus is inside the DevTools webview. */
    onShortcut: (callback: (shortcut: 'command-palette') => void) => UnsubscribeFn;
  };

  // Local MCP server for AI assistants (Settings → AI assistants)
  mcp: {
    getState: () => Promise<McpPublicState>;
    getToken: () => Promise<string>;
    update: (patch: McpSettingsPatch) => Promise<McpPublicState>;
    regenerateToken: () => Promise<McpPublicState>;
    /** Starts the server again after an error (e.g. the port was freed). */
    retry: () => Promise<McpPublicState>;
    onState: (callback: (state: McpPublicState) => void) => UnsubscribeFn;
  };

  // Emulators (AVD manager)
  emulators: {
    getSetup: (force?: boolean) => Promise<EmulatorSetup>;
    list: () => Promise<AvdListResult>;
    start: (name: string, options?: StartAvdOptions) => Promise<BootProgress>;
    stop: (name: string) => Promise<void>;
    delete: (name: string) => Promise<void>;
    wipe: (name: string) => Promise<void>;
    rename: (name: string, newName: string) => Promise<void>;
    deleteSnapshot: (name: string, snapshot: string) => Promise<void>;
    showInFolder: (name: string) => Promise<void>;
    getDeviceProfiles: (force?: boolean) => Promise<DeviceProfile[]>;
    getSystemImages: () => Promise<SystemImage[]>;
    getAvailableImages: (force?: boolean) => Promise<AvailableImagesResult>;
    create: (request: CreateAvdRequest) => Promise<AvdInfo>;
    installImage: (packageId: string) => Promise<ImageInstallJob>;
    getInstallJobs: () => Promise<ImageInstallJob[]>;
    respondToLicense: (jobId: string, accept: boolean) => Promise<void>;
    cancelInstall: (jobId: string) => Promise<void>;
    onBoot: (callback: (progress: BootProgress) => void) => UnsubscribeFn;
    onInstall: (callback: (job: ImageInstallJob) => void) => UnsubscribeFn;
    onChanged: (callback: () => void) => UnsubscribeFn;
  };

  // In-app screen mirror. Video and input use a MessagePort delivered to the
  // page with window.postMessage({ source: 'adbg-mirror-port', sessionId }).
  getMirrorServerStatus: () => Promise<MirrorServerStatus>;
  startInAppMirror: (deviceId: string, options: MirrorStartOptions) => Promise<MirrorStartResult>;
  stopInAppMirror: (sessionId?: string) => Promise<{ success: boolean }>;
}

const socketStatusListeners = new Set<(status: { type: SocketTransportType }) => void>();

const electronAPI: ElectronAPI = {
  // Background monitors (see monitor-types.ts)
  startMonitor: (kind, deviceId, packageName, interval, session) =>
    ipcRenderer.send('monitor:start', kind, deviceId, packageName, interval, session),
  stopMonitor: (kind) => ipcRenderer.send('monitor:stop', kind),
  onMonitorSample: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, kind: MonitorKind, session: number, payload: unknown) =>
      callback(kind, session, payload);
    ipcRenderer.on('monitor:sample', listener);
    return () => ipcRenderer.removeListener('monitor:sample', listener);
  },

  // Device
  getDevices: () => ipcRenderer.invoke('adb:get-devices'),
  getDeviceInfo: (deviceId) => ipcRenderer.invoke('adb:get-device-info', deviceId),
  setSelectedDevice: (deviceId) => ipcRenderer.send('app:set-selected-device', deviceId),
  setSelection: (deviceId, packageName) => ipcRenderer.send('app:set-selection', deviceId, packageName),
  takePendingSelection: () => ipcRenderer.invoke('app:take-pending-selection'),
  onSelectTarget: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, target: { deviceId: string; packageName?: string }) => callback(target);
    ipcRenderer.on('app:select-target', listener);
    return () => ipcRenderer.removeListener('app:select-target', listener);
  },
  onAppNavigate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, tabId: string, section?: AppSection) => callback(tabId, section);
    ipcRenderer.on('app:navigate', listener);
    return () => ipcRenderer.removeListener('app:navigate', listener);
  },

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
  startLogStream: (request) => ipcRenderer.send('logs:start', request),
  stopLogcat: () => ipcRenderer.send('adb:stop-logcat'),
  loadLogHistory: (request) => ipcRenderer.invoke('logs:history', request),
  exportLogs: (content, defaultName) => ipcRenderer.invoke('logs:export', content, defaultName),
  onLogBatch: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, batch: LogBatch) => callback(batch);
    ipcRenderer.on('logs:batch', listener);
    return () => ipcRenderer.removeListener('logs:batch', listener);
  },
  onLogStreamStatus: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, status: LogStreamStatus) => callback(status);
    ipcRenderer.on('logs:status', listener);
    return () => ipcRenderer.removeListener('logs:status', listener);
  },
  startSdkLogcat: (deviceId, packageName) => ipcRenderer.send('adb:start-sdk-logcat', deviceId, packageName),
  stopSdkLogcat: () => ipcRenderer.send('adb:stop-sdk-logcat'),
  clearLogcat: (deviceId) => ipcRenderer.invoke('adb:clear-logcat', deviceId),

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

  // SDK Messages (received via logcat)
  onSdkMessage: (callback) => {
    // Main batches SDK messages; delivering a batch in one task lets React
    // coalesce the resulting state updates into a single render.
    const listener = (_: Electron.IpcRendererEvent, messages: SdkMessage[]) => {
      for (const message of messages) callback({ message });
    };
    ipcRenderer.on('sdk-messages', listener);
    return () => ipcRenderer.removeListener('sdk-messages', listener);
  },
  // Native socket transport is not available in this build. Keep the optional
  // renderer hook honest by immediately selecting the supported logcat transport.
  socketConnect: () => {
    queueMicrotask(() => {
      for (const listener of socketStatusListeners) listener({ type: 'logcat' });
    });
  },
  socketDisconnect: () => {
    for (const listener of socketStatusListeners) listener({ type: 'none' });
  },
  onSocketStatusChanged: (callback) => {
    socketStatusListeners.add(callback);
    return () => socketStatusListeners.delete(callback);
  },

  // App Metadata
  getAppMetadata: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:get-app-metadata', deviceId, packageName),

  // Screen Capture
  takeScreenshot: (deviceId) => ipcRenderer.invoke('screen:take-screenshot', deviceId),
  startScreenRecording: (deviceId) => ipcRenderer.invoke('screen:start-recording', deviceId),
  stopScreenRecording: (deviceId) => ipcRenderer.invoke('screen:stop-recording', deviceId),
  getRecordingState: () => ipcRenderer.invoke('screen:get-recording-state'),
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

  // App Info
  getAdbInfo: () => ipcRenderer.invoke('app:get-adb-info'),
  getJavaInfo: () => ipcRenderer.invoke('app:get-java-info'),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getAppVersion: () => ipcRenderer.invoke('updater:get-version'),
  getUpdateSettings: () => ipcRenderer.invoke('updater:get-settings'),
  setUpdateSettings: (settings) => ipcRenderer.invoke('updater:set-settings', settings),
  onUpdateChecking: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('updater:checking', listener);
    return () => ipcRenderer.removeListener('updater:checking', listener);
  },
  onUpdateAvailable: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater:available', listener);
    return () => ipcRenderer.removeListener('updater:available', listener);
  },
  onUpdateNotAvailable: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('updater:not-available', listener);
    return () => ipcRenderer.removeListener('updater:not-available', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, progress: UpdateProgress) => callback(progress);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
    ipcRenderer.on('updater:downloaded', listener);
    return () => ipcRenderer.removeListener('updater:downloaded', listener);
  },
  onUpdateError: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('updater:error', listener);
    return () => ipcRenderer.removeListener('updater:error', listener);
  },

  // Battery
  getBatteryInfo: (deviceId) => ipcRenderer.invoke('adb:get-battery', deviceId),
  startBatteryMonitor: (deviceId, interval) =>
    ipcRenderer.send('adb:start-battery-monitor', deviceId, interval),
  stopBatteryMonitor: () => ipcRenderer.send('adb:stop-battery-monitor'),
  onBatteryUpdate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, info: BatteryInfo) => callback(info);
    ipcRenderer.on('battery-update', listener);
    return () => ipcRenderer.removeListener('battery-update', listener);
  },

  // Crash Logcat
  startCrashLogcat: (deviceId) => ipcRenderer.send('adb:start-crash-logcat', deviceId),
  stopCrashLogcat: () => ipcRenderer.send('adb:stop-crash-logcat'),
  clearCrashLogcat: (deviceId) => ipcRenderer.invoke('adb:clear-crash-logcat', deviceId),
  onCrashEntry: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, entry: CrashEntry) => callback(entry);
    ipcRenderer.on('crash-entry', listener);
    return () => ipcRenderer.removeListener('crash-entry', listener);
  },

  // Services
  getRunningServices: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:get-services', deviceId, packageName),

  // Network Stats
  getNetworkStats: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:get-network-stats', deviceId, packageName),
  startNetworkStatsMonitor: (deviceId, packageName, interval) =>
    ipcRenderer.send('adb:start-network-stats-monitor', deviceId, packageName, interval),
  stopNetworkStatsMonitor: () => ipcRenderer.send('adb:stop-network-stats-monitor'),
  onNetworkStatsUpdate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, stats: AppNetworkStats) => callback(stats);
    ipcRenderer.on('network-stats-update', listener);
    return () => ipcRenderer.removeListener('network-stats-update', listener);
  },

  // Activity Stack
  getActivityStack: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:get-activity-stack', deviceId, packageName),

  // Job Scheduler
  getScheduledJobs: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:get-scheduled-jobs', deviceId, packageName),

  // Alarm Monitor
  getScheduledAlarms: (deviceId, packageName) =>
    ipcRenderer.invoke('adb:get-scheduled-alarms', deviceId, packageName),

  // App Installer
  selectAppFile: () => ipcRenderer.invoke('app:select-file'),
  installApp: (deviceId, filePath, options) =>
    ipcRenderer.invoke('app:install', deviceId, filePath, options),
  getDeviceSpec: (deviceId) => ipcRenderer.invoke('app:get-device-spec', deviceId),
  checkJava: () => ipcRenderer.invoke('app:check-java'),
  checkBundletool: () => ipcRenderer.invoke('app:check-bundletool'),
  getBundletoolInfo: () => ipcRenderer.invoke('app:get-bundletool-info'),
  needsBundletoolDownload: () => ipcRenderer.invoke('app:needs-bundletool-download'),
  downloadBundletool: () => ipcRenderer.invoke('app:download-bundletool'),
  onBundletoolDownloadProgress: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, progress: { percent: number; message: string }) => callback(progress);
    ipcRenderer.on('bundletool-download-progress', listener);
    return () => ipcRenderer.removeListener('bundletool-download-progress', listener);
  },
  onInstallProgress: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, progress: InstallProgress) => callback(progress);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },

  // Bundle Analyzer
  analyzeBundle: (filePath) => ipcRenderer.invoke('bundle:analyze', filePath),
  extractBundleEntry: (bundlePath, entryPath) => ipcRenderer.invoke('bundle:extract-entry', bundlePath, entryPath),
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Thread Monitor
  getThreads: (deviceId, packageName) =>
    ipcRenderer.invoke('profiler:get-threads', deviceId, packageName),
  startThreadMonitor: (deviceId, packageName, interval) =>
    ipcRenderer.send('profiler:start-thread-monitor', deviceId, packageName, interval),
  stopThreadMonitor: () => ipcRenderer.send('profiler:stop-thread-monitor'),
  onThreadUpdate: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, snapshot: ThreadSnapshot) => callback(snapshot);
    ipcRenderer.on('thread-update', listener);
    return () => ipcRenderer.removeListener('thread-update', listener);
  },

  // GC Monitor
  startGcMonitor: (deviceId, packageName) =>
    ipcRenderer.send('profiler:start-gc-monitor', deviceId, packageName),
  stopGcMonitor: () => ipcRenderer.send('profiler:stop-gc-monitor'),
  onGcEvent: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, event: GcEvent) => callback(event);
    ipcRenderer.on('gc-event', listener);
    return () => ipcRenderer.removeListener('gc-event', listener);
  },

  // Heap Dump
  captureHeapDump: (deviceId, packageName) =>
    ipcRenderer.invoke('profiler:capture-heap-dump', deviceId, packageName),
  analyzeHeapDump: (filePath) =>
    ipcRenderer.invoke('profiler:analyze-heap-dump', filePath),
  getHeapInstances: (filePath, classId) =>
    ipcRenderer.invoke('profiler:get-heap-instances', filePath, classId),
  deleteHeapDumps: (filePaths) => ipcRenderer.invoke('profiler:delete-heap-dumps', filePaths),
  exportHeapReport: (report, defaultName) =>
    ipcRenderer.invoke('profiler:export-heap-report', report, defaultName),
  onHeapDumpProgress: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, progress: { id: string; status: string; progress?: number; error?: string }) => callback(progress);
    ipcRenderer.on('heap-dump-progress', listener);
    return () => ipcRenderer.removeListener('heap-dump-progress', listener);
  },

  // Method Trace
  startMethodTrace: (deviceId, packageName) =>
    ipcRenderer.invoke('profiler:start-method-trace', deviceId, packageName),
  stopMethodTrace: (deviceId, packageName) =>
    ipcRenderer.invoke('profiler:stop-method-trace', deviceId, packageName),
  cancelMethodTrace: () => ipcRenderer.invoke('profiler:cancel-method-trace'),
  analyzeMethodTrace: (filePath) =>
    ipcRenderer.invoke('profiler:analyze-method-trace', filePath),

  // Screen Mirror (scrcpy)
  checkScrcpy: () => ipcRenderer.invoke('scrcpy:check'),
  getScrcpyInfo: () => ipcRenderer.invoke('scrcpy:get-info'),
  needsScrcpyDownload: () => ipcRenderer.invoke('scrcpy:needs-download'),
  downloadScrcpy: () => ipcRenderer.invoke('scrcpy:download'),
  startMirror: (deviceId, config) => ipcRenderer.invoke('scrcpy:start', deviceId, config),
  stopMirror: () => ipcRenderer.invoke('scrcpy:stop'),
  getScrcpyState: () => ipcRenderer.invoke('scrcpy:get-state'),
  isMirroring: (deviceId) => ipcRenderer.invoke('scrcpy:is-mirroring', deviceId),
  onScrcpyDownloadProgress: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, progress: { percent: number; message: string }) => callback(progress);
    ipcRenderer.on('scrcpy-download-progress', listener);
    return () => ipcRenderer.removeListener('scrcpy-download-progress', listener);
  },
  onMirrorStarted: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, state: ScrcpyState) => callback(state);
    ipcRenderer.on('scrcpy-mirror-started', listener);
    return () => ipcRenderer.removeListener('scrcpy-mirror-started', listener);
  },
  onMirrorStopped: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('scrcpy-mirror-stopped', listener);
    return () => ipcRenderer.removeListener('scrcpy-mirror-stopped', listener);
  },
  onMirrorError: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('scrcpy-mirror-error', listener);
    return () => ipcRenderer.removeListener('scrcpy-mirror-error', listener);
  },

  // Command panel
  captureScreenshot: (deviceId, deviceLabel) =>
    ipcRenderer.invoke('commands:capture-screenshot', deviceId, deviceLabel),
  startRecordingToCaptures: (deviceId, deviceLabel) =>
    ipcRenderer.invoke('commands:start-recording', deviceId, deviceLabel),
  uninstallApp: (deviceId, packageName) => ipcRenderer.invoke('commands:uninstall-app', deviceId, packageName),
  sendKeyEvents: (deviceId, keyCodes) => ipcRenderer.invoke('commands:send-key-events', deviceId, keyCodes),
  openCapturesFolder: () => ipcRenderer.invoke('commands:open-captures-folder'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  writeClipboardImage: (filePath) => ipcRenderer.invoke('clipboard:write-image', filePath),

  // React Native DevTools (Metro)
  rnDevtools: {
    probe: (port) => ipcRenderer.invoke('rn-devtools:probe', port),
    sendCommand: (port, method) => ipcRenderer.invoke('rn-devtools:command', port, method),
    openExternal: (port, targetId) => ipcRenderer.invoke('rn-devtools:open-external', port, targetId),
    isReversed: (deviceId, port) => ipcRenderer.invoke('rn-devtools:is-reversed', deviceId, port),
    reverse: (deviceId, port) => ipcRenderer.invoke('rn-devtools:reverse', deviceId, port),
    openDevMenuViaAdb: (deviceId) => ipcRenderer.invoke('rn-devtools:dev-menu-adb', deviceId),
    onShortcut: (callback) => {
      const listener = (_: Electron.IpcRendererEvent, shortcut: 'command-palette') => callback(shortcut);
      ipcRenderer.on('rn-devtools:shortcut', listener);
      return () => ipcRenderer.removeListener('rn-devtools:shortcut', listener);
    },
  },

  // Local MCP server
  mcp: {
    getState: () => ipcRenderer.invoke('mcp:get-state'),
    getToken: () => ipcRenderer.invoke('mcp:get-token'),
    update: (patch) => ipcRenderer.invoke('mcp:update', patch),
    regenerateToken: () => ipcRenderer.invoke('mcp:regenerate-token'),
    retry: () => ipcRenderer.invoke('mcp:retry'),
    onState: (callback) => {
      const listener = (_: Electron.IpcRendererEvent, state: McpPublicState) => callback(state);
      ipcRenderer.on('mcp:state', listener);
      return () => ipcRenderer.removeListener('mcp:state', listener);
    },
  },

  // Emulators (AVD manager)
  emulators: {
    getSetup: (force) => ipcRenderer.invoke('emulators:setup', force),
    list: () => ipcRenderer.invoke('emulators:list'),
    start: (name, options) => ipcRenderer.invoke('emulators:start', name, options),
    stop: (name) => ipcRenderer.invoke('emulators:stop', name),
    delete: (name) => ipcRenderer.invoke('emulators:delete', name),
    wipe: (name) => ipcRenderer.invoke('emulators:wipe', name),
    rename: (name, newName) => ipcRenderer.invoke('emulators:rename', name, newName),
    deleteSnapshot: (name, snapshot) => ipcRenderer.invoke('emulators:delete-snapshot', name, snapshot),
    showInFolder: (name) => ipcRenderer.invoke('emulators:show-in-folder', name),
    getDeviceProfiles: (force) => ipcRenderer.invoke('emulators:device-profiles', force),
    getSystemImages: () => ipcRenderer.invoke('emulators:system-images'),
    getAvailableImages: (force) => ipcRenderer.invoke('emulators:available-images', force),
    create: (request) => ipcRenderer.invoke('emulators:create', request),
    installImage: (packageId) => ipcRenderer.invoke('emulators:install-image', packageId),
    getInstallJobs: () => ipcRenderer.invoke('emulators:install-jobs'),
    respondToLicense: (jobId, accept) => ipcRenderer.invoke('emulators:respond-license', jobId, accept),
    cancelInstall: (jobId) => ipcRenderer.invoke('emulators:cancel-install', jobId),
    onBoot: (callback) => {
      const listener = (_: Electron.IpcRendererEvent, progress: BootProgress) => callback(progress);
      ipcRenderer.on('emulators:boot', listener);
      return () => ipcRenderer.removeListener('emulators:boot', listener);
    },
    onInstall: (callback) => {
      const listener = (_: Electron.IpcRendererEvent, job: ImageInstallJob) => callback(job);
      ipcRenderer.on('emulators:install', listener);
      return () => ipcRenderer.removeListener('emulators:install', listener);
    },
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('emulators:changed', listener);
      return () => ipcRenderer.removeListener('emulators:changed', listener);
    },
  },

  // In-app screen mirror
  getMirrorServerStatus: () => ipcRenderer.invoke('mirror:get-server-status'),
  startInAppMirror: (deviceId, options) => ipcRenderer.invoke('mirror:start', deviceId, options),
  stopInAppMirror: (sessionId) => ipcRenderer.invoke('mirror:stop', sessionId),
};

// MessagePorts cannot cross the context bridge; hand them to the page directly.
// (The preload is type-checked without DOM libs, hence the narrow cast.)
const pageWindow = globalThis as unknown as {
  postMessage: (message: unknown, targetOrigin: string, transfer?: unknown[]) => void;
};
ipcRenderer.on('mirror:port', (event, payload: { sessionId: string }) => {
  pageWindow.postMessage({ source: 'adbg-mirror-port', sessionId: payload.sessionId }, '*', event.ports);
});

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
